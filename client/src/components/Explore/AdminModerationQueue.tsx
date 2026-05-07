import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import { ChevronDown, Check, X, AlertCircle } from 'lucide-react';
import { exploreApi } from '../../api/client';
import Modal from '../shared/Modal';

interface Submission {
  id: number;
  trip_id: number;
  status: 'pending' | 'approved' | 'rejected';
  price: number;
  is_published: number;
  version: number;
  descriptions: string;
  community_enabled: number;
  submitted_by: number;
  created_at: string;
  updated_at: string;
  title: string;
  description: string;
  cover_image: string;
  start_date: string;
  end_date: string;
  submitter_name: string;
  submitter_email: string;
  day_count: number;
  place_count: number;
  creator_auto_approved: number;
}

export function AdminModerationQueue() {
  const { t } = useTranslation();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [autoApproveCreator, setAutoApproveCreator] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchSubmissions();
  }, [filter]);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const response = await exploreApi.getAdminSubmissions(filter === 'all' ? undefined : filter);
      setSubmissions(response.submissions);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedSubmission) return;
    setActionLoading(true);
    setActionError(null);

    try {
      await exploreApi.approveSubmission(selectedSubmission.id, { auto_approve: autoApproveCreator });
      setSubmissions(submissions.map(s => s.id === selectedSubmission.id ? { ...s, status: 'approved' } : s));
      setSelectedSubmission(null);
      setAutoApproveCreator(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedSubmission) return;
    setActionLoading(true);
    setActionError(null);

    try {
      await exploreApi.rejectSubmission(selectedSubmission.id, { notes: rejectReason });
      setSubmissions(submissions.map(s => s.id === selectedSubmission.id ? { ...s, status: 'rejected' } : s));
      setSelectedSubmission(null);
      setRejectReason('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredSubmissions = filter === 'all' ? submissions : submissions.filter(s => s.status === filter);

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2 border-b">
        {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              filter === f
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {t(`explore.moderation.${f}`)} ({submissions.filter(s => s.status === (f === 'all' ? s.status : f)).length})
          </button>
        ))}
      </div>

      {/* Submissions list */}
      {loading ? (
        <div className="text-center py-8 text-gray-600">{t('common.loading')}</div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="text-center py-8 text-gray-600">{t('explore.moderation.noSubmissions')}</div>
      ) : (
        <div className="space-y-2">
          {filteredSubmissions.map(submission => (
            <button
              key={submission.id}
              onClick={() => setSelectedSubmission(submission)}
              className="w-full p-4 border rounded-lg hover:bg-gray-50 text-left transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900">{submission.title}</h3>
                  <div className="text-sm text-gray-600 mt-1">
                    <p>Tilago: {submission.submitter_name} ({submission.submitter_email})</p>
                    <p>Päivät: {submission.day_count} | Paikat: {submission.place_count}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded text-sm font-medium ${getStatusColor(submission.status)}`}>
                    {submission.status === 'approved' ? t('explore.moderation.approvedLabel') : submission.status === 'rejected' ? t('explore.moderation.rejectedLabel') : t('explore.moderation.pending')}
                  </span>
                  <ChevronDown size={16} className="text-gray-400" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedSubmission && (
        <Modal
          isOpen={!!selectedSubmission}
          onClose={() => setSelectedSubmission(null)}
          title={t('explore.moderation.reviewSubmission')}
          size="2xl"
        >
          <div className="space-y-4">
            {/* Submission info */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <h3 className="font-medium text-gray-900">{selectedSubmission.title}</h3>
              <p className="text-sm text-gray-600">{selectedSubmission.description}</p>
              <div className="text-xs text-gray-600 pt-2 border-t space-y-1">
                <p><strong>Lähettäjä:</strong> {selectedSubmission.submitter_name} ({selectedSubmission.submitter_email})</p>
                <p><strong>Hinta:</strong> €{(selectedSubmission.price / 100).toFixed(2)}</p>
                <p><strong>Päivät:</strong> {selectedSubmission.day_count} | <strong>Paikat:</strong> {selectedSubmission.place_count}</p>
                <p><strong>Yhteisö käytössä:</strong> {selectedSubmission.community_enabled ? 'Kyllä' : 'Ei'}</p>
                <p><strong>Versio:</strong> {selectedSubmission.version}</p>
              </div>
            </div>

            {actionError && (
              <div className="bg-red-100 text-red-800 p-3 rounded-lg text-sm flex gap-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                {actionError}
              </div>
            )}

            {/* Actions based on status */}
            {selectedSubmission.status === 'pending' && (
              <div className="space-y-3">
                <div>
                  <label className="flex items-center gap-2 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={autoApproveCreator}
                      onChange={e => setAutoApproveCreator(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">{t('explore.moderation.autoApproveCreator')}</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('explore.moderation.rejectReason')}
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder={t('explore.moderation.rejectReasonPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    rows={3}
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Check size={16} />
                    {actionLoading ? t('common.submitting') : t('explore.moderation.approve')}
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <X size={16} />
                    {actionLoading ? t('common.submitting') : t('explore.moderation.reject')}
                  </button>
                </div>
              </div>
            )}

            {selectedSubmission.status === 'approved' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                ✓ {t('explore.moderation.approvedStatus')}
              </div>
            )}

            {selectedSubmission.status === 'rejected' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
                ✗ {t('explore.moderation.rejectedStatus')}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
