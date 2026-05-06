import { useTranslation } from '../../i18n';

interface PricingCalculatorProps {
  priceCents: number;
  commissionPct: number;
}

export function PricingCalculator({ priceCents, commissionPct }: PricingCalculatorProps) {
  const { t } = useTranslation();

  const priceEuros = priceCents / 100;
  const commissionCents = Math.round(priceCents * (commissionPct / 100));
  const netCents = priceCents - commissionCents;
  const netEuros = netCents / 100;

  return (
    <div className="space-y-3 bg-gray-50 rounded-lg p-4 text-sm">
      <div className="flex justify-between">
        <span>{t('explore.pricingGross')}:</span>
        <span className="font-medium">€{priceEuros.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-gray-600">
        <span>{t('explore.pricingCommission')} ({commissionPct}%):</span>
        <span>−€{(commissionCents / 100).toFixed(2)}</span>
      </div>
      <div className="border-t pt-3 flex justify-between font-semibold text-green-600">
        <span>{t('explore.pricingNet')}:</span>
        <span>€{netEuros.toFixed(2)}</span>
      </div>
    </div>
  );
}
