import { useEffect, useState } from 'react';
import { useCreatorHubStore } from '../../../store/creatorHubStore';
import { creatorHubApi } from '../../../api/client';
import { useToast } from '../../shared/Toast';
import { useTranslation } from '../../../i18n';
import { LiBBlockEditor } from './LiBBlockEditor';
import { LiBPreview } from './LiBPreview';
import { LiBThemes } from './LiBThemes';
import './lib-themes.css';

export function LiBEditor({ skipLoad = false }: { skipLoad?: boolean }) {
  const { t } = useTranslation();
  const { success, error: showError } = useToast();
  const { config, setConfig, setBlocks, isLoading, setLoading } = useCreatorHubStore();
  const [activeTab, setActiveTab] = useState<'blocks' | 'theme'>('blocks');

  // Load config and blocks on mount (unless parent already loaded)
  useEffect(() => {
    if (skipLoad) return;
    const loadData = async () => {
      try {
        setLoading(true);
        const [configData, blocksData] = await Promise.all([
          creatorHubApi.getLibConfig(),
          creatorHubApi.getBlocks(),
        ]);
        setConfig(configData);
        setBlocks(blocksData);
      } catch (err: any) {
        showError(err?.response?.data?.error || 'Failed to load Link-in-Bio');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading...
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Failed to load Link-in-Bio configuration
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', minHeight: '100vh' }}>
      {/* Left: Editor */}
      <div
        style={{
          borderRight: '1px solid var(--border-primary)',
          overflowY: 'auto',
          maxHeight: '100vh',
        }}
      >
        <div style={{ padding: '2rem', paddingRight: '1rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1.5rem' }}>
            Link-in-Bio Editor
          </h1>

          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              marginBottom: '1.5rem',
              borderBottom: '1px solid var(--border-primary)',
            }}
          >
            <button
              onClick={() => setActiveTab('blocks')}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                borderBottom: activeTab === 'blocks' ? '2px solid var(--accent)' : 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontWeight: activeTab === 'blocks' ? 600 : 400,
                color: activeTab === 'blocks' ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '0.95rem',
              }}
            >
              Blocks
            </button>
            <button
              onClick={() => setActiveTab('theme')}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                borderBottom: activeTab === 'theme' ? '2px solid var(--accent)' : 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontWeight: activeTab === 'theme' ? 600 : 400,
                color: activeTab === 'theme' ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '0.95rem',
              }}
            >
              Theme & Style
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'blocks' && <LiBBlockEditor />}
          {activeTab === 'theme' && <LiBThemes />}
        </div>
      </div>

      {/* Right: Preview */}
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          overflowY: 'auto',
          maxHeight: '100vh',
          padding: '1rem',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
        }}
      >
        <div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem', textAlign: 'center' }}>
            Mobile Preview
          </p>
          <LiBPreview />
        </div>
      </div>
    </div>
  );
}
