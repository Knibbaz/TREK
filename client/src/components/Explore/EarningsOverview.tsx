import { useState, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { TrendingUp, Download, AlertCircle } from 'lucide-react';
import { exploreApi } from '../../api/client';
import { useToast } from '../shared/Toast';

interface Earnings {
  totalSales: number;
  totalFees: number;
  totalPayout: number;
  salesCount: number;
}

interface PerListing {
  trip_id: string | number;
  listing_title: string;
  sales_count: number;
  total_gross_cents: number;
  total_fees_cents: number;
  total_net_cents: number;
}

export function EarningsOverview() {
  const { t } = useTranslation();
  const { error: showError, success } = useToast();
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [perListing, setPerListing] = useState<PerListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEarnings();
  }, []);

  const loadEarnings = async () => {
    try {
      setLoading(true);
      const data = await exploreApi.getCreatorEarnings();
      setEarnings(data.earnings);
      setPerListing(data.per_listing || []);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load earnings');
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!perListing.length) {
      showError('No earnings to download');
      return;
    }

    const headers = ['Listing', 'Sales', 'Gross (€)', 'Commission (€)', 'Net (€)'];
    const rows = perListing.map(p => [
      p.listing_title,
      p.sales_count,
      (p.total_gross_cents / 100).toFixed(2),
      (p.total_fees_cents / 100).toFixed(2),
      (p.total_net_cents / 100).toFixed(2),
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `earnings-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    success('CSV downloaded');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 20px' }}>
        <div>Loading earnings...</div>
      </div>
    );
  }

  if (!earnings) {
    return (
      <div style={{ padding: '20px', color: 'var(--text-muted)' }}>
        {t('explore.noEarnings') || 'No earnings yet'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {/* Total Earnings */}
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            {t('explore.totalEarnings') || 'Total Earnings'}
          </div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            €{(earnings.totalPayout / 100).toFixed(2)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {earnings.salesCount} {t('explore.sales') || 'sales'}
          </div>
        </div>

        {/* Commission Paid */}
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            {t('explore.commissionPaid') || 'Commission Paid'}
          </div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>
            −€{(earnings.totalFees / 100).toFixed(2)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {((earnings.totalFees / earnings.totalSales) * 100 || 0).toFixed(0)}% of sales
          </div>
        </div>

        {/* Gross Volume */}
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            {t('explore.grossVolume') || 'Gross Volume'}
          </div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            €{(earnings.totalSales / 100).toFixed(2)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {earnings.salesCount > 0 ? `€${(earnings.totalSales / earnings.salesCount / 100).toFixed(2)} avg` : 'No sales'}
          </div>
        </div>
      </div>

      {/* Per-Listing Breakdown */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}>
          <h3 style={{ margin: '0', fontSize: '14px', fontWeight: '600' }}>
            {t('explore.byListing') || 'Earnings by Listing'}
          </h3>
          <button
            onClick={downloadCSV}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600',
              fontFamily: 'inherit',
            }}
          >
            <Download size={12} />
            {t('explore.downloadCSV') || 'Download'}
          </button>
        </div>

        {perListing.length > 0 ? (
          <div style={{
            overflowX: 'auto',
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '12px',
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: 'var(--text-muted)' }}>
                    {t('explore.listing') || 'Listing'}
                  </th>
                  <th style={{ textAlign: 'right', padding: '8px', fontWeight: '600', color: 'var(--text-muted)' }}>
                    {t('explore.sales') || 'Sales'}
                  </th>
                  <th style={{ textAlign: 'right', padding: '8px', fontWeight: '600', color: 'var(--text-muted)' }}>
                    {t('explore.gross') || 'Gross'}
                  </th>
                  <th style={{ textAlign: 'right', padding: '8px', fontWeight: '600', color: 'var(--text-muted)' }}>
                    {t('explore.commission') || 'Commission'}
                  </th>
                  <th style={{ textAlign: 'right', padding: '8px', fontWeight: '600', color: 'var(--text-muted)' }}>
                    {t('explore.net') || 'Net'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {perListing.map((item, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid var(--border-secondary)',
                      backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
                    }}
                  >
                    <td style={{ padding: '10px 8px', color: 'var(--text-primary)' }}>
                      {item.listing_title}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-primary)' }}>
                      {item.sales_count}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-primary)' }}>
                      €{(item.total_gross_cents / 100).toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 8px', color: '#ef4444' }}>
                      −€{(item.total_fees_cents / 100).toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 8px', color: '#10b981', fontWeight: '600' }}>
                      €{(item.total_net_cents / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
          }}>
            {t('explore.noListings') || 'No listings published yet'}
          </div>
        )}
      </div>
    </div>
  );
}
