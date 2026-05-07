import React, { useEffect, useState, useCallback } from 'react'
import { Compass, Calendar, ShoppingBag, X, MapPin, ChevronDown, ChevronUp, Users, Upload, Clock, CheckCircle, XCircle, CreditCard, Tag, Plus, Trash2, Edit2, Search, SlidersHorizontal, Star, ArrowUpDown, ChevronLeft, ChevronRight, Filter, ExternalLink } from 'lucide-react'
import { useTranslation } from '../i18n'
import { useNavigate } from 'react-router-dom'
import { exploreApi, tripsApi, mollieApi, categoriesApi } from '../api/client'
import Navbar from '../components/Layout/Navbar'
import { useToast } from '../components/shared/Toast'
import { useAuthStore } from '../store/authStore'
import { PublishModal } from '../components/Explore/PublishModal'
import { EarningsDetailModal } from '../components/Explore/EarningsDetailModal'
import { PaymentConfirmation } from '../components/Explore/PaymentConfirmation'

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
  avg_rating?: number
  rating_count?: number
  view_count?: number
  tagline?: string
  tags?: string
  destination?: string
  difficulty?: string
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
  already_purchased?: boolean
  user_trip_id?: number | null
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

        {/* Rating + views */}
        {(trip.avg_rating && trip.avg_rating > 0) || (trip.view_count && trip.view_count > 0) ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {trip.avg_rating && trip.avg_rating > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#d97706', fontWeight: 600 }}>
                <Star size={11} fill="#d97706" />
                {trip.avg_rating.toFixed(1)}
                {trip.rating_count ? <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({trip.rating_count})</span> : null}
              </div>
            )}
            {trip.view_count && trip.view_count > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                {trip.view_count} {t('explore.views') || 'views'}
              </div>
            )}
          </div>
        ) : null}

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
  onOpenTrip: (tripId: number) => void
  t: (key: string) => string
  language: string
  categoryStats: Array<{ name: string; color: string; icon: string; count: number }>
  totalBudget: number
}

