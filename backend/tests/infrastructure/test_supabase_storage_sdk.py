"""Tests for SupabaseStorageClient SDK migration.

Verifies that the storage client correctly delegates to the supabase-py
SDK's storage3 API and properly maps SDK exceptions to domain exceptions.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from pilot_space.infrastructure.storage.client import (
    StorageDeleteError,
    StorageSignedUrlError,
    StorageUploadError,
    SupabaseStorageClient,
    SupabaseStorageError,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_sdk_client(
    upload_result=None,
    signed_url_result=None,
    remove_result=None,
    upload_raises=None,
    signed_url_raises=None,
    remove_raises=None,
) -> MagicMock:
    """Build a mock AsyncClient with the storage chain pre-wired."""
    from storage3.types import UploadResponse

    bucket_proxy = AsyncMock()

    # upload
    if upload_raises is not None:
        bucket_proxy.upload = AsyncMock(side_effect=upload_raises)
    else:
        bucket_proxy.upload = AsyncMock(
            return_value=upload_result or UploadResponse(path="key", Key="bucket/key")
        )

    # create_signed_url
    if signed_url_raises is not None:
        bucket_proxy.create_signed_url = AsyncMock(side_effect=signed_url_raises)
    else:
        bucket_proxy.create_signed_url = AsyncMock(
            return_value=signed_url_result
            or {
                "signedURL": "https://example.com/signed",
                "signedUrl": "https://example.com/signed",
            }
        )

    # remove
    if remove_raises is not None:
        bucket_proxy.remove = AsyncMock(side_effect=remove_raises)
    else:
        bucket_proxy.remove = AsyncMock(return_value=remove_result or [{"name": "key"}])

    storage_client = MagicMock()
    storage_client.from_ = MagicMock(return_value=bucket_proxy)

    sdk_client = MagicMock()
    sdk_client.storage = storage_client

    return sdk_client


# ---------------------------------------------------------------------------
# Exception hierarchy
# ---------------------------------------------------------------------------


def test_exception_hierarchy() -> None:
    assert issubclass(StorageUploadError, SupabaseStorageError)
    assert issubclass(StorageSignedUrlError, SupabaseStorageError)
    assert issubclass(StorageDeleteError, SupabaseStorageError)


# ---------------------------------------------------------------------------
# upload_object
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_object_calls_sdk_with_correct_args() -> None:
    sdk_client = _make_sdk_client()
    client = SupabaseStorageClient(client=sdk_client)

    result = await client.upload_object("my-bucket", "folder/file.pdf", b"data", "application/pdf")

    assert result == "folder/file.pdf"
    sdk_client.storage.from_.assert_called_once_with("my-bucket")
    bucket_proxy = sdk_client.storage.from_.return_value
    bucket_proxy.upload.assert_awaited_once_with(
        "folder/file.pdf",
        b"data",
        {"content-type": "application/pdf", "x-upsert": "true"},
    )


@pytest.mark.asyncio
async def test_upload_object_wraps_storage_api_error() -> None:
    from storage3.exceptions import StorageApiError

    exc = StorageApiError("Upload denied", "AccessDenied", 403)
    sdk_client = _make_sdk_client(upload_raises=exc)
    client = SupabaseStorageClient(client=sdk_client)

    with pytest.raises(StorageUploadError, match="Upload failed"):
        await client.upload_object("bucket", "key", b"x", "text/plain")


@pytest.mark.asyncio
async def test_upload_object_wraps_storage_exception() -> None:
    from storage3.utils import StorageException

    exc = StorageException("Storage error")
    sdk_client = _make_sdk_client(upload_raises=exc)
    client = SupabaseStorageClient(client=sdk_client)

    with pytest.raises(StorageUploadError):
        await client.upload_object("bucket", "key", b"x", "text/plain")


@pytest.mark.asyncio
async def test_upload_object_wraps_generic_exception() -> None:
    sdk_client = _make_sdk_client(upload_raises=RuntimeError("unexpected"))
    client = SupabaseStorageClient(client=sdk_client)

    with pytest.raises(StorageUploadError, match="Unexpected error"):
        await client.upload_object("bucket", "key", b"x", "text/plain")


# ---------------------------------------------------------------------------
# get_signed_url
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_signed_url_returns_full_url() -> None:
    expected_url = (
        "https://supabase.example.com/storage/v1/object/sign/my-bucket/file.pdf?token=abc"
    )
    sdk_client = _make_sdk_client(
        signed_url_result={"signedURL": expected_url, "signedUrl": expected_url}
    )
    client = SupabaseStorageClient(client=sdk_client)

    result = await client.get_signed_url("my-bucket", "file.pdf", expires_in=1800)

    assert result == expected_url
    sdk_client.storage.from_.assert_called_once_with("my-bucket")
    bucket_proxy = sdk_client.storage.from_.return_value
    bucket_proxy.create_signed_url.assert_awaited_once_with("file.pdf", 1800)


@pytest.mark.asyncio
async def test_get_signed_url_uses_signed_url_key_fallback() -> None:
    """SDK may return signedUrl (camelCase) — ensure both keys are accepted."""
    sdk_client = _make_sdk_client(
        signed_url_result={"signedUrl": "https://example.com/signed", "signedURL": None}
    )
    client = SupabaseStorageClient(client=sdk_client)

    result = await client.get_signed_url("bucket", "key")
    assert result == "https://example.com/signed"


@pytest.mark.asyncio
async def test_get_signed_url_raises_when_field_missing() -> None:
    sdk_client = _make_sdk_client(signed_url_result={"signedURL": None, "signedUrl": None})
    client = SupabaseStorageClient(client=sdk_client)

    with pytest.raises(StorageSignedUrlError, match="missing 'signedURL' field"):
        await client.get_signed_url("bucket", "key")


@pytest.mark.asyncio
async def test_get_signed_url_wraps_storage_api_error() -> None:
    from storage3.exceptions import StorageApiError

    exc = StorageApiError("Not found", "NotFound", 404)
    sdk_client = _make_sdk_client(signed_url_raises=exc)
    client = SupabaseStorageClient(client=sdk_client)

    with pytest.raises(StorageSignedUrlError, match="Signed URL generation failed"):
        await client.get_signed_url("bucket", "key")


# ---------------------------------------------------------------------------
# delete_object
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_object_calls_sdk_remove_with_list() -> None:
    sdk_client = _make_sdk_client()
    client = SupabaseStorageClient(client=sdk_client)

    await client.delete_object("bucket", "some/file.pdf")

    sdk_client.storage.from_.assert_called_once_with("bucket")
    bucket_proxy = sdk_client.storage.from_.return_value
    bucket_proxy.remove.assert_awaited_once_with(["some/file.pdf"])


@pytest.mark.asyncio
async def test_delete_object_404_treated_as_success() -> None:
    """A 404-equivalent StorageApiError should NOT raise — object was already absent."""
    from storage3.exceptions import StorageApiError

    exc = StorageApiError("Object not found", "NotFound", 404)
    exc.status = 404
    sdk_client = _make_sdk_client(remove_raises=exc)
    client = SupabaseStorageClient(client=sdk_client)

    # Should not raise
    await client.delete_object("bucket", "missing-key")


@pytest.mark.asyncio
async def test_delete_object_not_found_message_treated_as_success() -> None:
    """StorageApiError with 'not found' in message also treated as success."""
    from storage3.exceptions import StorageApiError

    exc = StorageApiError("Object does not exist", "ObjectNotFound", 404)
    sdk_client = _make_sdk_client(remove_raises=exc)
    client = SupabaseStorageClient(client=sdk_client)

    await client.delete_object("bucket", "key")


@pytest.mark.asyncio
async def test_delete_object_wraps_storage_api_error() -> None:
    from storage3.exceptions import StorageApiError

    exc = StorageApiError("Access denied", "AccessDenied", 403)
    sdk_client = _make_sdk_client(remove_raises=exc)
    client = SupabaseStorageClient(client=sdk_client)

    with pytest.raises(StorageDeleteError, match="Delete failed"):
        await client.delete_object("bucket", "key")


@pytest.mark.asyncio
async def test_delete_object_wraps_generic_exception() -> None:
    sdk_client = _make_sdk_client(remove_raises=RuntimeError("network error"))
    client = SupabaseStorageClient(client=sdk_client)

    with pytest.raises(StorageDeleteError):
        await client.delete_object("bucket", "key")


# ---------------------------------------------------------------------------
# Lazy SDK client initialisation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_lazy_client_init_calls_get_supabase_client() -> None:
    """When no client is provided, _get_client() calls get_supabase_client()."""
    import pilot_space.infrastructure.supabase_client as supabase_client_mod

    sdk_client = _make_sdk_client()

    mock_get = AsyncMock(return_value=sdk_client)

    original = supabase_client_mod.get_supabase_client
    try:
        supabase_client_mod.get_supabase_client = mock_get  # type: ignore[assignment]
        client = SupabaseStorageClient()  # no client arg
        await client.upload_object("b", "k", b"data", "text/plain")
    finally:
        supabase_client_mod.get_supabase_client = original  # type: ignore[assignment]

    mock_get.assert_awaited_once()
