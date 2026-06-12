import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { exploreApi } from '../api/client';
import { Star, MapPin, Users, AlertCircle } from 'lucide-react';

interface CreatorProfile {
  slug: string;
  display_name: string;
  bio: string;
  avatar: string;
  social_links: Record<string, string>;
}

interface StorefrontListing {
  trip_id: number;
  listing_title: string;
  tagline: string;
  tags: string;
  destination: string;
  difficulty: string;
  price: number;
  view_count: number;
  purchase_count: number;
  avg_rating: number;
  rating_count: number;
  is_featured: boolean;
  cover_image: string;
  start_date: string;
  end_date: string;
  day_count: number;
  place_count: number;
}

interface StorefrontStats {
  listing_count: number;
  total_sales: number;
  avg_rating: number;
}

function StorefrontCard({ listing }: { listing: StorefrontListing }): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const { t } = useTranslation();

  const gradientColors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe', '#ff6b6b'];
  const hashCode = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  };

  const coverBg = listing.cover_image
    ? `url(${listing.cover_image}) center/cover no-repeat`
    : `linear-gradient(135deg, ${gradientColors[hashCode(listing.listing_title) % gradientColors.length]}, ${gradientColors[(hashCode(listing.listing_title) + 1) % gradientColors.length]})`;

  return (
    <a
      href={`/explore?trip_id=${listing.trip_id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block',
        textDecoration: 'none',
        background: hovered ? 'var(--bg-tertiary)' : 'var(--bg-card)',
        borderRadius: 16,
        overflow: 'hidden',
        border: `1px solid ${hovered ? 'var(--text-faint)' : 'var(--border-primary)'}`,
        transition: 'all 0.18s',
        boxShadow: hovered ? '0 8px 28px rgba(0,0,0,0.15)' : '0 1px 4px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Image area */}
      <div style={{ height: 120, background: coverBg, position: 'relative', overflow: 'hidden' }}>
        {listing.cover_image && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 60%)' }} />
        )}
        {/* Featured badge */}
        {listing.is_featured && (
          <div style={{ position: 'absolute', top: 8, left: 8 }}>
            <span style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 99,
              background: 'rgba(251,191,36,0.85)',
              color: '#000',
              backdropFilter: 'blur(4px)',
            }}>
              ⭐ {t('explore.featured') || 'Featured'}
            </span>
          </div>
        )}
        {/* Price badge */}
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 99,
            background: 'rgba(0,0,0,0.45)',
            color: 'white',
            backdropFilter: 'blur(4px)',
          }}>
            {listing.price === 0 ? t('explore.free') || 'Gratis' : `€${listing.price}`}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{
          fontWeight: 700,
          fontSize: 14,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: 3,
        }}>
          {listing.listing_title}
        </div>

        {listing.destination && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            <MapPin size={11} style={{ flexShrink: 0 }} />
            {listing.destination}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{listing.day_count} {t('dashboard.days') || 'days'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{listing.place_count} {t('dashboard.places') || 'places'}</div>
        </div>

        {/* Rating */}
        {listing.avg_rating > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#d97706', fontWeight: 600, marginBottom: 10 }}>
            <Star size={11} fill="#d97706" />
            {listing.avg_rating.toFixed(1)}
            {listing.rating_count > 0 && <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({listing.rating_count})</span>}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 10 }}>
          <button
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--accent-text)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {t('explore.viewDetails') || 'Bekijk'}
          </button>
        </div>
      </div>
    </a>
  );
}

export function CreatorStorefrontPage(): React.ReactElement {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [listings, setListings] = useState<StorefrontListing[]>([]);
  const [stats, setStats] = useState<StorefrontStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    const loadStorefront = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await exploreApi.getCreatorStorefront(slug);
        setCreator(data.creator);
        setListings(data.listings);
        setStats(data.stats);
      } catch (err: any) {
        if (err.response?.status === 404) {
          setError(t('explore.creatorNotFound') || 'Creator not found');
        } else {
          setError('Failed to load creator');
        }
      } finally {
        setLoading(false);
      }
    };

    loadStorefront();
  }, [slug, t]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 14 }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={32} style={{ margin: '0 auto 12px', color: 'var(--text-muted)' }} />
          <div style={{ fontSize: 16, color: 'var(--text-primary)', fontWeight: 600 }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 14 }}>Creator not found</div>
        </div>
      </div>
    );
  }

  const socialLinks = typeof creator.social_links === 'string'
    ? JSON.parse(creator.social_links || '{}')
    : creator.social_links || {};

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px 60px' }}>
      {/* Profile Header */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 40, alignItems: 'flex-start' }}>
        {/* Avatar */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: 999,
          background: creator.avatar ? `url(${creator.avatar}) center/cover` : 'linear-gradient(135deg, #667eea, #764ba2)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          flexShrink: 0,
        }} />

        {/* Info */}
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>
            {creator.display_name}
          </h1>

          {creator.bio && (
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 600 }}>
              {creator.bio}
            </p>
          )}

          {/* Social Links */}
          {Object.keys(socialLinks).length > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {socialLinks.instagram && (
                <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: 12,
                  color: 'var(--accent)',
                  textDecoration: 'none',
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  cursor: 'pointer',
                }}>
                  Instagram
                </a>
              )}
              {socialLinks.twitter && (
                <a href={socialLinks.twitter} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: 12,
                  color: 'var(--accent)',
                  textDecoration: 'none',
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  cursor: 'pointer',
                }}>
                  Twitter
                </a>
              )}
              {socialLinks.website && (
                <a href={socialLinks.website} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: 12,
                  color: 'var(--accent)',
                  textDecoration: 'none',
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  cursor: 'pointer',
                }}>
                  Website
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 40 }}>
          <div style={{ padding: 16, borderRadius: 12, background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
              {t('explore.storefrontListings') || 'Listings'}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
              {stats.listing_count}
            </div>
          </div>

          <div style={{ padding: 16, borderRadius: 12, background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
              {t('explore.storefrontSales') || 'Sales'}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
              {stats.total_sales}
            </div>
          </div>

          <div style={{ padding: 16, borderRadius: 12, background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
              {t('explore.storefrontAvgRating') || 'Avg. rating'}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
              {stats.avg_rating > 0 ? stats.avg_rating.toFixed(1) : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Listings Grid */}
      {listings.length > 0 ? (
        <>
          <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('explore.storefrontListings') || 'Listings'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {listings.map(listing => (
              <StorefrontCard key={listing.trip_id} listing={listing} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-faint)' }}>
          <Users size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: 14 }}>
            {t('explore.storefrontEmpty') || 'No published trips yet'}
          </p>
        </div>
      )}
    </div>
  );
}
