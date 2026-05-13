import { useState } from 'react';
import { useTranslation } from '../../i18n';
import { Send, AlertCircle } from 'lucide-react';
import Modal from '../shared/Modal';
import { exploreApi } from '../../api/client';

interface Trip {
  id: number;
  title: string;
}

interface PublishUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip | null;
  onUpdatePublished: () => void;
}

export function PublishUpdateModal({ isOpen, onClose, trip, onUpdatePublished }: PublishUpdateModalProps) {
  const { t } = useTranslation();
  const [changelog, setChangelog] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushDirect, setPushDirect] = useState(true); // true = push direct, false = request review

  const handlePublish = async () => {
    if (!trip) return;
    setError(null);
    setLoading(true);

    try {
      if (pushDirect) {
        // Direct update
        await exploreApi.pushUpdate(trip.id, changelog);
      } else {
        // Resubmit for review
        await exploreApi.resubmitForReview(trip.id, changelog);
      }

      onUpdatePublished();
      setChangelog('');
      setPushDirect(true);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish update');
    } finally {
      setLoading(false);
    }
  };

  if (!trip) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('explore.publishUpdate') || 'Publish Update'}>
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
          <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">{t('explore.updateMode') || 'Choose how to publish your changes'}</p>
        </div>

        <div className="space-y-2">
          <label className="flex gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50" style={{ borderColor: pushDirect ? '#3b82f6' : '#d1d5db', backgroundColor: pushDirect ? '#eff6ff' : 'transparent' }}>
            <input
              type="radio"
              checked={pushDirect}
              onChange={() => setPushDirect(true)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="font-medium text-sm">{t('explore.pushDirect') || 'Push Update Direct'}</div>
              <p className="text-xs text-gray-600">{t('explore.pushDirectDesc') || 'Updates go live immediately to all copies'}</p>
            </div>
          </label>

          <label className="flex gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50" style={{ borderColor: !pushDirect ? '#3b82f6' : '#d1d5db', backgroundColor: !pushDirect ? '#eff6ff' : 'transparent' }}>
            <input
              type="radio"
              checked={!pushDirect}
              onChange={() => setPushDirect(false)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="font-medium text-sm">{t('explore.requestReview') || 'Request Admin Review'}</div>
              <p className="text-xs text-gray-600">{t('explore.requestReviewDesc') || 'Submit for admin approval (optional, for major changes)'}</p>
            </div>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('explore.changelogMessage') || 'What changed?'}
          </label>
          <textarea
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            placeholder={t('explore.changelogPlaceholder') || 'E.g., Added 3 new restaurants, updated opening hours...'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={4}
          />
          <p className="text-xs text-gray-500 mt-1">{t('explore.changelogOptional') || 'Optional - helps buyers understand what\'s new'}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {t('common.cancel') || 'Cancel'}
          </button>
          <button
            onClick={handlePublish}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Send size={14} />
            {loading ? (t('common.publishing') || 'Publishing...') : (t('explore.publish') || 'Publish')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
