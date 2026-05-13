import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import { CheckCircle, AlertCircle, Clock, XCircle } from 'lucide-react';
import { exploreApi } from '../../api/client';

interface PaymentConfirmationProps {
  status: 'processing' | 'success' | 'failed' | 'cancelled';
  tripId?: string;
  onDismiss: () => void;
}

export function PaymentConfirmation({ status, tripId, onDismiss }: PaymentConfirmationProps) {
  const { t } = useTranslation();
  const [tripData, setTripData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tripId) {
      exploreApi.getTrip(tripId)
        .then(data => setTripData(data.trip))
        .catch(err => console.error('Failed to load trip:', err))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [tripId]);

  const getContent = () => {
    switch (status) {
      case 'processing':
        return {
          icon: Clock,
          title: t('explore.paymentProcessing'),
          subtitle: t('explore.paymentProcessingDesc') || 'Your payment is being processed. Your trip will appear in your collection shortly.',
          color: 'blue',
          bgColor: 'bg-blue-50',
          iconColor: 'text-blue-600',
          borderColor: 'border-blue-200',
        };
      case 'success':
        return {
          icon: CheckCircle,
          title: t('explore.paymentSuccess'),
          subtitle: t('explore.paymentSuccessDesc') || 'Your trip has been added to your collection!',
          color: 'green',
          bgColor: 'bg-green-50',
          iconColor: 'text-green-600',
          borderColor: 'border-green-200',
        };
      case 'failed':
        return {
          icon: AlertCircle,
          title: t('explore.paymentFailed'),
          subtitle: t('explore.paymentFailedDesc') || 'Your payment could not be processed. Please try again.',
          color: 'red',
          bgColor: 'bg-red-50',
          iconColor: 'text-red-600',
          borderColor: 'border-red-200',
        };
      case 'cancelled':
        return {
          icon: XCircle,
          title: t('explore.paymentCancelled'),
          subtitle: t('explore.paymentCancelledDesc') || 'Your payment was cancelled. You can try again anytime.',
          color: 'yellow',
          bgColor: 'bg-yellow-50',
          iconColor: 'text-yellow-600',
          borderColor: 'border-yellow-200',
        };
    }
  };

  const content = getContent();
  const Icon = content.icon;

  return (
    <div className={`rounded-lg border ${content.borderColor} ${content.bgColor} p-6`}>
      <div className="flex gap-4">
        <div className="flex-shrink-0">
          <Icon className={`w-8 h-8 ${content.iconColor}`} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{content.title}</h3>
          <p className="text-sm text-gray-600 mt-1">{content.subtitle}</p>

          {loading ? (
            <div className="mt-4 animate-pulse h-20 bg-gray-200 rounded"></div>
          ) : tripData ? (
            <div className="mt-4 bg-white/50 rounded p-3">
              <div className="text-sm">
                <p className="font-medium text-gray-900">{tripData.display_title || tripData.title}</p>
                <p className="text-gray-600 text-xs mt-1">{tripData.start_date} → {tripData.end_date}</p>
                {status === 'success' && (
                  <p className="text-gray-600 text-xs mt-2">
                    {tripData.duration_days} {t('explore.day')} • {tripData.places_count} {t('explore.places')}
                  </p>
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              onClick={onDismiss}
              className="px-4 py-2 rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 text-sm font-medium transition"
            >
              {status === 'processing' ? t('common.close') : t('common.back')}
            </button>
            {status === 'failed' || status === 'cancelled' ? (
              <button
                onClick={onDismiss}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition"
              >
                {t('explore.tryAgain')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
