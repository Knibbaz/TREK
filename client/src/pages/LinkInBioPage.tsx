import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { creatorHubApi } from '../api/client';
import { LibBlock, LibConfig } from '../types';
import '../components/Explore/creator-hub/lib-themes.css';
import { useTrackVisit } from '../hooks/useTrackVisit';
import VisitorPoll from '../components/shared/VisitorPoll';

export function LinkInBioPage() {
  const { slug } = useParams<{ slug: string }>();
  const [config, setConfig] = useState<LibConfig | null>(null);
  const [blocks, setBlocks] = useState<LibBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useTrackVisit('link_in_bio', slug);

  useEffect(() => {
    const loadData = async () => {
      try {
        if (!slug) {
          setError('Slug not found');
          return;
        }

        // Get public LiB data
        const { config: libConfig, blocks: libBlocks } = await creatorHubApi.getPublicLib(slug);
        setConfig(libConfig);
        setBlocks(libBlocks);
      } catch (err: any) {
        console.error('Error loading LiB:', err);
        setError(err?.response?.data?.error || 'Failed to load Link-in-Bio');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [slug]);

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#d32f2f' }}>{error}</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Link-in-Bio not found</p>
      </div>
    );
  }

  const themeClass = `lib-theme-${config.theme}`;
  const visibleBlocks = blocks.filter((b) => b.is_visible).sort((a, b) => a.sort_order - b.sort_order);

  const bgStyle: React.CSSProperties = {};
  if (config.background_type === 'gradient') {
    bgStyle.backgroundImage = config.background_value;
  } else if (config.background_type === 'image') {
    bgStyle.backgroundImage = `url('${config.background_value}')`;
    bgStyle.backgroundSize = 'cover';
    bgStyle.backgroundPosition = 'center';
  } else {
    bgStyle.backgroundColor = config.background_value;
  }

  return (
    <div
      className={`lib-root ${themeClass}`}
      style={{
        ...bgStyle,
      }}
    >
      <VisitorPoll pageType="link_in_bio" pageRef={slug} />
      <div className="lib-container">
        {/* Header */}
        <div className="lib-header">
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🌍</div>
          <h1 className="lib-header-title">{config.slug}</h1>
          {config.tagline && (
            <p className="lib-header-subtitle">{config.tagline}</p>
          )}
        </div>

        {/* Blocks */}
        {visibleBlocks.map((block) => (
          <LibBlockRenderer key={block.id} block={block} />
        ))}

        {/* Footer */}
        <div style={{
          marginTop: '2rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid var(--lib-divider)',
          fontSize: '0.85rem',
          color: 'var(--lib-text-secondary)',
          textAlign: 'center',
        }}>
          <p>Created with ROUTD Creator Hub</p>
        </div>
      </div>
    </div>
  );
}

function LibBlockRenderer({ block }: { block: LibBlock }) {
  const handleLinkClick = async () => {
    if (block.type === 'link') {
      // Open link
      if (block.url) {
        window.open(block.url, '_blank');
      }
    }
  };

  switch (block.type) {
    case 'link':
      return (
        <div className="lib-block" onClick={handleLinkClick} style={{ cursor: 'pointer' }}>
          <div className="lib-block-link">
            {block.icon && <span className="lib-block-icon">{block.icon}</span>}
            <div className="lib-block-content">
              {block.title && <p className="lib-block-title">{block.title}</p>}
            </div>
            <span className="lib-block-arrow">→</span>
          </div>
        </div>
      );

    case 'heading':
      return <h2 className="lib-heading">{block.title}</h2>;

    case 'divider':
      return <div className="lib-divider" />;

    case 'text':
      return (
        <div className="lib-block">
          <p
            style={{
              fontSize: '0.95rem',
              lineHeight: '1.5',
              margin: '0',
              color: 'var(--lib-text-secondary)',
            }}
          >
            {block.title}
          </p>
        </div>
      );

    case 'image':
      return (
        <div className="lib-block">
          {block.thumbnail_url && (
            <img
              src={block.thumbnail_url}
              alt={block.title}
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: '0.5rem',
              }}
            />
          )}
        </div>
      );

    case 'embed':
      return (
        <div className="lib-block">
          <div style={{ fontSize: '0.85rem', color: 'var(--lib-text-secondary)' }}>
            📺 {block.title || 'Video'}
          </div>
        </div>
      );

    default:
      return null;
  }
}
