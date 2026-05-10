import { useState } from 'react';
import { useTranslation } from '../../i18n';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface MollieMethod {
  name: string;
  fixed_cents: number;
  variable_pct: number;
}

interface PricingCalculatorProps {
  priceCents: number;
  commissionPct: number;
  mollieMethods?: MollieMethod[];
}

export function PricingCalculator({ priceCents, commissionPct, mollieMethods }: PricingCalculatorProps) {
  const { t } = useTranslation();
  const [showBreakdown, setShowBreakdown] = useState(false);

  const methods = mollieMethods?.length ? mollieMethods : [{ name: 'iDEAL', fixed_cents: 29, variable_pct: 1.8 }];
  const priceEuros = priceCents / 100;
  const commissionCents = Math.round(priceCents * (commissionPct / 100));

  const netPerMethod = methods.map(m => {
    const mollieVariable = Math.round(priceCents * (m.variable_pct / 100));
    const mollieTotalCents = m.fixed_cents + mollieVariable;
    return {
      name: m.name,
      mollieCents: mollieTotalCents,
      netCents: Math.max(0, priceCents - commissionCents - mollieTotalCents),
    };
  });

  const minNet = Math.min(...netPerMethod.map(m => m.netCents));
  const maxNet = Math.max(...netPerMethod.map(m => m.netCents));
  const minMollie = Math.min(...netPerMethod.map(m => m.mollieCents));
  const maxMollie = Math.max(...netPerMethod.map(m => m.mollieCents));
  const singleMethod = methods.length === 1;
  const minNetEuros = minNet / 100;
  const maxNetEuros = maxNet / 100;
  const minMollieEuros = minMollie / 100;
  const maxMollieEuros = maxMollie / 100;

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
      <div className="flex justify-between text-gray-600">
        <span>{t('explore.mollieTransactionCost')}:</span>
        {singleMethod ? (
          <span>−€{(netPerMethod[0].mollieCents / 100).toFixed(2)}</span>
        ) : (
          <span>−€{minMollieEuros.toFixed(2)} – −€{maxMollieEuros.toFixed(2)} *</span>
        )}
      </div>
      <div className="border-t pt-3 flex justify-between font-semibold text-green-600">
        <span>{t('explore.pricingNet')}:</span>
        {singleMethod ? (
          <span>€{minNetEuros.toFixed(2)}</span>
        ) : (
          <span>€{minNetEuros.toFixed(2)} – €{maxNetEuros.toFixed(2)}</span>
        )}
      </div>

      {!singleMethod && (
        <div className="border-t pt-3 space-y-2">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="w-full flex items-center justify-between text-xs font-medium text-gray-700 hover:text-gray-900"
          >
            <span>{t('explore.perPaymentMethod')}</span>
            {showBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showBreakdown && (
            <div className="space-y-2">
              {netPerMethod.map((m, i) => (
                <div key={i} className="flex justify-between text-xs text-gray-600 px-2">
                  <span>{m.name}</span>
                  <span>€{(m.netCents / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-gray-500 pt-2 border-t">
        {t('explore.costsVia')} <a href="https://www.mollie.com/nl/pricing" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Mollie ↗</a>
      </div>
    </div>
  );
}
