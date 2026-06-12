import { useState } from 'react';
import { useTranslation } from '../../i18n';
import { Star, ThumbsUp, ThumbsDown, Trash2 } from 'lucide-react';
import { exploreApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Review {
  id: number;
  user_id: number;
  username: string;
  avatar?: string;
  rating: number;
  title?: string;
  content: string;
  helpful_count: number;
  unhelpful_count: number;
  current_helpful?: number;
  current_unhelpful?: number;
  created_at: string;
}

interface ReviewsListProps {
  tripId: number | string;
  reviews: Review[];
  averageRating: number;
  reviewCount: number;
  sortBy: 'recent' | 'helpful' | 'rating_high' | 'rating_low';
  onSortChange: (sort: 'recent' | 'helpful' | 'rating_high' | 'rating_low') => void;
  onReviewDeleted: () => void;
}

export function ReviewsList({
  tripId,
  reviews,
  averageRating,
  reviewCount,
  sortBy,
  onSortChange,
  onReviewDeleted,
}: ReviewsListProps) {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [voting, setVoting] = useState<Record<number, boolean>>({});
  const [deleting, setDeleting] = useState<number | null>(null);

  const handleHelpful = async (reviewId: number, isHelpful: boolean) => {
    setVoting(prev => ({ ...prev, [reviewId]: true }));
    try {
      await exploreApi.markReviewHelpful(reviewId, isHelpful);
      // Optimistically update UI
      const review = reviews.find(r => r.id === reviewId);
      if (review) {
        if (isHelpful) {
          review.helpful_count = (review.helpful_count || 0) + 1;
        } else {
          review.unhelpful_count = (review.unhelpful_count || 0) + 1;
        }
      }
    } catch (err) {
      console.error('Failed to vote:', err);
    } finally {
      setVoting(prev => ({ ...prev, [reviewId]: false }));
    }
  };

  const handleDelete = async (reviewId: number) => {
    if (!confirm(t('explore.reviews.deleteConfirm') || 'Delete this review?')) return;

    setDeleting(reviewId);
    try {
      await exploreApi.deleteReview(reviewId);
      onReviewDeleted();
    } catch (err) {
      console.error('Failed to delete review:', err);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Rating summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-end gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">{averageRating.toFixed(1)}</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(star => (
                  <Star
                    key={star}
                    size={16}
                    className={star <= Math.round(averageRating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                  />
                ))}
              </div>
            </div>
            <p className="text-sm text-gray-600">{reviewCount} {t('explore.reviews.reviewsCount')}</p>
          </div>
          <div className="flex gap-2 ml-auto">
            {(['recent', 'helpful', 'rating_high', 'rating_low'] as const).map(sort => (
              <button
                key={sort}
                onClick={() => onSortChange(sort)}
                className={`px-3 py-1 rounded text-sm font-medium transition ${
                  sortBy === sort
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t(`explore.reviews.sort_${sort}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reviews list */}
      <div className="space-y-3">
        {reviews.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {t('explore.reviews.noReviews')}
          </div>
        ) : (
          reviews.map(review => (
            <div key={review.id} className="border rounded-lg p-4 hover:bg-gray-50 transition">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-start gap-3 flex-1">
                  {review.avatar && (
                    <img src={review.avatar} alt={review.username} className="w-10 h-10 rounded-full" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{review.username}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star
                            key={star}
                            size={14}
                            className={star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-gray-500">
                        {new Date(review.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
                {user && user.id === review.user_id && (
                  <button
                    onClick={() => handleDelete(review.id)}
                    disabled={deleting === review.id}
                    className="text-gray-400 hover:text-red-600 transition disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              {/* Content */}
              {review.title && <p className="font-medium text-gray-900 mb-1">{review.title}</p>}
              <p className="text-sm text-gray-600 mb-3">{review.content}</p>

              {/* Footer */}
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => handleHelpful(review.id, true)}
                    disabled={voting[review.id]}
                    className="flex items-center gap-1 px-3 py-1 rounded text-sm text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
                  >
                    <ThumbsUp size={14} />
                    <span>{review.helpful_count || 0}</span>
                  </button>
                  <button
                    onClick={() => handleHelpful(review.id, false)}
                    disabled={voting[review.id]}
                    className="flex items-center gap-1 px-3 py-1 rounded text-sm text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
                  >
                    <ThumbsDown size={14} />
                    <span>{review.unhelpful_count || 0}</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
