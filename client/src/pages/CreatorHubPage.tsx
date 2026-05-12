import { useState } from 'react';
import { LiBEditor } from '../components/Explore/creator-hub/LiBEditor';
import { EarningsOverview } from '../components/Explore/EarningsOverview';
import { useTranslation } from '../i18n';

export default function CreatorHubPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'link-in-bio' | 'earnings'>('link-in-bio');

  return (
    <div>
      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-secondary)',
          padding: '0 1rem',
        }}
      >
        <button
          onClick={() => setActiveTab('link-in-bio')}
          style={{
            padding: '1rem',
            border: 'none',
            borderBottom: activeTab === 'link-in-bio' ? '3px solid var(--accent)' : 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            fontWeight: activeTab === 'link-in-bio' ? 600 : 400,
            color: activeTab === 'link-in-bio' ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: '0.95rem',
          }}
        >
          Link-in-Bio
        </button>
        <button
          onClick={() => setActiveTab('earnings')}
          style={{
            padding: '1rem',
            border: 'none',
            borderBottom: activeTab === 'earnings' ? '3px solid var(--accent)' : 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            fontWeight: activeTab === 'earnings' ? 600 : 400,
            color: activeTab === 'earnings' ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: '0.95rem',
          }}
        >
          Earnings
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'link-in-bio' && <LiBEditor />}
      {activeTab === 'earnings' && <EarningsOverview />}
    </div>
  );
}