function DetailPanel({ trip, detail, loadingDetail, purchasing, onClose, onPurchase, onOpenTrip, t, language, categoryStats, totalBudget }: DetailPanelProps): React.ReactElement {
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
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { value: trip.duration_days || 0, label: t('dashboard.days') || 'dagen' },
              { value: trip.places_count || 0, label: t('dashboard.places') || 'plekken' },
              ...(trip.avg_rating && trip.avg_rating > 0 ? [{ value: `${(trip.avg_rating).toFixed(1)}`, label: '★', rating: true }] : []),
              ...(trip.community_enabled ? [{ value: trip.community_places_count || 0, label: t('explore.communityTipsLabel') || 'community tips', purple: true }] : []),
            ].map(s => (
              <div key={s.label} style={{
                flex: '1 1 auto', minWidth: 70, padding: '10px 14px', borderRadius: 12,
                background: (s as any).purple ? 'rgba(139,92,246,0.08)' : (s as any).rating ? 'rgba(245,158,11,0.08)' : 'var(--bg-secondary)',
                border: (s as any).purple ? '1px solid rgba(139,92,246,0.25)' : (s as any).rating ? '1px solid rgba(245,158,11,0.25)' : '1px solid var(--border-primary)',
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: (s as any).purple ? '#8b5cf6' : (s as any).rating ? '#d97706' : 'var(--text-primary)' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Category stats */}
          {categoryStats.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('explore.categories') || 'Categorieën'}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {categoryStats.map(cat => (
                  <div key={cat.name} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 99,
                    background: `${cat.color}15`,
                    border: `1px solid ${cat.color}30`,
                    fontSize: 12, color: cat.color, fontWeight: 600,
                  }}>
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                    <span style={{ opacity: 0.7 }}>{cat.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Budget estimate */}
          {totalBudget > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)',
              marginBottom: 20,
            }}>
              <span style={{ fontSize: 12, color: '#059669', fontWeight: 700 }}>
                {t('explore.estimatedBudget') || 'Geschat budget'}: ~€{totalBudget}
              </span>
            </div>
          )}

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
          {detail?.already_purchased && detail?.user_trip_id ? (
            <button
              onClick={() => onOpenTrip(detail.user_trip_id!)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 20px', borderRadius: 12, border: 'none',
                background: '#059669', color: 'white',
                cursor: 'pointer',
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <ExternalLink size={15} />
              {t('explore.openTrip') || 'Openen in mijn reizen'}
            </button>
          ) : (
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
          )}
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

interface MySubmission {
  id: number
  trip_id: number
  status: 'pending' | 'approved' | 'rejected'
  price: number
  title: string
  updated_at: string
}

interface SubmitFormState {
  tripId: number | null
  price: string
  description: string
  communityEnabled: boolean
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ExplorePage(): React.ReactElement {
  const { t, language } = useTranslation()
  const user = useAuthStore(s => s.user)
  const isCreator = user?.role === 'creator' || user?.role === 'admin'
  const navigate = useNavigate()
  const [featured, setFeatured] = useState<ExploreTrip[]>([])
  const [trips, setTrips] = useState<ExploreTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTrip, setSelectedTrip] = useState<ExploreTrip | null>(null)
  const [detail, setDetail] = useState<TripDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [exploreFilter, setExploreFilter] = useState<'all' | 'curated' | 'community'>('all')
  const [mySubmissions, setMySubmissions] = useState<MySubmission[]>([])
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [myTrips, setMyTrips] = useState<Array<{ id: number; title: string }>>([])
  const [submitForm, setSubmitForm] = useState<SubmitFormState>({ tripId: null, price: '0', description: '', communityEnabled: false })
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  // Search, filter, sort, pagination state
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'rating' | 'price_asc' | 'price_desc'>('newest')
  const [showFilters, setShowFilters] = useState(false)
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [filterDestination, setFilterDestination] = useState('')
  const [filterDifficulty, setFilterDifficulty] = useState('')
  const [page, setPage] = useState(1)
  const [totalResults, setTotalResults] = useState(0)
  const [limit] = useState(20)
  const [categoryStats, setCategoryStats] = useState<Array<{ name: string; color: string; icon: string; count: number }>>([])
  const [totalBudget, setTotalBudget] = useState(0)

  // Mollie status (platform payments)
  const [mollieStatus, setMollieStatus] = useState<{ connected: boolean; profileId: string | null } | null>(null)

  // Earnings state
  const [earnings, setEarnings] = useState<any>(null)
  const [showEarningsDetail, setShowEarningsDetail] = useState(false)
  const [detailedEarnings, setDetailedEarnings] = useState<any>(null)
  const [loadingDetailedEarnings, setLoadingDetailedEarnings] = useState(false)

  // Category management state
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [myCategories, setMyCategories] = useState<Array<{ id: number; name: string; color: string; icon: string }>>([])
  const [categoryForm, setCategoryForm] = useState({ name: '', color: '#6366f1', icon: '📍' })
  const [editingCategory, setEditingCategory] = useState<number | null>(null)
  const [savingCategory, setSavingCategory] = useState(false)

  // Payment confirmation state
  const [paymentModalStatus, setPaymentModalStatus] = useState<'processing' | 'success' | 'failed' | 'cancelled' | null>(null)
  const [paymentModalTripId, setPaymentModalTripId] = useState<string | null>(null)

  const filteredTrips = trips

  useEffect(() => {
    loadTrips()
    if (isCreator) {
      loadMySubmissions()
      loadMollieStatus()
      loadEarnings()
      loadMyCategories()
    }

    // Handle payment redirect query params (one-shot on mount)
    const params = new URLSearchParams(window.location.search)
    const urlPaymentStatus = params.get('payment')
    const urlTripId = params.get('trip_id')
    if (urlPaymentStatus) {
      if (urlPaymentStatus === 'processing') {
        setPaymentModalStatus('processing')
      } else if (urlPaymentStatus === 'success' || urlPaymentStatus === 'paid') {
        setPaymentModalStatus('success')
      } else if (urlPaymentStatus === 'cancelled' || urlPaymentStatus === 'canceled') {
        setPaymentModalStatus('cancelled')
      } else if (urlPaymentStatus === 'failed' || urlPaymentStatus === 'error') {
        setPaymentModalStatus('failed')
      }
      if (urlTripId) {
        setPaymentModalTripId(urlTripId)
      }
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadMySubmissions = async () => {
    try {
      const data = await exploreApi.getMySubmissions()
      setMySubmissions(data.submissions || [])
    } catch {}
  }

  const loadMollieStatus = async () => {
    try {
      const data = await mollieApi.getStatus()
      setMollieStatus(data)
    } catch {}
  }

  const loadEarnings = async () => {
    try {
      const data = await exploreApi.getEarnings()
      setEarnings(data)
    } catch {}
  }

  const loadDetailedEarnings = async () => {
    try {
      setLoadingDetailedEarnings(true)
      const data = await exploreApi.getDetailedEarnings()
      setDetailedEarnings(data)
    } catch (err) {
      console.error('Error loading detailed earnings:', err)
    } finally {
      setLoadingDetailedEarnings(false)
    }
  }

  const handleOpenEarningsDetail = async () => {
    setShowEarningsDetail(true)
    if (!detailedEarnings) {
      await loadDetailedEarnings()
    }
  }

  const loadMyCategories = async () => {
    try {
      const data = await categoriesApi.listMy()
      setMyCategories(data.categories || [])
    } catch {}
  }

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) return
    try {
      setSavingCategory(true)
      if (editingCategory) {
        await categoriesApi.update(editingCategory, categoryForm)
      } else {
        await categoriesApi.create(categoryForm)
      }
      setCategoryForm({ name: '', color: '#6366f1', icon: '📍' })
      setEditingCategory(null)
      await loadMyCategories()
      toast.success(t('explore.categorySaved') || 'Categorie opgeslagen')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('explore.categoryError') || 'Fout bij opslaan')
    } finally {
      setSavingCategory(false)
    }
  }

  const handleDeleteCategory = async (id: number) => {
    if (!window.confirm(t('explore.deleteCategoryConfirm') || 'Categorie verwijderen?')) return
    try {
      await categoriesApi.delete(id)
      await loadMyCategories()
      toast.success(t('explore.categoryDeleted') || 'Categorie verwijderd')
    } catch {
      toast.error(t('explore.categoryDeleteError') || 'Verwijderen mislukt')
    }
  }

  const openSubmitModal = async () => {
    try {
      const data = await tripsApi.list({ is_archived: false })
      const submittedTripIds = new Set(mySubmissions.filter(s => s.status === 'pending' || s.status === 'approved').map(s => s.trip_id))
      const available = (data.trips || []).filter((trip: any) => !submittedTripIds.has(trip.id))
      setMyTrips(available)
      setSubmitForm({ tripId: available[0]?.id ?? null, price: '0', description: '', communityEnabled: false })
      setShowSubmitModal(true)
    } catch {
      toast.error(t('explore.loadTripsError'))
    }
  }

  const handleSubmit = async () => {
    if (!submitForm.tripId) return
    try {
      setSubmitting(true)
      const descriptions = submitForm.description ? { nl: submitForm.description, en: submitForm.description } : undefined
      const result = await exploreApi.submitTrip(submitForm.tripId, {
        price: Number(submitForm.price) || 0,
        descriptions,
        community_enabled: submitForm.communityEnabled,
      })
      setShowSubmitModal(false)
      await loadMySubmissions()
      toast.success(result.auto_approved ? t('explore.autoApproveSuccess') : t('explore.submitSuccess'))
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('explore.submitError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleWithdraw = async (submissionId: number) => {
    if (!window.confirm(t('explore.withdrawConfirm'))) return
    try {
      await exploreApi.withdrawSubmission(submissionId)
      await loadMySubmissions()
      toast.success(t('explore.withdrawSuccess'))
    } catch {
      toast.error(t('explore.withdrawError'))
    }
  }

  const loadFeatured = useCallback(async () => {
    try {
      const data = await exploreApi.getFeaturedTrips(6)
      setFeatured(data.featured || [])
    } catch (err) {
      console.error('Error loading featured trips:', err)
    }
  }, [])

  const loadTrips = useCallback(async () => {
    try {
      setLoading(true)
      const params: any = {
        filter: exploreFilter,
        sort: sortBy,
        page,
        limit,
      }
      if (searchQuery.trim()) params.q = searchQuery.trim()
      if (minPrice) params.minPrice = Number(minPrice)
      if (maxPrice) params.maxPrice = Number(maxPrice)
      if (filterDestination.trim()) params.destination = filterDestination.trim()
      if (filterDifficulty) params.difficulty = filterDifficulty

      const data = await exploreApi.listTrips(params)
      setTrips(data.trips || [])
      setTotalResults(data.total || 0)
    } catch (err) {
      console.error('Error loading explore trips:', err)
      toast.error(t('explore.errorLoading') || 'Kon reizen niet laden')
    } finally {
      setLoading(false)
    }
  }, [exploreFilter, sortBy, page, limit, searchQuery, minPrice, maxPrice, filterDestination, filterDifficulty])

  useEffect(() => {
    loadFeatured()
    loadTrips()
  }, [loadFeatured, loadTrips])

  const handleView = async (trip: ExploreTrip) => {
    setSelectedTrip(trip)
    setDetail(null)
    setCategoryStats([])
    setTotalBudget(0)
    setLoadingDetail(true)
    try {
      const data = await exploreApi.getTrip(trip.id)
      setDetail({ ...data.trip, days: data.days ?? [], already_purchased: data.already_purchased, user_trip_id: data.user_trip_id })
      setCategoryStats(data.category_stats || [])
      setTotalBudget(data.total_budget_estimate || 0)
    } catch (err) {
      console.error('Error loading trip details:', err)
      toast.error(t('explore.errorLoadingDetails') || 'Kon reisdetails niet laden')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleOpenTrip = (tripId: number) => {
    navigate(`/journey/${tripId}`)
  }

  const handleClose = () => {
    setSelectedTrip(null)
    setDetail(null)
  }

  const handlePurchase = async (trip: ExploreTrip) => {
    // If already purchased, open it
    if (detail?.already_purchased && detail?.user_trip_id) {
      handleOpenTrip(detail.user_trip_id)
      return
    }

    if (trip.price === 0) {
      const label = `"${trip.title}" gratis toevoegen aan je reizen?`
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
      return
    }

    // Paid trip — redirect to Mollie checkout
    try {
      setPurchasing(true)
      const data = await exploreApi.createPayment(trip.id)
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        toast.error(t('explore.paymentError') || 'Betaling kon niet worden gestart')
      }
    } catch (err: any) {
      console.error('Error creating payment:', err)
      const msg = err?.response?.data?.error || t('explore.paymentError') || 'Betaling mislukt'
      toast.error(msg)
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

        {/* Creator: Mollie Connect + submit + submissions + earnings + categories */}
        {isCreator && (
          <div style={{ marginBottom: 24 }}>
            {/* Creator toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CreditCard size={14} style={{ color: mollieStatus?.connected ? '#059669' : 'var(--text-faint)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {mollieStatus?.connected
                    ? (t('explore.paymentsActive') || 'Betalingen actief')
                    : (t('explore.paymentsInactive') || 'Betalingen niet geconfigureerd')}
                </span>
              </div>
              <button
                onClick={() => setShowCategoryModal(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border-primary)',
                  background: 'var(--bg-card)', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                }}
              >
                <Tag size={11} /> {t('explore.myCategories') || 'Categorieën'}
              </button>
            </div>

            {/* Earnings summary */}
            {earnings && earnings.salesCount > 0 && (
              <button
                onClick={handleOpenEarningsDetail}
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  marginBottom: 12,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', transition: 'all 0.2s', transform: 'hover' ? 'translateY(-1px)' : 'none' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>{t('explore.sales') || 'Verkopen'}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#059669' }}>{earnings.salesCount}</div>
                </div>
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', transition: 'all 0.2s' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>{t('explore.revenue') || 'Omzet'}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>€{(earnings.totalSales / 100).toFixed(2)}</div>
                </div>
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', transition: 'all 0.2s' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>{t('explore.payout') || 'Verdiend'}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>€{(earnings.totalPayout / 100).toFixed(2)}</div>
                </div>
              </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t('explore.mySubmissions')}</span>
              <button
                onClick={openSubmitModal}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 10, border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-text)',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                }}
              >
                <Upload size={13} /> {t('explore.submitTrip')}
              </button>
            </div>
            {mySubmissions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {mySubmissions.map(s => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 10,
                    border: `1px solid ${s.status === 'pending' ? 'rgba(245,158,11,0.3)' : s.status === 'approved' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      {s.status === 'pending' && <Clock size={14} style={{ color: '#d97706' }} />}
                      {s.status === 'approved' && <CheckCircle size={14} style={{ color: '#059669' }} />}
                      {s.status === 'rejected' && <XCircle size={14} style={{ color: '#dc2626' }} />}
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.title}</span>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                        background: s.status === 'pending' ? 'rgba(245,158,11,0.15)' : s.status === 'approved' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: s.status === 'pending' ? '#d97706' : s.status === 'approved' ? '#059669' : '#dc2626',
                      }}>
                        {s.status === 'pending' ? t('explore.statusPending') : s.status === 'approved' ? t('explore.statusApproved') : t('explore.statusRejected')}
                      </span>
                      {s.status === 'approved' && s.price > 0 && (
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-faint)', marginLeft: 'auto' }}>
                          €{s.price}
                        </span>
                      )}
                    </div>
                    {s.status === 'pending' && (
                      <button
                        onClick={() => handleWithdraw(s.id)}
                        style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                      >
                        {t('explore.withdraw')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>
                {t('explore.noSubmissions')}
              </p>
            )}
          </div>
        )}

        {/* Search + Sort + Filter toolbar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {/* Search bar */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
                placeholder={t('explore.searchPlaceholder') || 'Zoek reizen, bestemmingen...'}
                style={{
                  width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10,
                  border: '1px solid var(--border-primary)', background: 'var(--bg-card)',
                  color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              onClick={() => setShowFilters(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border-primary)',
                background: showFilters ? 'var(--accent)' : 'var(--bg-card)',
                color: showFilters ? 'var(--accent-text)' : 'var(--text-muted)',
                cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              <SlidersHorizontal size={13} />
              {t('explore.filters') || 'Filters'}
            </button>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              style={{
                padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-primary)',
                background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              <option value="newest">{t('explore.sortNewest') || 'Nieuwste'}</option>
              <option value="popular">{t('explore.sortPopular') || 'Populair'}</option>
              <option value="rating">{t('explore.sortRating') || 'Best beoordeeld'}</option>
              <option value="price_asc">{t('explore.sortPriceAsc') || 'Prijs ↑'}</option>
              <option value="price_desc">{t('explore.sortPriceDesc') || 'Prijs ↓'}</option>
            </select>
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['all', 'curated', 'community'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setExploreFilter(f); setPage(1) }}
                style={{
                  padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
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
                {f === 'community' && <Users size={11} />}
                {f === 'all' ? (t('explore.filter_all') || 'Alles') : f === 'curated' ? (t('explore.filter_curated') || 'Gecureerd') : (t('explore.filter_community') || 'Community')}
              </button>
            ))}
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div style={{
              padding: '14px 16px', borderRadius: 12, background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)', display: 'flex', flexWrap: 'wrap', gap: 12,
            }}>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('explore.minPrice') || 'Min prijs'}</label>
                <input type="number" value={minPrice} onChange={e => { setMinPrice(e.target.value); setPage(1) }} placeholder="€0"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('explore.maxPrice') || 'Max prijs'}</label>
                <input type="number" value={maxPrice} onChange={e => { setMaxPrice(e.target.value); setPage(1) }} placeholder="€∞"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('explore.destination') || 'Bestemming'}</label>
                <input type="text" value={filterDestination} onChange={e => { setFilterDestination(e.target.value); setPage(1) }} placeholder="bijv. Thailand"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('explore.difficulty') || 'Moeilijkheid'}</label>
                <select value={filterDifficulty} onChange={e => { setFilterDifficulty(e.target.value); setPage(1) }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
                  <option value="">{t('explore.any') || 'Alle'}</option>
                  <option value="easy">{t('explore.easy') || 'Makkelijk'}</option>
                  <option value="moderate">{t('explore.moderate') || 'Gemiddeld'}</option>
                  <option value="challenging">{t('explore.challenging') || 'Uitdagend'}</option>
                </select>
              </div>
              <div style={{ flex: '1 1 100%', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => { setMinPrice(''); setMaxPrice(''); setFilterDestination(''); setFilterDifficulty(''); setPage(1) }}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                  {t('explore.resetFilters') || 'Reset filters'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Featured section */}
        {featured.length > 0 && !searchQuery && page === 1 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>⭐ {t('explore.featured') || 'Aanbevolen'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {featured.map(trip => (
                <ExploreCard key={trip.id} trip={trip} onView={handleView} t={t} language={language} />
              ))}
            </div>
          </div>
        )}

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
        {!loading && trips.length === 0 && (
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

        {/* Pagination */}
        {!loading && totalResults > limit && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-primary)',
                background: 'var(--bg-card)', color: page <= 1 ? 'var(--text-faint)' : 'var(--text-primary)',
                cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit',
              }}
            >
              <ChevronLeft size={14} /> {t('common.previous') || 'Vorige'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              {t('explore.pageOf') || 'Pagina'} {page} / {Math.ceil(totalResults / limit)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              ({totalResults} {t('explore.results') || 'resultaten'})
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= Math.ceil(totalResults / limit)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-primary)',
                background: 'var(--bg-card)', color: page >= Math.ceil(totalResults / limit) ? 'var(--text-faint)' : 'var(--text-primary)',
                cursor: page >= Math.ceil(totalResults / limit) ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit',
              }}
            >
              {t('common.next') || 'Volgende'} <ChevronRight size={14} />
            </button>
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
          onOpenTrip={handleOpenTrip}
          t={t}
          language={language}
          categoryStats={categoryStats}
          totalBudget={totalBudget}
        />
      )}

      {/* Publish modal */}
      <PublishModal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        trips={myTrips}
        onSubmitted={() => loadMySubmissions()}
      />

      {/* Earnings detail modal */}
      {detailedEarnings && (
        <EarningsDetailModal
          isOpen={showEarningsDetail}
          onClose={() => setShowEarningsDetail(false)}
          sales={detailedEarnings.sales || []}
          trips={detailedEarnings.trips || []}
          totalEarnings={earnings || { totalSales: 0, totalFees: 0, totalPayout: 0, salesCount: 0 }}
        />
      )}

      {/* Payment confirmation */}
      {paymentModalStatus && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, paddingTop: 80 }}>
          <div style={{ width: '100%', maxWidth: 480 }}>
            <PaymentConfirmation
              status={paymentModalStatus}
              tripId={paymentModalTripId || undefined}
              onDismiss={() => {
                setPaymentModalStatus(null)
                setPaymentModalTripId(null)
              }}
            />
          </div>
        </div>
      )}

      {/* Category management modal */}
      {showCategoryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowCategoryModal(false)}>
          <div style={{ background: 'var(--bg-primary)', borderRadius: 16, width: '100%', maxWidth: 480, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '80vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{t('explore.categoryModal.title') || 'Mijn categorieën'}</h2>
              <button onClick={() => setShowCategoryModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('explore.categoryModal.name') || 'Naam'}</label>
                <input type="text" value={categoryForm.name} onChange={e => setCategoryForm(f => ({ ...f, name: e.target.value }))} placeholder={t('explore.categoryModal.namePlaceholder') || 'Bijv. Museum'}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('explore.categoryModal.color') || 'Kleur'}</label>
                <input type="color" value={categoryForm.color} onChange={e => setCategoryForm(f => ({ ...f, color: e.target.value }))}
                  style={{ width: 40, height: 32, padding: 2, borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', cursor: 'pointer' }} />
              </div>
              <button onClick={handleSaveCategory} disabled={savingCategory || !categoryForm.name.trim()}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: savingCategory || !categoryForm.name.trim() ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', opacity: savingCategory || !categoryForm.name.trim() ? 0.7 : 1 }}>
                {editingCategory ? (t('explore.categoryModal.update') || 'Wijzig') : <Plus size={14} />}
              </button>
              {editingCategory && (
                <button onClick={() => { setEditingCategory(null); setCategoryForm({ name: '', color: '#6366f1', icon: '📍' }) }}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
                  {t('common.cancel') || 'Annuleer'}
                </button>
              )}
            </div>
            {myCategories.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myCategories.map(cat => (
                  <div key={cat.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, background: cat.color }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{cat.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => { setEditingCategory(cat.id); setCategoryForm({ name: cat.name, color: cat.color, icon: cat.icon }) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4 }}>
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDeleteCategory(cat.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', padding: '20px 0' }}>
                {t('explore.categoryModal.noCategories') || 'Nog geen eigen categorieën'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
