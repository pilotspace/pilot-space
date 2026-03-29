/**
 * Marketplace API client.
 * CRUD operations for workspace-scoped marketplace listings, versions,
 * reviews, installs, and updates.
 * Source: Phase 055, P55-01
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarketplaceListingResponse {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  longDescription?: string | null;
  author: string;
  icon: string;
  category: string;
  tags: string[];
  version: string;
  downloadCount: number;
  avgRating?: number | null;
  screenshots?: string[] | null;
  graphData?: Record<string, unknown> | null;
  publishedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceListingCreate {
  name: string;
  description: string;
  longDescription?: string | null;
  author: string;
  category: string;
  version: string;
  icon?: string;
  tags: string[];
  screenshots?: string[] | null;
  graphData?: Record<string, unknown> | null;
}

export interface MarketplaceVersionCreate {
  version: string;
  skillContent: string;
  changelog?: string | null;
  graphData?: Record<string, unknown> | null;
}

export interface MarketplaceVersionResponse {
  id: string;
  listingId: string;
  version: string;
  skillContent: string;
  changelog?: string | null;
  graphData?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceSearchResponse {
  items: MarketplaceListingResponse[];
  total: number;
  hasNext: boolean;
}

export interface MarketplaceSearchParams {
  query?: string;
  category?: string;
  minRating?: number;
  sort?: 'popular' | 'newest' | 'top_rated';
  limit?: number;
  offset?: number;
}

export interface ReviewCreateRequest {
  rating: number;
  reviewText?: string | null;
}

export interface ReviewResponse {
  id: string;
  listingId: string;
  userId: string;
  rating: number;
  reviewText?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewListResponse {
  items: ReviewResponse[];
  total: number;
  hasNext: boolean;
}

export interface InstallResponse {
  skillTemplateId: string;
  alreadyInstalled: boolean;
}

export interface UpdateCheckResponse {
  templateId: string;
  templateName: string;
  installedVersion: string;
  availableVersion: string;
  listingId: string;
}

export interface UpdateApplyResponse {
  updated: boolean;
  newVersion: string;
  templateId: string;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export const marketplaceApi = {
  /**
   * Search/browse marketplace listings with optional filters.
   * GET /{workspace_id}/marketplace/listings
   */
  searchListings(
    workspaceId: string,
    params: MarketplaceSearchParams = {},
  ): Promise<MarketplaceSearchResponse> {
    const searchParams = new URLSearchParams();
    if (params.query) searchParams.set('query', params.query);
    if (params.category) searchParams.set('category', params.category);
    if (params.minRating != null) searchParams.set('min_rating', String(params.minRating));
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.limit != null) searchParams.set('limit', String(params.limit));
    if (params.offset != null) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    const url = `/workspaces/${workspaceId}/marketplace/listings${qs ? `?${qs}` : ''}`;
    return apiClient.get<MarketplaceSearchResponse>(url);
  },

  /**
   * Get a single marketplace listing by ID.
   * GET /{workspace_id}/marketplace/listings/{id}
   */
  getListing(
    workspaceId: string,
    listingId: string,
  ): Promise<MarketplaceListingResponse> {
    return apiClient.get<MarketplaceListingResponse>(
      `/workspaces/${workspaceId}/marketplace/listings/${listingId}`,
    );
  },

  /**
   * Publish a workspace skill template to the marketplace (admin only).
   * POST /{workspace_id}/marketplace/listings?skill_template_id=X
   */
  publishListing(
    workspaceId: string,
    skillTemplateId: string,
    data: MarketplaceListingCreate,
  ): Promise<MarketplaceListingResponse> {
    return apiClient.post<MarketplaceListingResponse>(
      `/workspaces/${workspaceId}/marketplace/listings?skill_template_id=${skillTemplateId}`,
      data,
    );
  },

  /**
   * Create a new version for a marketplace listing (admin only).
   * POST /{workspace_id}/marketplace/listings/{id}/versions
   */
  createVersion(
    workspaceId: string,
    listingId: string,
    data: MarketplaceVersionCreate,
  ): Promise<MarketplaceVersionResponse> {
    return apiClient.post<MarketplaceVersionResponse>(
      `/workspaces/${workspaceId}/marketplace/listings/${listingId}/versions`,
      data,
    );
  },

  /**
   * Get all versions of a marketplace listing.
   * GET /{workspace_id}/marketplace/listings/{id}/versions
   */
  getVersions(
    workspaceId: string,
    listingId: string,
  ): Promise<MarketplaceVersionResponse[]> {
    return apiClient.get<MarketplaceVersionResponse[]>(
      `/workspaces/${workspaceId}/marketplace/listings/${listingId}/versions`,
    );
  },

  /**
   * Install a marketplace listing into the workspace.
   * POST /{workspace_id}/marketplace/listings/{id}/install
   */
  installListing(
    workspaceId: string,
    listingId: string,
  ): Promise<InstallResponse> {
    return apiClient.post<InstallResponse>(
      `/workspaces/${workspaceId}/marketplace/listings/${listingId}/install`,
    );
  },

  /**
   * Create or update the current user's review for a listing.
   * POST /{workspace_id}/marketplace/listings/{id}/reviews
   */
  createOrUpdateReview(
    workspaceId: string,
    listingId: string,
    data: ReviewCreateRequest,
  ): Promise<ReviewResponse> {
    return apiClient.post<ReviewResponse>(
      `/workspaces/${workspaceId}/marketplace/listings/${listingId}/reviews`,
      data,
    );
  },

  /**
   * List reviews for a marketplace listing with pagination.
   * GET /{workspace_id}/marketplace/listings/{id}/reviews
   */
  listReviews(
    workspaceId: string,
    listingId: string,
    limit?: number,
    offset?: number,
  ): Promise<ReviewListResponse> {
    const searchParams = new URLSearchParams();
    if (limit != null) searchParams.set('limit', String(limit));
    if (offset != null) searchParams.set('offset', String(offset));
    const qs = searchParams.toString();
    const url = `/workspaces/${workspaceId}/marketplace/listings/${listingId}/reviews${qs ? `?${qs}` : ''}`;
    return apiClient.get<ReviewListResponse>(url);
  },

  /**
   * Check for available updates on installed marketplace templates.
   * GET /{workspace_id}/marketplace/updates
   */
  checkUpdates(workspaceId: string): Promise<UpdateCheckResponse[]> {
    return apiClient.get<UpdateCheckResponse[]>(
      `/workspaces/${workspaceId}/marketplace/updates`,
    );
  },

  /**
   * Update an installed marketplace template to the latest version.
   * POST /{workspace_id}/marketplace/installed/{id}/update
   */
  applyUpdate(
    workspaceId: string,
    templateId: string,
  ): Promise<UpdateApplyResponse> {
    return apiClient.post<UpdateApplyResponse>(
      `/workspaces/${workspaceId}/marketplace/installed/${templateId}/update`,
    );
  },
};
