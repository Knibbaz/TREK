import React, { useEffect, useState } from 'react'
import { Compass, Calendar, ShoppingBag, X, MapPin, ChevronDown, ChevronUp, Users } from 'lucide-react'
import { useTranslation } from '../i18n'
import { exploreApi } from '../api/client'
import Navbar from '../components/Layout/Navbar'
import { useToast } from '../components/shared/Toast'

interface ExploreTrip {
  id: number
  title: string
  description: string
  cover_url: string | null
  start_date: string
  end_date: string
  price: number
  duration_days: number
  places_count: number
  owner_name: string
  version: number
  descriptions: string // JSON string {"en": "...", "nl": "..."}
  community_enabled: number
  community_places_count?: number
}

interface ExplorePlace {
  id: number
  name: string
  description: string | null
  image_url: string | null
  price: number | null
  currency: string | null
  day_id: number
  order_index: number
  reservation_status: string | null
  category_name: string | null
  category_color: string | null
}

interface ExploreDay {
  id: number
  day_number: number
  title: string | null
  date: string | null
  notes: string | null
  places: ExplorePlace[]
  budget_estimate: number
  bookings_needed: number
}

interface TripDetail extends ExploreTrip {
  days: ExploreDay[]
}

const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  'linear-gradient(135deg, #96fbc4 0%, #f9f586 100%)',
]
function tripGradient(id: number): string { return GRADIENTS[id % GRADIENTS.length] }

function getLocalizedDescription(trip: ExploreTrip | TripDetail, language: string): string {
  try {
    const descs: Record<string, string> = typeof trip.descriptions === 'string'
      ? JSON.parse(trip.descriptions)
      : (trip.descriptions as unknown as Record<string, string> || {})
    return descs[language] || descs['en'] || Object.values(descs)[0] || trip.description || ''
  } catch {
    return trip.description || ''
  }
}

