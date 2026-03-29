'use client';

/**
 * ReviewSection - Reviews list with star rating form and summary stats.
 *
 * Layout:
 * 1. Review submission form (star selector + textarea)
 * 2. Summary stats (average rating, distribution bars)
 * 3. Reviews list with pagination
 *
 * Source: Phase 055, P55-03
 */

import { useCallback, useMemo, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useMarketplaceReviews,
  useSubmitReview,
} from '@/features/skills/hooks/use-marketplace';
import type { ReviewResponse } from '@/services/api/marketplace';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReviewSectionProps {
  listingId: string;
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Interactive Star Selector
// ---------------------------------------------------------------------------

function StarSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (rating: number) => void;
}) {
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const displayValue = hoveredStar ?? value ?? 0;

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          className="p-0.5 transition-transform hover:scale-110"
          onMouseEnter={() => setHoveredStar(i)}
          onMouseLeave={() => setHoveredStar(null)}
          onClick={() => onChange(i)}
        >
          <Star
            className={
              i <= displayValue
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground/30 hover:text-amber-300'
            }
            size={24}
          />
        </button>
      ))}
      {value && (
        <span className="ml-2 text-sm text-muted-foreground">
          {value} star{value !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Star Rating Display (read-only)
// ---------------------------------------------------------------------------

function StarRatingDisplay({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={i <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}
          size={size}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rating Distribution Bar
// ---------------------------------------------------------------------------

function RatingDistribution({ reviews }: { reviews: ReviewResponse[] }) {
  const distribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0]; // index 0 = 1 star, index 4 = 5 stars
    for (const r of reviews) {
      const idx = r.rating - 1;
      if (idx >= 0 && idx < 5) {
        counts[idx] = (counts[idx] ?? 0) + 1;
      }
    }
    const max = Math.max(...counts, 1);
    return counts.map((count, i) => ({
      stars: i + 1,
      count,
      pct: Math.round((count / max) * 100),
    }));
  }, [reviews]);

  const avgRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return sum / reviews.length;
  }, [reviews]);

  return (
    <div className="flex items-start gap-8">
      {/* Large average */}
      <div className="text-center">
        <p className="text-4xl font-bold">{avgRating.toFixed(1)}</p>
        <StarRatingDisplay rating={avgRating} size={16} />
        <p className="mt-1 text-xs text-muted-foreground">
          {reviews.length} review{reviews.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Distribution bars */}
      <div className="flex-1 space-y-1.5">
        {[...distribution].reverse().map(({ stars, count, pct }) => (
          <div key={stars} className="flex items-center gap-2 text-sm">
            <span className="w-8 text-right text-muted-foreground">{stars}</span>
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-6 text-xs text-muted-foreground">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Relative Time Helper
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Review Card
// ---------------------------------------------------------------------------

function ReviewCard({ review }: { review: ReviewResponse }) {
  const initials = review.userId.slice(0, 2).toUpperCase();

  return (
    <div className="flex gap-3 py-4">
      {/* Avatar placeholder */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {initials}
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <StarRatingDisplay rating={review.rating} size={12} />
          <span className="text-xs text-muted-foreground">
            {relativeTime(review.createdAt)}
          </span>
        </div>
        {review.reviewText && (
          <p className="text-sm text-muted-foreground">{review.reviewText}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function ReviewSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const REVIEWS_PER_PAGE = 10;

export function ReviewSection({ listingId, workspaceId }: ReviewSectionProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useMarketplaceReviews(
    workspaceId,
    listingId,
    REVIEWS_PER_PAGE,
    offset,
  );
  const submitReview = useSubmitReview(workspaceId, listingId);

  const handleSubmit = useCallback(async () => {
    if (!rating) return;
    try {
      await submitReview.mutateAsync({
        rating,
        reviewText: reviewText.trim() || null,
      });
      setRating(null);
      setReviewText('');
      toast.success('Review submitted');
    } catch {
      toast.error('Failed to submit review');
    }
  }, [rating, reviewText, submitReview]);

  const handleLoadMore = useCallback(() => {
    setOffset((prev) => prev + REVIEWS_PER_PAGE);
  }, []);

  const reviews = data?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Review form */}
      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Write a review</p>
        <StarSelector value={rating} onChange={setRating} />
        <Textarea
          placeholder="Share your experience..."
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          rows={3}
          className="resize-none"
        />
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!rating || submitReview.isPending}
        >
          {submitReview.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Review
        </Button>
      </div>

      <Separator />

      {/* Summary stats */}
      {reviews.length > 0 && (
        <>
          <RatingDistribution reviews={reviews} />
          <Separator />
        </>
      )}

      {/* Reviews list */}
      {isLoading ? (
        <ReviewSkeleton />
      ) : reviews.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No reviews yet. Be the first to review!
        </p>
      ) : (
        <div className="divide-y">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      {/* Load more */}
      {data?.hasNext && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={handleLoadMore}>
            Load more reviews
          </Button>
        </div>
      )}
    </div>
  );
}
