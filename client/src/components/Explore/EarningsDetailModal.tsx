import { useState, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { X, Download, TrendingUp } from 'lucide-react';
import Modal from '../shared/Modal';

interface Sale {
  id: number;
  created_at: string;
  trip_title: string;
  buyer_name: string;
  amount_cents: number;
  platform_fee_cents: number;
  creator_payout_cents: number;
  currency: string;
  status: string;
}

interface TripSummary {
  source_trip_id: number;
  title: string;
  sales_count: number;
  total_revenue: number;
  total_fees: number;
  total_payout: number;
  paid_count: number;
  pending_count: number;
}

interface EarningsDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: Sale[];
  trips: TripSummary[];
  totalEarnings: {
    totalSales: number;
    totalFees: number;
    totalPayout: number;
    salesCount: number;
  };
}

export function EarningsDetailModal({
  isOpen,
  onClose,
  sales,
  trips,
  totalEarnings,
}: EarningsDetailModalProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'sales' | 'trips'>('sales');

  const downloadCSV = () => {
    const headers = ['Date', 'Trip', 'Buyer', 'Gross (€)', 'Commission (€)', 'Net (€)', 'Status'];
    const rows = sales.map(sale => [
      new Date(sale.created_at).toLocaleDateString(),
      sale.trip_title,
      sale.buyer_name,
      (sale.amount_cents / 100).toFixed(2),
      (sale.platform_fee_cents / 100).toFixed(2),
      (sale.creator_payout_cents / 100).toFixed(2),
      sale.status,
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `earnings-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('explore.earningsDetail') || 'Earnings Details'}
      size="4xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={downloadCSV}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            <Download size={14} />
            {t('explore.downloadCSV') || 'Download CSV'}
          </button>
        </div>
      }
    >
      {/* Totals summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 24,
          padding: 16,
          borderRadius: 12,
          background: 'var(--bg-secondary)',
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
            {t('explore.sales') || 'Sales'}
          </p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            {totalEarnings.salesCount}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
            {t('explore.revenue') || 'Revenue'}
          </p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            €{(totalEarnings.totalSales / 100).toFixed(2)}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
            {t('explore.commission') || 'Commission'}
          </p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#dc2626' }}>
            −€{(totalEarnings.totalFees / 100).toFixed(2)}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
            {t('explore.payout') || 'Earned'}
          </p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#059669' }}>
            €{(totalEarnings.totalPayout / 100).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-primary)', paddingBottom: 12 }}>
        <button
          onClick={() => setTab('sales')}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: 'none',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            background: tab === 'sales' ? 'var(--accent)' : 'transparent',
            color: tab === 'sales' ? 'var(--accent-text)' : 'var(--text-muted)',
            fontFamily: 'inherit',
          }}
        >
          {t('explore.allSales') || 'All Sales'} ({sales.length})
        </button>
        <button
          onClick={() => setTab('trips')}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: 'none',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            background: tab === 'trips' ? 'var(--accent)' : 'transparent',
            color: tab === 'trips' ? 'var(--accent-text)' : 'var(--text-muted)',
            fontFamily: 'inherit',
          }}
        >
          {t('explore.byTrip') || 'By Trip'} ({trips.length})
        </button>
      </div>

      {/* Sales table */}
      {tab === 'sales' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {t('common.date') || 'Date'}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {t('explore.trip') || 'Trip'}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {t('explore.buyer') || 'Buyer'}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {t('explore.gross') || 'Gross'}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {t('explore.commission') || 'Commission'}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {t('explore.net') || 'Net'}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {t('explore.status') || 'Status'}
                </th>
              </tr>
            </thead>
            <tbody>
              {sales.map(sale => (
                <tr
                  key={sale.id}
                  style={{
                    borderBottom: '1px solid var(--border-primary)',
                    background: sale.status === 'paid' ? 'transparent' : 'rgba(200,0,0,0.05)',
                  }}
                >
                  <td style={{ padding: '10px 8px', color: 'var(--text-muted)' }}>
                    {new Date(sale.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {sale.trip_title}
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-muted)' }}>
                    {sale.buyer_name}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 500 }}>
                    €{(sale.amount_cents / 100).toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: '#dc2626', fontWeight: 500 }}>
                    −€{(sale.platform_fee_cents / 100).toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: '#059669', fontWeight: 700 }}>
                    €{(sale.creator_payout_cents / 100).toFixed(2)}
                  </td>
                  <td
                    style={{
                      padding: '10px 8px',
                      textAlign: 'center',
                      fontSize: 10,
                      fontWeight: 600,
                      color: sale.status === 'paid' ? '#059669' : '#dc2626',
                    }}
                  >
                    {sale.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Trips summary */}
      {tab === 'trips' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {trips.map(trip => (
            <div
              key={trip.source_trip_id}
              style={{
                padding: 12,
                borderRadius: 10,
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {trip.title}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                    {trip.sales_count} {trip.sales_count === 1 ? 'sale' : 'sales'}
                    {trip.pending_count > 0 && ` (${trip.pending_count} pending)`}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#059669' }}>
                    €{(trip.total_payout / 100).toFixed(2)}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>
                    gross: €{(trip.total_revenue / 100).toFixed(2)}
                  </p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <div style={{ padding: '8px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
                  <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>Revenue</p>
                  <p style={{ margin: '2px 0 0', fontWeight: 600, color: 'var(--text-primary)' }}>
                    €{(trip.total_revenue / 100).toFixed(2)}
                  </p>
                </div>
                <div style={{ padding: '8px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
                  <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>Commission</p>
                  <p style={{ margin: '2px 0 0', fontWeight: 600, color: '#dc2626' }}>
                    −€{(trip.total_fees / 100).toFixed(2)}
                  </p>
                </div>
                <div style={{ padding: '8px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
                  <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>Your Earnings</p>
                  <p style={{ margin: '2px 0 0', fontWeight: 600, color: '#059669' }}>
                    €{(trip.total_payout / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {sales.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-faint)' }}>
          <TrendingUp size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: 14 }}>No sales yet</p>
        </div>
      )}
    </Modal>
  );
}
