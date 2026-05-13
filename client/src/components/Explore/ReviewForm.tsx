import { useState } from 'react';
import { useTranslation } from '../../i18n';
import { Star, X } from 'lucide-react';
import { exploreApi } from '../../api/client';

interface ReviewFormProps {
  tripId: number | string;
  onSubmitted: () => void;
  onCancel: () => void;
}

export function ReviewForm({ tripId, onSubmitted, onCancel }: ReviewFormProps) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!content.trim()) {
      setError(t('explore.reviews.contentRequired') || 'Review content is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await exploreApi.createReview(tripId, {
        rating,
        title: title || undefined,
        content: content.trim(),
      });
      onSubmitted();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || t('explore.reviews.submitError') || 'Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-gray-50 space-y-4">
      {/* Rating stars */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('explore.reviews.rating')} *
        </label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className="transition hover:scale-110"
            >
              <Star
                size={24}
                className={star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('explore.reviews.title')}
        </label>
        <input
          type="text"
          maxLength={100}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('explore.reviews.titlePlaceholder') || 'e.g., Amazing trip!'}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      {/* Content */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('explore.reviews.content')} *
        </label>
        <textarea
          maxLength={1000}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={t('explore.reviews.contentPlaceholder') || 'Share your experience...'}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          rows={4}
        />
        <p className="text-xs text-gray-500 mt-1">{content.length}/1000</p>
      </div>

      {error && (
        <div className="bg-red-100 text-red-800 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 text-sm font-medium transition disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading || !content.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('common.submitting') : t('common.submit')}
        </button>
      </div>
    </div>
  );
}
