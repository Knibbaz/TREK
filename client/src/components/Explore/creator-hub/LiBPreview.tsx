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
            fontFamily: config.font_family || 'Inter',
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
              <LibBlockPreview key={block.id} block={block} accentColor={config.accent_color} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LibBlockPreview({ block, accentColor }: { block: LibBlock; accentColor: string }) {
  switch (block.type) {
    case 'link':
      return (
        <div className="lib-block lib-block-link">
          <span className="lib-block-icon">{block.icon || '🔗'}</span>
          <div className="lib-block-content">
            <p className="lib-block-title">{block.title || 'Link'}</p>
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
        <div className="lib-block">
          <p style={{ fontSize: '0.9rem', lineHeight: '1.5', margin: 0, color: 'var(--lib-text-secondary)' }}>
            {block.title || 'Text block'}
          </p>
        </div>
      );

    case 'image':
      return (
        <div className="lib-block" style={{ padding: 0, overflow: 'hidden' }}>
          <img
            src={block.thumbnail_url || 'https://via.placeholder.com/375x200?text=Image'}
            alt={block.title || ''}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
          {block.title && (
            <p style={{ fontSize: '0.8rem', color: 'var(--lib-text-secondary)', padding: '0.5rem 0.75rem', margin: 0 }}>
              {block.title}
            </p>
          )}
        </div>
      );

    case 'embed':
      return (
        <div className="lib-block" style={{ backgroundColor: 'rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--lib-text-secondary)' }}>
            <span>📺</span>
            <span>{block.title || 'Video Embed'}</span>
          </div>
        </div>
      );

    case 'listings_grid':
      return (
        <div className="lib-block">
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lib-text-secondary)', margin: '0 0 0.5rem 0' }}>
            {block.title || 'My Trips'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {['🇹🇭 Thailand', '🇮🇩 Bali', '🇯🇵 Tokyo'].map((item) => (
              <div
                key={item}
                style={{
                  padding: '0.6rem',
                  backgroundColor: 'rgba(0,0,0,0.05)',
                  borderRadius: '0.375rem',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      );

    case 'guides_grid':
      return (
        <div className="lib-block">
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lib-text-secondary)', margin: '0 0 0.5rem 0' }}>
            {block.title || 'Mini-Guides'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {['📍 Top 10 Bangkok restaurants', '📍 Hidden gems Ubud'].map((item) => (
              <div
                key={item}
                style={{
                  padding: '0.5rem 0.6rem',
                  backgroundColor: 'rgba(0,0,0,0.05)',
                  borderRadius: '0.375rem',
                  fontSize: '0.8rem',
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      );

    case 'group_trip':
      return (
        <div className="lib-block">
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lib-text-secondary)', margin: '0 0 0.5rem 0' }}>
            {block.title || 'Group Trip'}
          </p>
          <div style={{ backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: '0.375rem', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>🏝️ Bali May 2027</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--lib-text-secondary)', margin: '0.25rem 0' }}>6 spots left</div>
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.4rem 0.75rem',
                backgroundColor: accentColor,
                color: 'white',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              Register →
            </div>
          </div>
        </div>
      );

    case 'social_grid':
      return (
        <div className="lib-block">
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lib-text-secondary)', margin: '0 0 0.5rem 0' }}>
            {block.title || 'Social'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.25rem' }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  aspectRatio: '1',
                  backgroundColor: 'rgba(0,0,0,0.08)',
                  borderRadius: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                }}
              >
                📸
              </div>
            ))}
          </div>
        </div>
      );

    case 'tip_jar':
      return (
        <div className="lib-block" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>☕</div>
          <p style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
            {block.title || 'Buy me a coffee'}
          </p>
          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
            {['€3', '€5', '€10'].map((amt) => (
              <div
                key={amt}
                style={{
                  padding: '0.3rem 0.6rem',
                  border: `1px solid ${accentColor}`,
                  borderRadius: '0.25rem',
                  fontSize: '0.8rem',
                  color: accentColor,
                  fontWeight: 600,
                }}
              >
                {amt}
              </div>
            ))}
          </div>
        </div>
      );

    case 'email_signup':
      return (
        <div className="lib-block">
          <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
            {block.title || '📧 Stay updated'}
          </p>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <div
              style={{
                flex: 1,
                padding: '0.4rem 0.6rem',
                border: '1px solid var(--lib-block-border)',
                borderRadius: '0.25rem',
                fontSize: '0.8rem',
                color: 'var(--lib-text-secondary)',
              }}
            >
              your@email.com
            </div>
            <div
              style={{
                padding: '0.4rem 0.75rem',
                backgroundColor: accentColor,
                color: 'white',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              Subscribe
            </div>
          </div>
        </div>
      );

    case 'affiliate_featured':
      return (
        <div className="lib-block">
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lib-text-secondary)', margin: '0 0 0.5rem 0' }}>
            {block.title || 'Recommended Links'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {['🏨 10% off Booking.com', '✈️ Find cheap flights', '📷 My camera gear'].map((item) => (
              <div
                key={item}
                style={{
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'rgba(0,0,0,0.05)',
                  borderRadius: '0.375rem',
                  fontSize: '0.82rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {item}
                <span style={{ color: accentColor, fontSize: '0.75rem' }}>→</span>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}