function formatDateShort(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function Stat({ value, label }: { value: number | string; label: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{value}</span>
      <span style={{ fontSize: 11, color: '#9ca3af' }}>{label}</span>
    </div>
  )
}

// ── Trip card ─────────────────────────────────────────────────────────────────
interface ExploreCardProps {
  trip: ExploreTrip
  onView: (trip: ExploreTrip) => void
  t: (key: string) => string
  language: string
}

function ExploreCard({ trip, onView, t, language }: ExploreCardProps): React.ReactElement {
  const [hovered, setHovered] = useState(false)

  const coverBg = trip.cover_url
    ? `url(${trip.cover_url}) center/cover no-repeat`
    : tripGradient(trip.id)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onView(trip)}
      style={{
        background: hovered ? 'var(--bg-tertiary)' : 'var(--bg-card)',
        borderRadius: 16,
        overflow: 'hidden',
        border: `1px solid ${hovered ? 'var(--text-faint)' : 'var(--border-primary)'}`,
        transition: 'all 0.18s',
        boxShadow: hovered ? '0 8px 28px rgba(0,0,0,0.15)' : '0 1px 4px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        cursor: 'pointer',
      }}
    >
      {/* Image area */}
      <div style={{ height: 120, background: coverBg, position: 'relative', overflow: 'hidden' }}>
        {trip.cover_url && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 60%)' }} />
        )}
        {/* Explore badge */}
        <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{
            fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
            background: 'rgba(99,102,241,0.85)', color: 'white', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Compass size={10} />
            Explore
          </span>
          {trip.community_enabled ? (
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
              background: 'rgba(139,92,246,0.85)', color: 'white', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Users size={10} />
              {t('explore.communityBadge')}
            </span>
          ) : null}
        </div>
        {/* Price badge */}
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
            background: 'rgba(0,0,0,0.45)', color: 'white', backdropFilter: 'blur(4px)',
          }}>
            {trip.price === 0 ? t('explore.free') || 'Gratis' : `€${trip.price}`}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
          {trip.title}
        </div>

        {getLocalizedDescription(trip, language) && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {getLocalizedDescription(trip, language)}
          </p>
        )}

        {(trip.start_date || trip.end_date) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            <Calendar size={11} style={{ flexShrink: 0 }} />
            {trip.start_date && trip.end_date
              ? `${formatDateShort(trip.start_date)} — ${formatDateShort(trip.end_date)}`
              : formatDateShort(trip.start_date || trip.end_date)}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Stat label={t('dashboard.days') || 'dagen'} value={trip.duration_days || 0} />
          <Stat label={t('dashboard.places') || 'plekken'} value={trip.places_count || 0} />
        </div>

        <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 10 }}>
          <button
            onClick={e => { e.stopPropagation(); onView(trip) }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 10, border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {t('explore.viewDetails') || 'Bekijk reis'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Day accordion item ────────────────────────────────────────────────────────
function DayItem({ day, t }: { day: ExploreDay; t: (key: string) => string }): React.ReactElement {
  const [open, setOpen] = useState(day.day_number <= 2)

  const hasBudget = day.budget_estimate > 0
  const hasBookings = day.bookings_needed > 0

  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border-primary)', overflow: 'hidden' }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'var(--bg-secondary)', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            width: 24, height: 24, borderRadius: 99, background: 'var(--accent)', color: 'var(--accent-text)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>
            {day.day_number}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {day.title || `${t('explore.day')} ${day.day_number}`}
            </div>
            {day.date && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                {formatDateShort(day.date)}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
          {hasBudget && (
            <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
              ~€{day.budget_estimate}
            </span>
          )}
          {hasBookings && (
            <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: 'rgba(245,158,11,0.12)', color: '#d97706' }}>
              {day.bookings_needed} {t('explore.toBook') || 'te boeken'}
            </span>
          )}
          {open ? <ChevronUp size={14} style={{ color: 'var(--text-faint)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-faint)' }} />}
        </div>
      </button>

      {open && (
        <div style={{ padding: '10px 14px 14px' }}>
          {/* Day notes as description */}
          {day.notes && (
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {day.notes}
            </p>
          )}

          {day.places.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {day.places.map(place => (
                <div key={place.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '8px 10px', borderRadius: 10,
                  background: 'var(--bg-secondary)',
                }}>
                  {/* Thumbnail */}
                  {place.image_url
                    ? <img src={place.image_url} alt={place.name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                    : (
                      <div style={{
                        width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                        background: place.category_color || 'var(--bg-tertiary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <MapPin size={14} style={{ color: 'white', opacity: 0.8 }} />
                      </div>
                    )
                  }

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {place.name}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {place.price != null && place.price > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#059669' }}>
                            €{place.price}
                          </span>
                        )}
                        {place.reservation_status && place.reservation_status !== 'none' && (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', color: '#d97706' }}>
                            {t('explore.book') || 'boeken'}
                          </span>
                        )}
                      </div>
                    </div>
                    {place.category_name && (
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{place.category_name}</div>
                    )}
                    {place.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {place.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              {t('explore.noPlaces')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Detail panel (slide-in) ───────────────────────────────────────────────────
interface DetailPanelProps {
  trip: ExploreTrip
  detail: TripDetail | null
  loadingDetail: boolean
  purchasing: boolean
  onClose: () => void
  onPurchase: (trip: ExploreTrip) => void
  t: (key: string) => string
  language: string
}

function DetailPanel({ trip, detail, loadingDetail, purchasing, onClose, onPurchase, t, language }: DetailPanelProps): React.ReactElement {
  const coverBg = trip.cover_url
    ? `url(${trip.cover_url}) center/cover no-repeat`
    : tripGradient(trip.id)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40, backdropFilter: 'blur(2px)' }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 480,
        background: 'var(--bg-primary)', zIndex: 50,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.2)',
        animation: 'slideInRight 0.22s ease-out',
      }}>
        {/* Cover header */}
        <div style={{ height: 200, background: coverBg, position: 'relative', flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.1) 60%)' }} />

          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 99,
              background: 'rgba(0,0,0,0.4)', border: 'none', color: 'white', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)',
            }}
          >
            <X size={16} />
          </button>

          <div style={{ position: 'absolute', bottom: 16, left: 20, right: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: 'rgba(99,102,241,0.85)', color: 'white',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Compass size={10} /> Explore
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>
              {trip.title}
            </h2>
            {(trip.start_date || trip.end_date) && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
                <Calendar size={11} style={{ display: 'inline', marginRight: 4 }} />
                {trip.start_date && trip.end_date
                  ? `${formatDateShort(trip.start_date)} — ${formatDateShort(trip.end_date)}`
                  : formatDateShort(trip.start_date || trip.end_date)}
              </p>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 0' }}>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {[
              { value: trip.duration_days || 0, label: t('dashboard.days') || 'dagen' },
              { value: trip.places_count || 0, label: t('dashboard.places') || 'plekken' },
              ...(trip.community_enabled ? [{ value: trip.community_places_count || 0, label: t('explore.communityTipsLabel') || 'community tips', purple: true }] : []),
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, padding: '10px 14px', borderRadius: 12,
                background: (s as any).purple ? 'rgba(139,92,246,0.08)' : 'var(--bg-secondary)',
                border: (s as any).purple ? '1px solid rgba(139,92,246,0.25)' : '1px solid var(--border-primary)',
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: (s as any).purple ? '#8b5cf6' : 'var(--text-primary)' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Description */}
          {getLocalizedDescription(detail ?? trip, language) && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
              {getLocalizedDescription(detail ?? trip, language)}
            </p>
          )}

          {/* Days */}
          <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('explore.itinerary') || 'Reisschema'}
          </h3>

          {loadingDetail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 44, borderRadius: 12, background: 'var(--bg-secondary)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          )}

          {!loadingDetail && detail && detail.days.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 120 }}>
              {detail.days.map(day => (
                <DayItem key={day.id} day={day} t={t} />
              ))}
            </div>
          )}

          {!loadingDetail && detail && detail.days.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>
              {t('explore.noDays') || 'Geen dagen beschikbaar'}
            </p>
          )}
        </div>

        {/* Sticky buy footer */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '16px 20px', background: 'var(--bg-primary)',
          borderTop: '1px solid var(--border-primary)',
          backdropFilter: 'blur(12px)',
        }}>
          <button
            onClick={() => onPurchase(trip)}
            disabled={purchasing}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 20px', borderRadius: 12, border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              cursor: purchasing ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              opacity: purchasing ? 0.7 : 1, transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { if (!purchasing) e.currentTarget.style.opacity = '0.85' }}
            onMouseLeave={e => { if (!purchasing) e.currentTarget.style.opacity = '1' }}
          >
            <ShoppingBag size={15} />
            {purchasing
              ? (t('common.saving') || 'Bezig...')
              : trip.price === 0
                ? (t('explore.addFree') || 'Gratis toevoegen aan mijn reizen')
                : (t('explore.buy') || `Toevoegen · €${trip.price}`)}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  )
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard(): React.ReactElement {
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border-primary)', background: 'var(--bg-card)' }}>
      <div style={{ height: 120, background: 'var(--bg-tertiary)', animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ height: 14, width: '60%', background: 'var(--bg-tertiary)', borderRadius: 6, marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ height: 11, width: '85%', background: 'var(--bg-tertiary)', borderRadius: 6, marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ height: 32, background: 'var(--bg-tertiary)', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ExplorePage(): React.ReactElement {
  const { t, language } = useTranslation()
  const [trips, setTrips] = useState<ExploreTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTrip, setSelectedTrip] = useState<ExploreTrip | null>(null)
  const [detail, setDetail] = useState<TripDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [exploreFilter, setExploreFilter] = useState<'all' | 'curated' | 'community'>('all')
  const toast = useToast()

  const filteredTrips = trips.filter(trip => {
    if (exploreFilter === 'curated') return !trip.community_enabled
    if (exploreFilter === 'community') return !!trip.community_enabled
    return true
  })

  useEffect(() => {
    loadTrips()
  }, [])

  const loadTrips = async () => {
    try {
      setLoading(true)
      const data = await exploreApi.listTrips()
      setTrips(data.trips || [])
    } catch (err) {
      console.error('Error loading explore trips:', err)
      toast.error(t('explore.errorLoading') || 'Kon reizen niet laden')
    } finally {
      setLoading(false)
    }
  }

  const handleView = async (trip: ExploreTrip) => {
    setSelectedTrip(trip)
    setDetail(null)
    setLoadingDetail(true)
    try {
      const data = await exploreApi.getTrip(trip.id)
      setDetail({ ...data.trip, days: data.days ?? [] })
    } catch (err) {
      console.error('Error loading trip details:', err)
      toast.error(t('explore.errorLoadingDetails') || 'Kon reisdetails niet laden')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleClose = () => {
    setSelectedTrip(null)
    setDetail(null)
  }

  const handlePurchase = async (trip: ExploreTrip) => {
    const label = trip.price === 0
      ? `"${trip.title}" gratis toevoegen aan je reizen?`
      : `"${trip.title}" kopen voor €${trip.price} en toevoegen aan je reizen?`

    if (!window.confirm(label)) return

    try {
      setPurchasing(true)
      await exploreApi.purchaseTrip(trip.id, { title: trip.title })
      toast.success(t('explore.purchaseSuccess') || `"${trip.title}" toegevoegd aan je reizen!`)
      handleClose()
    } catch (err) {
      console.error('Error adding trip:', err)
      toast.error(t('explore.purchaseError') || 'Toevoegen mislukt')
    } finally {
      setPurchasing(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" }}>
      <Navbar />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 24px 48px' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Compass size={22} style={{ color: 'var(--text-primary)' }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
              {t('explore.title') || 'Explore'}
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            {t('explore.subtitle') || 'Ontdek samengestelde reizen en voeg ze toe aan jouw collectie'}
          </p>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {(['all', 'curated', 'community'] as const).map(f => (
            <button
              key={f}
              onClick={() => setExploreFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 600,
                border: exploreFilter === f ? 'none' : '1px solid var(--border-primary)',
                background: exploreFilter === f
                  ? (f === 'community' ? 'rgba(139,92,246,0.15)' : 'var(--accent-primary)')
                  : 'var(--bg-card)',
                color: exploreFilter === f
                  ? (f === 'community' ? '#8b5cf6' : 'white')
                  : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {f === 'community' && <Users size={12} />}
              {f === 'all' ? (t('explore.filter_all') || 'All') : f === 'curated' ? (t('explore.filter_curated') || 'Curated') : (t('explore.filter_community') || 'Community')}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Grid */}
        {!loading && filteredTrips.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {filteredTrips.map(trip => (
              <ExploreCard key={trip.id} trip={trip} onView={handleView} t={t} language={language} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredTrips.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Compass size={44} style={{ color: 'var(--text-faint)', marginBottom: 16 }} />
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-faint)' }}>
              {t('explore.noTrips') || 'Nog geen reizen beschikbaar'}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
              {t('explore.noTripsHint') || 'Admins kunnen reizen publiceren via het dashboard'}
            </p>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedTrip && (
        <DetailPanel
          trip={selectedTrip}
          detail={detail}
          loadingDetail={loadingDetail}
          purchasing={purchasing}
          onClose={handleClose}
          onPurchase={handlePurchase}
          t={t}
          language={language}
        />
      )}
    </div>
  )
}
