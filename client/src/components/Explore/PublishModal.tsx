import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import { ChevronRight, ChevronLeft, ChevronDown } from 'lucide-react';
import Modal from '../shared/Modal';
import { PricingCalculator } from './PricingCalculator';
import { exploreApi } from '../../api/client';

interface Trip {
  id: number;
  title: string;
  description?: string;
}

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  trips: Trip[];
  onSubmitted: () => void;
}

interface MollieMethod {
  name: string;
  fixed_cents: number;
  variable_pct: number;
}

export function PublishModal({ isOpen, onClose, trips, onSubmitted }: PublishModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [commissionPct, setCommissionPct] = useState(15);
  const [mollieMethods, setMollieMethods] = useState<MollieMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-select single trip
  const hasSingleTrip = trips.length === 1;
  const singleTripId = hasSingleTrip ? String(trips[0].id) : '';

  const [formData, setFormData] = useState({
    trip_id: singleTripId,
    listing_title: hasSingleTrip ? trips[0].title : '',
    tagline: '',
    destination: '',
    difficulty: 'easy' as 'easy' | 'moderate' | 'challenging',
    best_season: [] as string[],
    tags: [] as string[],
    price: 0,
    is_free: true,
    community_enabled: false,
  });

  // Fetch commission on mount
  useEffect(() => {
    if (isOpen) {
      exploreApi.getConfig().then(config => {
        setCommissionPct(config.commission_percentage ?? 15);
        setMollieMethods(config.mollie_methods ?? []);
      }).catch(err => {
        console.error('Failed to load explore config:', err);
        setCommissionPct(15);
        setMollieMethods([]);
      });

      // Reset form when modal opens
      setStep(1);
      setError(null);
      if (hasSingleTrip) {
        setFormData({
          trip_id: singleTripId,
          listing_title: trips[0].title,
          tagline: '',
          destination: '',
          difficulty: 'easy',
          best_season: [],
          tags: [],
          price: 0,
          is_free: true,
          community_enabled: false,
        });
      } else {
        setFormData({
          trip_id: '',
          listing_title: '',
          tagline: '',
          destination: '',
          difficulty: 'easy',
          best_season: [],
          tags: [],
          price: 0,
          is_free: true,
          community_enabled: false,
        });
      }
    }
  }, [isOpen, hasSingleTrip, singleTripId, trips]);

  const selectedTrip = trips.find(t => t.id === Number(formData.trip_id));

  const handleTripChange = (tripId: string) => {
    const trip = trips.find(t => t.id === Number(tripId));
    setFormData(prev => ({
      ...prev,
      trip_id: tripId,
      listing_title: trip?.title || '',
    }));
  };

  const handleSeasonToggle = (season: string) => {
    setFormData(prev => ({
      ...prev,
      best_season: prev.best_season.includes(season)
        ? prev.best_season.filter(s => s !== season)
        : [...prev.best_season, season],
    }));
  };

  const handleTagsChange = (tagsStr: string) => {
    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
    setFormData(prev => ({ ...prev, tags }));
  };

  const handlePriceChange = (priceStr: string) => {
    const price = parseFloat(priceStr) || 0;
    setFormData(prev => ({ ...prev, price: Math.max(0, price) }));
  };

  const handleSubmit = async () => {
    if (!formData.trip_id) {
      setError(t('explore.selectTripError'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await exploreApi.submitTrip(formData.trip_id, {
        listing_title: formData.listing_title || undefined,
        tagline: formData.tagline || undefined,
        destination: formData.destination || undefined,
        difficulty: formData.difficulty,
        best_season: formData.best_season.length > 0 ? formData.best_season : undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        price: formData.is_free ? 0 : formData.price,
        community_enabled: formData.community_enabled,
      });

      onSubmitted();
      onClose();
      // Reset form
      setStep(1);
      setFormData({
        trip_id: '',
        listing_title: '',
        tagline: '',
        destination: '',
        difficulty: 'easy',
        best_season: [],
        tags: [],
        price: 0,
        is_free: true,
        community_enabled: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || t('explore.submitError'));
    } finally {
      setLoading(false);
    }
  };

  const priceCents = Math.round(formData.price * 100);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('explore.submitTrip')}
      size="2xl"
      footer={
        <div className="flex justify-between gap-3">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1 || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
            {t('common.back')}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.next')}
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading || !formData.trip_id}
              className="px-6 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('common.submitting') : t('common.submit')}
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
              {s === 1 && t('explore.publishStep1')}
              {s === 2 && t('explore.publishStep2')}
              {s === 3 && t('explore.publishStep3')}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Listing info */}
      {step === 1 && (
        <div className="space-y-4">
          {hasSingleTrip && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-600 font-medium mb-1">{t('explore.submitModal.trip')}</p>
              <p className="text-sm font-medium text-gray-900">{selectedTrip?.title}</p>
            </div>
          )}
          {!hasSingleTrip && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('explore.submitModal.trip')} *
              </label>
              <div className="relative">
                <select
                  value={formData.trip_id}
                  onChange={e => handleTripChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 appearance-none cursor-pointer"
                >
                  <option value="">{t('explore.selectTrip')}</option>
                  {trips.map(trip => (
                    <option key={trip.id} value={trip.id}>
                      {trip.title}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('explore.listingTitle')} *
            </label>
            <input
              type="text"
              value={formData.listing_title}
              onChange={e => setFormData(prev => ({ ...prev, listing_title: e.target.value }))}
              placeholder={selectedTrip?.title || t('explore.enterTitle')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('explore.tagline')}
            </label>
            <input
              type="text"
              maxLength={80}
              value={formData.tagline}
              onChange={e => setFormData(prev => ({ ...prev, tagline: e.target.value }))}
              placeholder={t('explore.taglinePlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">{formData.tagline.length}/80</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('explore.destination')}
            </label>
            <input
              type="text"
              value={formData.destination}
              onChange={e => setFormData(prev => ({ ...prev, destination: e.target.value }))}
              placeholder={t('explore.enterDestination')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('explore.difficulty')}
            </label>
            <select
              value={formData.difficulty}
              onChange={e => setFormData(prev => ({ ...prev, difficulty: e.target.value as 'easy' | 'moderate' | 'challenging' }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="easy">{t('explore.difficultyEasy')}</option>
              <option value="moderate">{t('explore.difficultyModerate')}</option>
              <option value="challenging">{t('explore.difficultyChallenging')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('explore.season')}
            </label>
            <div className="space-y-2">
              {['spring', 'summer', 'autumn', 'winter'].map(season => (
                <label key={season} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.best_season.includes(season)}
                    onChange={() => handleSeasonToggle(season)}
                    className="rounded"
                  />
                  <span className="text-sm">{t(`explore.season_${season}`)}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('explore.tags')}
            </label>
            <input
              type="text"
              value={formData.tags.join(', ')}
              onChange={e => handleTagsChange(e.target.value)}
              placeholder={t('explore.tagsPlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">{t('explore.tagCount', { count: formData.tags.length })}</p>
          </div>
        </div>
      )}

      {/* Step 2: Pricing */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer"  style={{ borderColor: formData.is_free ? '#3b82f6' : '#e5e7eb' }}>
              <input
                type="radio"
                checked={formData.is_free}
                onChange={() => setFormData(prev => ({ ...prev, is_free: true, price: 0 }))}
                className="w-4 h-4"
              />
              <div>
                <p className="font-medium">{t('explore.freeTrip')}</p>
                <p className="text-sm text-gray-600">{t('explore.freeDesc')}</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer mt-3" style={{ borderColor: !formData.is_free ? '#3b82f6' : '#e5e7eb' }}>
              <input
                type="radio"
                checked={!formData.is_free}
                onChange={() => setFormData(prev => ({ ...prev, is_free: false }))}
                className="w-4 h-4"
              />
              <div>
                <p className="font-medium">{t('explore.paidTrip')}</p>
                <p className="text-sm text-gray-600">{t('explore.paidDesc')}</p>
              </div>
            </label>
          </div>

          {!formData.is_free && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('explore.price')} (€)
              </label>
              <input
                type="number"
                min="0.99"
                step="0.01"
                value={formData.price || ''}
                onChange={e => handlePriceChange(e.target.value)}
                placeholder="9.99"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">{t('explore.minPrice')}</p>

              {formData.price > 0 && (
                <div className="mt-4">
                  <PricingCalculator priceCents={priceCents} commissionPct={commissionPct} mollieMethods={mollieMethods} />
                </div>
              )}
            </div>
          )}

          {/* Community contributions temporarily disabled */}
          {/*
          <div>
            <label className="flex items-center gap-2 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={formData.community_enabled}
                onChange={e => setFormData(prev => ({ ...prev, community_enabled: e.target.checked }))}
                className="rounded"
              />
              <div>
                <p className="font-medium text-sm">{t('explore.communityContributions')}</p>
                <p className="text-xs text-gray-600">{t('explore.communityDesc')}</p>
              </div>
            </label>
          </div>
          */}
        </div>
      )}

      {/* Step 3: Review & Submit */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
            {t('explore.submitNote')}
          </div>

          <div className="space-y-3 bg-gray-50 rounded-lg p-4">
            {formData.listing_title && (
              <div>
                <p className="text-xs text-gray-600">{t('explore.listingTitle')}</p>
                <p className="font-medium">{formData.listing_title}</p>
              </div>
            )}

            {formData.destination && (
              <div>
                <p className="text-xs text-gray-600">{t('explore.destination')}</p>
                <p className="font-medium">{formData.destination}</p>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-600">{t('explore.difficulty')}</p>
              <p className="font-medium">{t(`explore.difficulty${formData.difficulty.charAt(0).toUpperCase() + formData.difficulty.slice(1)}`)}</p>
            </div>

            {formData.tags.length > 0 && (
              <div>
                <p className="text-xs text-gray-600">{t('explore.tags')}</p>
                <div className="flex gap-2 flex-wrap mt-1">
                  {formData.tags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t pt-3">
              <p className="text-xs text-gray-600">{t('explore.price')}</p>
              <p className="font-medium">
                {formData.is_free ? t('explore.freeTrip') : `€${formData.price.toFixed(2)}`}
              </p>
            </div>

            {!formData.is_free && formData.price > 0 && (
              <div>
                <p className="text-xs text-gray-600">{t('explore.pricingNet')}</p>
                <p className="font-medium text-green-600">
                  €{((priceCents - Math.round(priceCents * (commissionPct / 100))) / 100).toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
