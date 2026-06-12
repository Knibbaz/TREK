import { useState, useEffect } from 'react';
import { LiBEditor } from '../components/Explore/creator-hub/LiBEditor';
import { EarningsOverview } from '../components/Explore/EarningsOverview';
import { AffiliateManager } from '../components/Explore/creator-hub/affiliates/AffiliateManager';
import { creatorHubApi } from '../api/client';
import { useCreatorHubStore } from '../store/creatorHubStore';

type Tab = 'link-in-bio' | 'affiliates' | 'earnings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'link-in-bio', label: 'Link-in-Bio' },
  { id: 'affiliates', label: 'Affiliates' },
  { id: 'earnings', label: 'Earnings' },
];

type GateReason = 'NO_CREATOR_PROFILE' | 'NO_PUBLISHED_LISTINGS' | null;

export default function CreatorHubPage() {
  const [activeTab, setActiveTab] = useState<Tab>('link-in-bio');
  const [gateReason, setGateReason] = useState<GateReason>(null);
  const [checking, setChecking] = useState(true);
  const { setConfig, setBlocks, setLoading } = useCreatorHubStore();

  useEffect(() => {
    const checkEligibility = async () => {
      try {
        setLoading(true);
        const [configData, blocksData] = await Promise.all([
          creatorHubApi.getLibConfig(),
          creatorHubApi.getBlocks(),
        ]);
        setConfig(configData);
        setBlocks(blocksData);
        setGateReason(null);
      } catch (err: any) {
        const code = err?.response?.data?.code;
        if (code === 'NO_CREATOR_PROFILE' || code === 'NO_PUBLISHED_LISTINGS') {
          setGateReason(code);
        }
      } finally {
        setLoading(false);
        setChecking(false);
      }
    };
    checkEligibility();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading...
      </div>
    );
  }

  if (gateReason) {
    return <CreatorHubGate reason={gateReason} />;
  }

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
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '1rem',
              border: 'none',
              borderBottom: activeTab === tab.id ? '3px solid var(--accent)' : '3px solid transparent',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: '0.95rem',
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'link-in-bio' && <LiBEditor skipLoad />}
      {activeTab === 'affiliates' && <AffiliateManager />}
      {activeTab === 'earnings' && <EarningsOverview />}
    </div>
  );
}

function CreatorHubGate({ reason }: { reason: GateReason }) {
  return (
    <div
      style={{
        maxWidth: '480px',
        margin: '4rem auto',
        padding: '2.5rem',
        textAlign: 'center',
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '1rem',
        border: '1px solid var(--border-primary)',
      }}
    >
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
        {reason === 'NO_CREATOR_PROFILE' ? '👤' : '🗺️'}
      </div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
        {reason === 'NO_CREATOR_PROFILE'
          ? 'Creator profile required'
          : 'Publish a trip first'}
      </h2>
      <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '1.5rem' }}>
        {reason === 'NO_CREATOR_PROFILE'
          ? 'Set up your creator profile in Explore before using Creator Hub.'
          : 'You need at least one published and approved trip on Explore before you can access Creator Hub.'}
      </p>
      <a
        href="/explore"
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          backgroundColor: 'var(--accent)',
          color: 'white',
          borderRadius: '0.5rem',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '0.95rem',
        }}
      >
        {reason === 'NO_CREATOR_PROFILE' ? 'Go to Explore' : 'Go to Explore →'}
      </a>
    </div>
  );
}
