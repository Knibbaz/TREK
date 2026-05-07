import { useState, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { Check, X, Mail } from 'lucide-react';
import { apiClient } from '../../api/client';

interface CreatorApplication {
  id: number;
  user_id: number;
  slug: string;
  display_name: string;
  bio?: string;
  avatar?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  username: string;
  email: string;
  user_created_at: string;
  listing_count: number;
}

export function CreatorApplicationQueue() {
  const { t } = useTranslation();
  const [creators, setCreators] = useState<CreatorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState<Record<number, string>>({});

  useEffect(() => {
    loadCreators();
  }, []);

  const loadCreators = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/explore/creators?status=pending');
      setCreators(response.data.creators || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load creators:', err);
      setError('Failed to load creator applications');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (creatorId: number) => {
    setApproving(creatorId);
    try {
      await apiClient.patch(`/admin/explore/creators/${creatorId}/approve`, {
        notes: 'Your creator profile has been approved! You can now publish trips.',
      });
      setCreators(creators.filter(c => c.id !== creatorId));
    } catch (err) {
      console.error('Failed to approve creator:', err);
      setError('Failed to approve creator');
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (creatorId: number) => {
    if (!rejectionReason[creatorId]?.trim()) {
      setError('Please provide a rejection reason');
      return;
    }

    setRejecting(creatorId);
    try {
      await apiClient.patch(`/admin/explore/creators/${creatorId}/reject`, {
        reason: rejectionReason[creatorId],
      });
      setCreators(creators.filter(c => c.id !== creatorId));
      setRejectionReason(prev => {
        const updated = { ...prev };
        delete updated[creatorId];
        return updated;
      });
    } catch (err) {
      console.error('Failed to reject creator:', err);
      setError('Failed to reject creator');
    } finally {
      setRejecting(null);
    }
  };

  if (loading) {
    return <div className="text-center py-8">{t('common.loading')}</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        {error}
      </div>
    );
  }

  if (creators.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center text-gray-600">
        No pending creator applications
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {creators.map(creator => (
        <div
          key={creator.id}
          className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex gap-4">
            {creator.avatar && (
              <img
                src={creator.avatar}
                alt={creator.display_name}
                className="w-16 h-16 rounded-full object-cover"
              />
            )}
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-lg">{creator.display_name}</h3>
                  <p className="text-sm text-gray-600">@{creator.slug}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {creator.username} ({creator.email})
                  </p>
                  <p className="text-xs text-gray-500">
                    Applied: {new Date(creator.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {creator.listing_count} listings
                </span>
              </div>

              {creator.bio && (
                <p className="text-sm text-gray-700 mt-3 italic">"{creator.bio}"</p>
              )}

              {/* Rejection reason input */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rejection reason (if applicable):
                </label>
                <textarea
                  value={rejectionReason[creator.id] || ''}
                  onChange={e => setRejectionReason(prev => ({
                    ...prev,
                    [creator.id]: e.target.value,
                  }))}
                  placeholder="Explain why you're rejecting this application..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => handleApprove(creator.id)}
                  disabled={approving === creator.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <Check size={16} />
                  {approving === creator.id ? 'Approving...' : 'Approve'}
                </button>
                <button
                  onClick={() => handleReject(creator.id)}
                  disabled={rejecting === creator.id || !rejectionReason[creator.id]?.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <X size={16} />
                  {rejecting === creator.id ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
