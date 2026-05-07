import { useState, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import Modal from '../shared/Modal';
import { exploreApi } from '../../api/client';

interface CreatorApplicationFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreatorApplicationForm({ isOpen, onClose, onSuccess }: CreatorApplicationFormProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugAvailable, setSlugAvailable] = useState(true);
  const [checkingSlug, setCheckingSlug] = useState(false);

  const [formData, setFormData] = useState({
    display_name: '',
    slug: '',
    bio: '',
    avatar: '',
    social_links: {
      instagram: '',
      twitter: '',
      website: '',
    },
  });

  // Generate slug suggestion when display_name changes
  useEffect(() => {
    if (step === 1 && formData.display_name) {
      const suggested = formData.display_name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 30);

      if (!formData.slug || formData.slug === '') {
        setFormData(prev => ({ ...prev, slug: suggested }));
      }
    }
  }, [formData.display_name, step]);

  // Check slug availability
  useEffect(() => {
    if (!formData.slug || formData.slug.length < 3) {
      setSlugAvailable(false);
      return;
    }

    const checkSlug = async () => {
      setCheckingSlug(true);
      try {
        const result = await exploreApi.checkSlugAvailability(formData.slug);
        setSlugAvailable(result.available);
      } catch (err) {
        setSlugAvailable(false);
      } finally {
        setCheckingSlug(false);
      }
    };

    const timer = setTimeout(checkSlug, 500);
    return () => clearTimeout(timer);
  }, [formData.slug]);

  const handleSubmit = async () => {
    if (!formData.display_name || !formData.slug) {
      setError(t('explore.creatorValidationError') || 'Display name and slug are required');
      return;
    }

    if (!slugAvailable) {
      setError(t('explore.slugNotAvailable') || 'Slug is not available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await exploreApi.applyCreator({
        display_name: formData.display_name,
        slug: formData.slug,
        bio: formData.bio || undefined,
        avatar: formData.avatar || undefined,
        social_links: Object.fromEntries(
          Object.entries(formData.social_links).filter(([, v]) => v)
        ),
      });

      onSuccess();
      onClose();
      setStep(1);
      setFormData({
        display_name: '',
        slug: '',
        bio: '',
        avatar: '',
        social_links: {
          instagram: '',
          twitter: '',
          website: '',
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || t('explore.creatorApplicationError') || 'Failed to apply');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('explore.becomeCreator') || 'Become a Creator'}
      size="2xl"
      footer={
        <div className="flex justify-between gap-3">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1 || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
            {t('common.back') || 'Back'}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.next') || 'Next'}
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading || !slugAvailable || !formData.display_name}
              className="px-6 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('common.submitting') || 'Submitting...' : t('common.submit') || 'Submit'}
            </button>
          )}
        </div>
      }
    >
      {/* Step indicator */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm ${
                s <= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}
            >
              {s}
            </div>
            <span className="text-sm hidden sm:inline">
              {s === 1 && (t('explore.creatorStep1') || 'Profile')}
              {s === 2 && (t('explore.creatorStep2') || 'Bio & Links')}
              {s === 3 && (t('explore.creatorStep3') || 'Review')}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Name & Slug */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('explore.displayName') || 'Display Name'} *
            </label>
            <input
              type="text"
              value={formData.display_name}
              onChange={e => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
              placeholder={t('explore.displayNamePlaceholder') || 'e.g., Jane Wanderer'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('explore.creatorSlug') || 'Profile URL'} *
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-600">trek.travel/creators/</span>
              <input
                type="text"
                value={formData.slug}
                onChange={e => {
                  const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                  setFormData(prev => ({ ...prev, slug: val }));
                }}
                placeholder="jane-wanderer"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {checkingSlug && <p className="text-xs text-gray-500 mt-1">Checking availability...</p>}
            {!checkingSlug && formData.slug && (
              <p className={`text-xs mt-1 ${slugAvailable ? 'text-green-600' : 'text-red-600'}`}>
                {slugAvailable
                  ? t('explore.slugAvailable') || '✓ Available'
                  : t('explore.slugTaken') || '✗ Already taken'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Bio & Social Links */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('explore.bio') || 'Bio'}
            </label>
            <textarea
              value={formData.bio}
              onChange={e => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              placeholder={t('explore.bioPlaceholder') || 'Tell travelers about your experience and passion for travel...'}
              maxLength={500}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">{formData.bio.length}/500</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('explore.socialLinks') || 'Social Links (optional)'}
            </label>
            <div className="space-y-2">
              <input
                type="url"
                value={formData.social_links.instagram}
                onChange={e => setFormData(prev => ({
                  ...prev,
                  social_links: { ...prev.social_links, instagram: e.target.value }
                }))}
                placeholder="Instagram URL"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="url"
                value={formData.social_links.twitter}
                onChange={e => setFormData(prev => ({
                  ...prev,
                  social_links: { ...prev.social_links, twitter: e.target.value }
                }))}
                placeholder="Twitter/X URL"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="url"
                value={formData.social_links.website}
                onChange={e => setFormData(prev => ({
                  ...prev,
                  social_links: { ...prev.social_links, website: e.target.value }
                }))}
                placeholder="Personal Website"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
            {t('explore.creatorApplicationNote') || 'Your application will be reviewed by our team within 48 hours.'}
          </div>

          <div className="space-y-3 bg-gray-50 rounded-lg p-4">
            <div>
              <p className="text-xs text-gray-600">{t('explore.displayName') || 'Display Name'}</p>
              <p className="font-medium">{formData.display_name}</p>
            </div>

            <div>
              <p className="text-xs text-gray-600">{t('explore.creatorSlug') || 'Profile URL'}</p>
              <p className="font-medium text-blue-600">trek.travel/creators/{formData.slug}</p>
            </div>

            {formData.bio && (
              <div>
                <p className="text-xs text-gray-600">{t('explore.bio') || 'Bio'}</p>
                <p className="font-medium text-sm">{formData.bio}</p>
              </div>
            )}

            {Object.entries(formData.social_links).some(([, v]) => v) && (
              <div>
                <p className="text-xs text-gray-600">{t('explore.socialLinks') || 'Social Links'}</p>
                <div className="space-y-1">
                  {Object.entries(formData.social_links).map(([key, value]) =>
                    value ? (
                      <p key={key} className="text-sm">
                        <span className="capitalize">{key}:</span> <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{value}</a>
                      </p>
                    ) : null
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
