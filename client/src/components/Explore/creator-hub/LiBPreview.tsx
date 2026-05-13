import { useCreatorHubStore } from '../../../store/creatorHubStore';
import { LibBlock } from '../../../types';
import './lib-themes.css';

export function LiBPreview() {
  const { config, blocks } = useCreatorHubStore();

  if (!config || !blocks) {
    return (
      <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>
        Loading preview...
      </div>
    );
  }

  const themeClass = `lib-theme-${config.theme}`;
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

  const visibleBlocks = blocks.filter((b) => b.is_visible).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 1rem' }}>
      {/* Mobile frame */}
      <div
        style={{
          width: '375px',
          height: '812px',
          border: '12px solid #000',
          borderRadius: '40px',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          position: 'relative',
          background: '#000',
        }}
      >
        {/* Notch */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '150px',
            height: '28px',
            background: '#000',
            borderRadius: '0 0 20px 20px',
            zIndex: 10,
          }}
        />

        {/* Content */}
        <div
          className={`lib-root ${themeClass}`}
          style={{
            ...bgStyle,
            width: '100%',
            height: '100%',
            overflowY: 'auto',
            paddingTop: '0.5rem',
          }}
        >
          <div className="lib-container">
            {/* Header */}
            <div className="lib-header">
              <div style={{ fontSize: '2rem' }}>🌍</div>
              <h1 className="lib-header-title">Creator Name</h1>
              <p className="lib-header-subtitle">{config.tagline || 'Travel & Adventures'}</p>
            </div>

            {/* Blocks */}
            {visibleBlocks.map((block) => (
              <LibBlockPreview key={block.id} block={block} theme={config.theme} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LibBlockPreview({ block, theme }: { block: LibBlock; theme: string }) {
  const getBlockContent = () => {
    switch (block.type) {
      case 'link':
        return (
          <div className="lib-block-link">
            <span className="lib-block-icon">{block.icon || '🔗'}</span>
            <div className="lib-block-content">
              <p className="lib-block-title">{block.title}</p>
            </div>
            <span className="lib-block-arrow">→</span>
          </div>
        );
      case 'heading':
        return <h2 className="lib-heading">{block.title}</h2>;
      case 'divider':
        return <div className="lib-divider" />;
      case 'text':
        return (
          <p
            style={{
              fontSize: '0.95rem',
              lineHeight: '1.5',
              margin: '0.5rem 0',
              color: 'var(--lib-text-secondary)',
            }}
          >
            {block.title}
          </p>
        );
      case 'image':
        return (
          <img
            src={block.thumbnail_url || 'https://via.placeholder.com/300x200'}
            alt={block.title}
            style={{
              width: '100%',
              height: 'auto',
              borderRadius: '0.5rem',
              marginBottom: '0.5rem',
            }}
          />
        );
      case 'embed':
        return (
          <div style={{ fontSize: '0.85rem', color: 'var(--lib-text-secondary)' }}>
            📺 {block.title || 'Video Embed'}
          </div>
        );
      default:
        return null;
    }
  };

  if (block.type === 'heading' || block.type === 'divider') {
    return <div>{getBlockContent()}</div>;
  }

  if (block.type === 'image' || block.type === 'text') {
    return <div className="lib-block">{getBlockContent()}</div>;
  }

  return <div className="lib-block">{getBlockContent()}</div>;
}
