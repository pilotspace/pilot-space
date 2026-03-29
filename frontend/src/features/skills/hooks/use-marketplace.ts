/**
 * TanStack Query hooks for marketplace operations.
 * Provides reactive data fetching, caching, and mutations
 * for marketplace listings, reviews, versions, installs, and updates.
 * Source: Phase 055, P55-01
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  type MarketplaceListingCreate,
  type MarketplaceSearchParams,
  type MarketplaceVersionCreate,
  type ReviewCreateRequest,
  marketplaceApi,
} from '@/services/api/marketplace';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const marketplaceKeys = {
  all: ['marketplace'] as const,
  search: (workspaceId: string, params: MarketplaceSearchParams) =>
    ['marketplace', 'search', workspaceId, params] as const,
  listing: (workspaceId: string, listingId: string) =>
    ['marketplace', 'listing', workspaceId, listingId] as const,
  reviews: (workspaceId: string, listingId: string, opts?: { limit?: number; offset?: number }) =>
    ['marketplace', 'reviews', workspaceId, listingId, opts] as const,
  versions: (workspaceId: string, listingId: string) =>
    ['marketplace', 'versions', workspaceId, listingId] as const,
  updates: (workspaceId: string) =>
    ['marketplace', 'updates', workspaceId] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Search/browse marketplace listings with filters and pagination.
 * Keeps previous data while fetching the next page.
 */
export function useMarketplaceSearch(
  workspaceId: string,
  params: MarketplaceSearchParams = {},
) {
  return useQuery({
    queryKey: marketplaceKeys.search(workspaceId, params),
    queryFn: () => marketplaceApi.searchListings(workspaceId, params),
    enabled: !!workspaceId,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

/**
 * Get a single marketplace listing by ID.
 */
export function useMarketplaceListing(
  workspaceId: string,
  listingId: string | undefined,
) {
  return useQuery({
    queryKey: marketplaceKeys.listing(workspaceId, listingId ?? ''),
    queryFn: () => marketplaceApi.getListing(workspaceId, listingId!),
    enabled: !!workspaceId && !!listingId,
    staleTime: 60_000,
  });
}

/**
 * List reviews for a marketplace listing with pagination.
 */
export function useMarketplaceReviews(
  workspaceId: string,
  listingId: string,
  limit?: number,
  offset?: number,
) {
  return useQuery({
    queryKey: marketplaceKeys.reviews(workspaceId, listingId, { limit, offset }),
    queryFn: () => marketplaceApi.listReviews(workspaceId, listingId, limit, offset),
    enabled: !!workspaceId && !!listingId,
    staleTime: 30_000,
  });
}

/**
 * Get version history for a marketplace listing.
 */
export function useMarketplaceVersions(
  workspaceId: string,
  listingId: string,
) {
  return useQuery({
    queryKey: marketplaceKeys.versions(workspaceId, listingId),
    queryFn: () => marketplaceApi.getVersions(workspaceId, listingId),
    enabled: !!workspaceId && !!listingId,
    staleTime: 60_000,
  });
}

/**
 * Check for available updates on installed marketplace templates.
 * Used by sidebar badge to show update count.
 */
export function useMarketplaceUpdates(workspaceId: string) {
  return useQuery({
    queryKey: marketplaceKeys.updates(workspaceId),
    queryFn: () => marketplaceApi.checkUpdates(workspaceId),
    enabled: !!workspaceId,
    staleTime: 120_000, // 2 min — updates don't change frequently
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Install a marketplace listing into the workspace.
 * Invalidates listing detail (for download_count) and search results.
 */
export function useInstallListing(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) =>
      marketplaceApi.installListing(workspaceId, listingId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['marketplace', 'listing'] });
      void qc.invalidateQueries({ queryKey: ['marketplace', 'search'] });
    },
  });
}

/**
 * Create or update the current user's review for a listing.
 * Invalidates reviews list and listing detail (for avg_rating update).
 */
export function useSubmitReview(workspaceId: string, listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ReviewCreateRequest) =>
      marketplaceApi.createOrUpdateReview(workspaceId, listingId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['marketplace', 'reviews', workspaceId, listingId] });
      void qc.invalidateQueries({ queryKey: ['marketplace', 'listing', workspaceId, listingId] });
    },
  });
}

/**
 * Apply an update to an installed marketplace template.
 * Invalidates updates list after applying.
 */
export function useApplyUpdate(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      marketplaceApi.applyUpdate(workspaceId, templateId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['marketplace', 'updates'] });
    },
  });
}

/**
 * Publish a workspace skill template to the marketplace (admin only).
 * Invalidates search results after publishing.
 */
export function usePublishListing(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillTemplateId, data }: { skillTemplateId: string; data: MarketplaceListingCreate }) =>
      marketplaceApi.publishListing(workspaceId, skillTemplateId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['marketplace', 'search'] });
    },
  });
}

/**
 * Create a new version for a marketplace listing (admin only).
 * Invalidates version history after creating.
 */
export function useCreateVersion(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, data }: { listingId: string; data: MarketplaceVersionCreate }) =>
      marketplaceApi.createVersion(workspaceId, listingId, data),
    onSuccess: (_result, variables) => {
      void qc.invalidateQueries({ queryKey: ['marketplace', 'versions', workspaceId, variables.listingId] });
    },
  });
}
