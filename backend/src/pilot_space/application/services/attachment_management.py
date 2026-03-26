"""Attachment management service.

Extracts business logic from ai_attachments.py router:
- Quota checking for uploads (guest check, storage quota)
- Extraction result building (OCR + Office extraction + chunking)
- Document ingest enqueue logic

The router retains only HTTP concerns: file upload parsing, MIME validation,
response construction, and header injection.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pilot_space.domain.exceptions import ForbiddenError, NotFoundError
from pilot_space.infrastructure.database.models.chat_attachment import ChatAttachment
from pilot_space.infrastructure.database.models.workspace_member import (
    WorkspaceMember,
    WorkspaceRole,
)
from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)


class StorageQuotaExceededError(ForbiddenError):
    """Raised when workspace storage quota is exceeded (HTTP 507 mapped in router)."""

    error_code = "storage_quota_exceeded"
    http_status = 507


class AttachmentManagementService:
    """Handles attachment business logic: quota, extraction, ingest.

    The existing AttachmentUploadService handles the actual file upload and
    storage persistence. This service adds the orchestration layer: guest
    checks, quota enforcement, extraction result building, and document
    ingest enqueue.
    """

    def __init__(self, session: AsyncSession, storage_client: Any = None) -> None:
        self._session = session
        self._storage_client = storage_client

    # ------------------------------------------------------------------
    # GUEST CHECK
    # ------------------------------------------------------------------

    async def check_guest_restriction(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> None:
        """Verify the user is not a guest (guests cannot upload).

        Raises:
            ForbiddenError: If the user has GUEST role.
        """
        result = await self._session.execute(
            select(WorkspaceMember.role).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
        role = result.scalar()
        if role == WorkspaceRole.GUEST:
            raise ForbiddenError(
                "Guests cannot upload attachments", error_code="GUEST_NOT_ALLOWED"
            )

    # ------------------------------------------------------------------
    # QUOTA CHECK
    # ------------------------------------------------------------------

    async def check_storage_quota(
        self,
        workspace_id: UUID,
        file_bytes: int,
    ) -> float | None:
        """Check storage quota and return warning percentage if near limit.

        Returns:
            Warning percentage (float) if nearing quota, None otherwise.

        Raises:
            StorageQuotaExceededError: If quota would be exceeded.
        """
        from pilot_space.api.v1.routers.workspace_quota import (
            _check_storage_quota,  # pyright: ignore[reportPrivateUsage]
        )

        quota_ok, warning_pct = await _check_storage_quota(
            self._session, workspace_id, file_bytes
        )
        if not quota_ok:
            raise StorageQuotaExceededError("Storage quota exceeded")
        return warning_pct

    async def update_storage_usage(
        self,
        workspace_id: UUID,
        file_bytes: int,
    ) -> None:
        """Update storage usage counters after successful upload."""
        from pilot_space.api.v1.routers.workspace_quota import (
            _update_storage_usage,  # pyright: ignore[reportPrivateUsage]
        )

        try:
            await _update_storage_usage(self._session, workspace_id, file_bytes)
        except Exception:
            logger.warning("storage_usage_update_failed", workspace_id=str(workspace_id))

    # ------------------------------------------------------------------
    # SIGNED URL
    # ------------------------------------------------------------------

    async def get_signed_url(
        self,
        attachment_id: UUID,
        user_id: UUID,
    ) -> dict[str, str | int]:
        """Get a 1-hour signed download URL for a chat attachment.

        Only the owning user can generate signed URLs.

        Raises:
            NotFoundError: Attachment not found.
            ForbiddenError: User does not own the attachment.
        """
        result = await self._session.execute(
            select(ChatAttachment).where(ChatAttachment.id == attachment_id)
        )
        attachment = result.scalar_one_or_none()
        if attachment is None:
            raise NotFoundError("Attachment not found")
        if attachment.user_id != user_id:
            raise ForbiddenError("Not your attachment")

        signed_url = await self._storage_client.get_signed_url(
            bucket="chat-attachments",
            key=attachment.storage_key,
            expires_in=3600,
        )
        return {"url": signed_url, "expiresIn": 3600}

    # ------------------------------------------------------------------
    # EXTRACTION RESULT
    # ------------------------------------------------------------------

    async def get_extraction_result(
        self,
        attachment_id: UUID,
        attachment_repo: Any,
    ) -> Any:
        """Return extraction metadata and pre-chunked content for an attachment.

        Reads from OCR results and Office extraction cache. Returns
        extraction_source="none" when extraction has not yet run.

        Raises:
            NotFoundError: Attachment not found or expired.
        """
        from pilot_space.api.v1.schemas.attachments import (
            ExtractionChunk,
            ExtractionMetadata,
            ExtractionResultResponse,
        )
        from pilot_space.application.services.note.markdown_chunker import (
            chunk_markdown_by_headings,
        )
        from pilot_space.infrastructure.database.models.ocr_result import OcrResultModel

        attachment = await attachment_repo.get_by_id(attachment_id)
        if attachment is None:
            raise NotFoundError("Attachment not found or expired")

        extracted_text: str | None = None
        extraction_source = "none"
        confidence: float | None = None
        language: str | None = None
        provider_name: str | None = None
        tables: list[str] = []

        ocr_row = await self._session.execute(
            select(OcrResultModel)
            .where(OcrResultModel.attachment_id == attachment_id)
            .order_by(OcrResultModel.created_at.desc())
            .limit(1)
        )
        ocr_result = ocr_row.scalar()
        if ocr_result and ocr_result.extracted_text:
            extracted_text = ocr_result.extracted_text
            extraction_source = "ocr"
            confidence = ocr_result.confidence
            language = ocr_result.language
            provider_name = ocr_result.provider_used
            if ocr_result.tables_json:
                raw_tables = ocr_result.tables_json.get("tables")
                if isinstance(raw_tables, list):
                    tables = [str(t) for t in raw_tables]
        elif attachment.extracted_text:
            extracted_text = attachment.extracted_text
            extraction_source = "office"

        extraction_chunks: list[ExtractionChunk] = []
        word_count: int | None = None
        if extracted_text:
            word_count = len(extracted_text.split())
            raw_chunks = chunk_markdown_by_headings(
                extracted_text,
                min_chunk_chars=50,
                max_chunk_chars=2000,
                overlap_chars=100,
            )
            extraction_chunks = [
                ExtractionChunk(
                    chunk_index=c.chunk_index,
                    heading=c.heading or "",
                    content=c.content,
                    char_count=len(c.content),
                    token_count=c.token_count,
                    heading_hierarchy=list(c.heading_hierarchy)
                    if c.heading_hierarchy
                    else [],
                )
                for c in raw_chunks
            ]

        return ExtractionResultResponse(
            attachment_id=attachment_id,
            extracted_text=extracted_text,
            metadata=ExtractionMetadata(
                extraction_source=extraction_source,
                confidence=confidence,
                language=language,
                word_count=word_count,
                provider_name=provider_name,
            ),
            chunks=extraction_chunks,
            tables=tables,
        )

    # ------------------------------------------------------------------
    # DOCUMENT INGEST
    # ------------------------------------------------------------------

    async def ingest_document(
        self,
        attachment_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        excluded_chunk_indices: list[int],
        attachment_repo: Any,
        queue_client: Any,
    ) -> dict[str, str]:
        """Enqueue the document for KG ingestion with optional chunk adjustments.

        Raises:
            NotFoundError: Attachment not found or expired.
        """
        from pilot_space.ai.workers.memory_worker import TASK_DOCUMENT_INGESTION
        from pilot_space.infrastructure.queue.models import QueueName

        attachment = await attachment_repo.get_by_id(attachment_id)
        if attachment is None:
            raise NotFoundError("Attachment not found or expired")

        payload = {
            "task_type": TASK_DOCUMENT_INGESTION,
            "workspace_id": str(workspace_id),
            "project_id": str(project_id),
            "attachment_id": str(attachment_id),
            "excluded_chunk_indices": excluded_chunk_indices,
        }

        try:
            if queue_client:
                await queue_client.enqueue(QueueName.AI_NORMAL, payload)
                logger.info(
                    "document_ingest_enqueued",
                    attachment_id=str(attachment_id),
                    workspace_id=str(workspace_id),
                    excluded_chunks=len(excluded_chunk_indices),
                )
            else:
                logger.warning(
                    "document_ingest_queue_unavailable",
                    attachment_id=str(attachment_id),
                )
        except Exception:
            logger.warning(
                "document_ingest_enqueue_failed",
                attachment_id=str(attachment_id),
                exc_info=True,
            )

        return {"status": "queued", "attachment_id": str(attachment_id)}
