import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import {
  Plus, Trash2, CalendarDays, ChevronLeft, ChevronRight,
  Globe, Briefcase, Plane, X, Check, Link2, BarChart2,
  Lock, Unlock, Copy, Zap
} from 'lucide-react'
import { dateProposalsApi, availabilityApi, settingsApi, groupsApi, tripsApi } from '../../api/client'
import { addListener, removeListener } from '../../api/websocket'
import { useAuthStore } from '../../store/authStore'
import { useTranslation, getLocaleForLanguage } from '../../i18n'
import { getAllCountries } from '../../i18n/countryNames'
import type { DateProposal, DateAvailabilityEntry, VacationDay, CompanyHoliday, DateProposalAnalysis } from '../../types'

// ── helpers ───────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfWeek(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7 // Mon=0 … Sun=6
}

function monthLabelLoc(year: number, month: number, loc?: string): string {
  return new Date(year, month, 1).toLocaleDateString(loc, { month: 'short', year: 'numeric' })
}

function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number)
  return { year: y, month: m }
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

// ── types ─────────────────────────────────────────────────────────────────────

type OverlayType = 'vacation' | 'vacayEntry' | 'company' | 'public' | 'availability'

interface DayOverlay {
  type: OverlayType
  color: string
  label: string
  userId?: number
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipProps {
  date: string
  x: number
  y: number
  overlays: DayOverlay[]
  availability: DateAvailabilityEntry[]
  members: DateProposal['members']
}

function Tooltip({ date, x, y, overlays, availability, members }: TooltipProps) {
  const { t, locale } = useTranslation()
  const entries = availability.filter(a => a.date === date)
  return createPortal(
    <div style={{
      position: 'fixed',
      left: Math.min(x, window.innerWidth - 240),
      top: Math.max(y - 10, 10),
      transform: 'translateY(-100%)',
      zIndex: 99999,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-primary)',
      borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      padding: '10px 14px',
      minWidth: 200,
      maxWidth: 280,
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6 }}>
        {new Date(date + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}
      </div>
      {overlays.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
          {overlays.map((o, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: o.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{o.label}</span>
            </div>
          ))}
        </div>
      )}
      {entries.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-faint)', paddingTop: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 4 }}>{t('dateAvail.groupResponses') || 'Group responses'}</div>
          {entries.map(e => (
            <div key={e.user_id} style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                <span style={{
                  fontWeight: 900, fontSize: 12,
                  color: e.status === 'yes' ? '#16a34a' : e.status === 'maybe' ? '#f59e0b' : '#dc2626',
                }}>{e.status === 'yes' ? '✓' : e.status === 'maybe' ? '?' : '✕'}</span>
                <span style={{ color: 'var(--text-primary)' }}>{e.username}</span>
              </div>
              {e.note && (
                <div style={{ fontSize: 10, color: 'var(--text-faint)', paddingLeft: 17, fontStyle: 'italic' }}>{e.note}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}

// ── NotePopover ───────────────────────────────────────────────────────────────

interface NotePopoverProps {
  date: string
  x: number
  y: number
  currentNote: string
  onSave: (note: string) => void
  onClose: () => void
}

function NotePopover({ date, x, y, currentNote, onSave, onClose }: NotePopoverProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(currentNote)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return createPortal(
    <div ref={ref} style={{
      position: 'fixed',
      left: Math.min(x, window.innerWidth - 220),
      top: Math.max(y - 10, 10),
      transform: 'translateY(-100%)',
      zIndex: 99999,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-primary)',
      borderRadius: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      padding: 10,
      width: 210,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6 }}>
        {new Date(date + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={e => setText(e.target.value.slice(0, 200))}
        placeholder={t('dateAvail.notePlaceholder') || 'Add a note...'}
        style={{
          width: '100%', height: 60, padding: '6px 8px', borderRadius: 6,
          border: '1px solid var(--border-primary)', background: 'var(--bg-input)',
          color: 'var(--text-primary)', fontSize: 12, resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
        }}
      />
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'right', marginBottom: 6 }}>{text.length}/200</div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)' }}>
          {t('common.cancel')}
        </button>
        <button onClick={() => { onSave(text); onClose() }} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
          {t('common.save') || 'Save'}
        </button>
      </div>
    </div>,
    document.body
  )
}

// ── MonthSelector ─────────────────────────────────────────────────────────────

interface MonthSelectorProps {
  fromMonth: string
  toMonth: string
  onChange: (from: string, to: string) => void
}

function MonthSelector({ fromMonth, toMonth, onChange }: MonthSelectorProps) {
  const { t, locale } = useTranslation()
  const now = new Date()
  const currentYear = now.getFullYear()

  const months: { key: string; label: string }[] = []
  for (let y = currentYear; y <= currentYear + 2; y++) {
    for (let m = 0; m < 12; m++) {
      months.push({ key: monthKey(y, m), label: monthLabelLoc(y, m, locale) })
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <CalendarDays size={14} style={{ color: 'var(--text-faint)' }} />
        <select
          value={fromMonth}
          onChange={e => onChange(e.target.value, toMonth)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}
        >
          {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>–</span>
      <select
        value={toMonth}
        onChange={e => onChange(fromMonth, e.target.value)}
        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}
      >
        {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
    </div>
  )
}

// ── MonthGrid ─────────────────────────────────────────────────────────────────

const DAY_LABELS = ['M', 'D', 'W', 'D', 'V', 'Z', 'Z']
const STATUS_CYCLE: Array<'yes' | 'no' | 'maybe'> = ['yes', 'no', 'maybe']

// Status colors
const STATUS_COLOR = {
  yes:   '#22c55e',
  maybe: '#f97316',
  no:    '#ef4444',
} as const

interface MonthGridProps {
  year: number
  month: number
  proposal: DateProposal
  myStatus: Record<string, 'yes' | 'no' | 'maybe'>
  myNotes: Record<string, string>
  onToggle: (date: string) => void
  onNoteOpen: (date: string, x: number, y: number) => void
  publicHolidays: Record<string, { name: string }>
  viewMode: 'mine' | 'group'
  highlightRange?: { start: string; end: string } | null
  readOnly?: boolean
}

function MonthGrid({ year, month, proposal, myStatus, myNotes, onToggle, onNoteOpen, publicHolidays, viewMode, highlightRange, readOnly }: MonthGridProps) {
  const { t } = useTranslation()
  const [tooltip, setTooltip] = useState<{ date: string; x: number; y: number; overlays: DayOverlay[] } | null>(null)

  const pad = (n: number) => String(n).padStart(2, '0')

  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }, [])

  // Build week rows like Vacay
  const weeks = useMemo(() => {
    const startDow = firstDayOfWeek(year, month)
    const count = daysInMonth(year, month)
    const cells: (number | null)[] = Array(startDow).fill(null)
    for (let d = 1; d <= count; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    const w: (number | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) w.push(cells.slice(i, i + 7))
    return w
  }, [year, month])

  const getOverlays = (date: string): DayOverlay[] => {
    const overlays: DayOverlay[] = []
    if (publicHolidays[date]) {
      overlays.push({ type: 'public', color: '#f59e0b', label: publicHolidays[date].name })
    }
    const ch = proposal.companyHolidays?.find(h => h.date === date)
    if (ch) overlays.push({ type: 'company', color: ch.color, label: ch.name })
    proposal.vacationDays?.forEach(v => {
      if (date >= v.start_date && date <= v.end_date) {
        const member = proposal.members.find(m => m.id === v.user_id)
        overlays.push({ type: 'vacation', color: v.color, label: `${member?.username || ''} — ${v.label || t('dateAvail.vacation') || 'Vacation'}`, userId: v.user_id })
      }
    })
    proposal.vacayEntries?.forEach(e => {
      if (e.date === date) {
        const member = proposal.members.find(m => m.id === e.user_id)
        overlays.push({ type: 'vacayEntry', color: '#7c3aed', label: `${member?.username || ''} — ${t('dateAvail.scheduledVacation') || 'Scheduled vacation'}`, userId: e.user_id })
      }
    })
    return overlays
  }

  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border-primary)' }}>
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--border-secondary)' }}>
        {DAY_LABELS.map((l, i) => (
          <div key={i} className="text-center py-1 text-[10px] font-semibold"
            style={{ color: i >= 5 ? 'var(--text-faint)' : 'var(--text-muted)' }}>
            {l}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day, di) => {
              const isWeekend = di >= 5

              if (day === null) return (
                <div key={di} style={{
                  height: 32,
                  borderTop: '1px solid var(--border-secondary)',
                  borderRight: di < 6 ? '1px solid var(--border-secondary)' : undefined,
                  background: isWeekend ? 'var(--bg-secondary)' : 'transparent',
                }} />
              )

              const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`
              const inRange = dateStr >= proposal.period_start && dateStr <= proposal.period_end
              const isToday = dateStr === todayStr
              const overlays = getOverlays(dateStr)
              const mine = myStatus[dateStr]
              const entries = proposal.availability.filter(a => a.date === dateStr)
              const yesCount  = entries.filter(e => e.status === 'yes').length
              const maybeCount = entries.filter(e => e.status === 'maybe').length
              const noCount   = entries.filter(e => e.status === 'no').length
              const total     = proposal.members.length
              const notYet    = total - entries.length

              const hasNote = !!myNotes[dateStr]
              const inConfirmed = highlightRange && dateStr >= highlightRange.start && dateStr <= highlightRange.end
              const heatRatio = viewMode === 'group' && total > 0 ? (yesCount + 0.5 * maybeCount) / total : 0

              return (
                <div
                  key={di}
                  className="relative flex items-center justify-center select-none"
                  style={{
                    height: 32,
                    borderTop: '1px solid var(--border-secondary)',
                    borderRight: di < 6 ? '1px solid var(--border-secondary)' : undefined,
                    background: inConfirmed && inRange
                      ? 'rgba(34, 197, 94, 0.12)'
                      : isWeekend ? 'var(--bg-secondary)' : 'transparent',
                    cursor: inRange && !readOnly ? 'pointer' : 'default',
                    opacity: inRange ? 1 : 0.3,
                  }}
                  onClick={() => inRange && !readOnly && onToggle(dateStr)}
                  onMouseEnter={e => {
                    if (inRange) {
                      e.currentTarget.style.background = readOnly ? 'var(--bg-hover)' : 'var(--bg-hover)'
                      const r = e.currentTarget.getBoundingClientRect()
                      setTooltip({ date: dateStr, x: r.left + r.width / 2, y: r.top, overlays })
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = inConfirmed && inRange
                      ? 'rgba(34, 197, 94, 0.12)'
                      : isWeekend ? 'var(--bg-secondary)' : 'transparent'
                    setTooltip(null)
                  }}
                >
                  {/* Overlay: public / company holiday tint */}
                  {overlays.filter(o => o.type !== 'vacation').map((o, i) => (
                    <div key={i} className="absolute inset-[2px] rounded-sm pointer-events-none"
                      style={{ background: o.color, opacity: 0.12 }} />
                  ))}

                  {/* Mijn modus: kleur-overlay over hele cel */}
                  {viewMode === 'mine' && mine && inRange && (
                    <div className="absolute inset-[2px] rounded-sm pointer-events-none"
                      style={{ background: STATUS_COLOR[mine], opacity: 0.28 }} />
                  )}

                  {/* Groep modus: heatmap achtergrond + proportiebalk */}
                  {viewMode === 'group' && inRange && heatRatio > 0 && (
                    <div className="absolute inset-0 pointer-events-none"
                      style={{ background: `rgba(34, 197, 94, ${heatRatio * 0.4})` }} />
                  )}
                  {viewMode === 'group' && entries.length > 0 && inRange && (
                    <div className="absolute bottom-0 left-0 right-0 flex pointer-events-none" style={{ height: 3 }}>
                      {yesCount   > 0 && <div style={{ flex: yesCount,   background: STATUS_COLOR.yes }} />}
                      {maybeCount > 0 && <div style={{ flex: maybeCount, background: STATUS_COLOR.maybe }} />}
                      {noCount    > 0 && <div style={{ flex: noCount,    background: STATUS_COLOR.no }} />}
                      {notYet     > 0 && <div style={{ flex: notYet,     background: 'var(--border-secondary)' }} />}
                    </div>
                  )}

                  {/* Kleine dots voor vakantie/feestdagen (linksboven) */}
                  {overlays.length > 0 && inRange && (
                    <div className="absolute top-[3px] left-[3px] flex gap-[2px] pointer-events-none">
                      {overlays.slice(0, 2).map((o, i) => (
                        <div key={i} className="rounded-full" style={{ width: 4, height: 4, background: o.color }} />
                      ))}
                    </div>
                  )}

                  {/* Notitie-indicator rechtsboven (mine mode) of status-symbool (group mode) */}
                  {viewMode === 'mine' && hasNote && inRange && (
                    <div className="absolute top-[2px] right-[2px] pointer-events-none"
                      style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', opacity: 0.8 }} />
                  )}
                  {viewMode === 'group' && mine && inRange && (
                    <div className="absolute top-[2px] right-[3px] pointer-events-none"
                      style={{ fontSize: 7, fontWeight: 900, lineHeight: 1, color: STATUS_COLOR[mine] }}>
                      {mine === 'yes' ? '✓' : mine === 'maybe' ? '◐' : '✕'}
                    </div>
                  )}

                  {/* Confirmed range border */}
                  {inConfirmed && inRange && (
                    <div className="absolute inset-0 pointer-events-none"
                      style={{ border: '1px solid rgba(34, 197, 94, 0.5)', borderRadius: 2 }} />
                  )}

                  {/* Dag nummer */}
                  <span
                    className="relative z-10 text-[11px]"
                    style={{
                      fontWeight: mine || entries.length > 0 ? 700 : 400,
                      color: isToday ? '#fff'
                        : overlays.some(o => o.type === 'public') ? '#d97706'
                        : isWeekend ? 'var(--text-faint)'
                        : 'var(--text-primary)',
                      ...(isToday ? {
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'var(--accent)',
                      } : {}),
                    }}
                    onContextMenu={e => {
                      if (inRange && !readOnly) {
                        e.preventDefault()
                        onNoteOpen(dateStr, e.clientX, e.clientY)
                      }
                    }}
                  >
                    {day}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {tooltip && (
        <Tooltip
          {...tooltip}
          availability={proposal.availability}
          members={proposal.members}
        />
      )}
    </div>
  )
}

// ── QuickSelectToolbar ────────────────────────────────────────────────────────

interface QuickSelectToolbarProps {
  proposal: DateProposal
  viewYear: number
  viewMonth: number
  onBulkSet: (updates: Record<string, 'yes' | 'no' | 'maybe'>) => void
}

function QuickSelectToolbar({ proposal, viewYear, viewMonth, onBulkSet }: QuickSelectToolbarProps) {
  const { t } = useTranslation()
  const pad = (n: number) => String(n).padStart(2, '0')

  const getDatesInView = (weekdaysOnly: boolean) => {
    const start = new Date(proposal.period_start + 'T00:00:00')
    const end = new Date(proposal.period_end + 'T00:00:00')
    const monthStart = new Date(viewYear, viewMonth, 1)
    const monthEnd = new Date(viewYear, viewMonth + 1, 0)
    const from = start > monthStart ? start : monthStart
    const to = end < monthEnd ? end : monthEnd
    const dates: string[] = []
    for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      if (weekdaysOnly && (d.getDay() === 0 || d.getDay() === 6)) continue
      dates.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    }
    return dates
  }

  const getAllDates = () => {
    const start = new Date(proposal.period_start + 'T00:00:00')
    const end = new Date(proposal.period_end + 'T00:00:00')
    const dates: string[] = []
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    }
    return dates
  }

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px',
    borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  }

  const setAll = (dates: string[], status: 'yes' | 'no') => {
    const updates: Record<string, 'yes' | 'no' | 'maybe'> = {}
    for (const d of dates) updates[d] = status
    onBulkSet(updates)
  }

  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', padding: '4px 16px 0' }}>
      <Zap size={11} style={{ color: 'var(--text-faint)', alignSelf: 'center', flexShrink: 0 }} />
      <button style={btnStyle} onClick={() => setAll(getDatesInView(false), 'yes')}>
        {t('dateAvail.monthAvailable') || 'Maand ✓'}
      </button>
      <button style={btnStyle} onClick={() => setAll(getDatesInView(false), 'no')}>
        {t('dateAvail.monthUnavailable') || 'Maand ✗'}
      </button>
      <button style={{ ...btnStyle, borderColor: 'transparent', background: 'transparent', color: 'var(--text-faint)' }}
        onClick={() => setAll(getAllDates(), 'yes')}>
        {t('dateAvail.allAvailable') || 'Alles ✓'}
      </button>
      <button style={{ ...btnStyle, borderColor: 'transparent', background: 'transparent', color: 'var(--text-faint)' }}
        onClick={() => setAll(getAllDates(), 'no')}>
        {t('dateAvail.allUnavailable') || 'Alles ✗'}
      </button>
    </div>
  )
}

// ── AnalysisPanel ─────────────────────────────────────────────────────────────

interface AnalysisPanelProps {
  groupId: number
  proposal: DateProposal
  onConfirm: (start: string, end: string) => void
  onHighlight: (range: { start: string; end: string } | null) => void
}

function AnalysisPanel({ groupId, proposal, onConfirm, onHighlight }: AnalysisPanelProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<DateProposalAnalysis | null>(null)
  const [minDays, setMinDays] = useState(5)
  const [error, setError] = useState('')

  const runAnalysis = async () => {
    setLoading(true); setError('')
    try {
      const data = await dateProposalsApi.getAnalysis(groupId, proposal.id, minDays) as DateProposalAnalysis
      setAnalysis(data)
    } catch { setError(t('common.error')) }
    finally { setLoading(false) }
  }

  const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })

  return (
    <div style={{ padding: '10px 16px 12px', borderTop: '1px solid var(--border-faint)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <BarChart2 size={13} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
          {t('dateAvail.overlapAnalysis') || 'Overlap analyse'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('dateAvail.minDays') || 'Min. dagen'}:</span>
          <input
            type="number" value={minDays} min={1} max={30}
            onChange={e => setMinDays(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
            style={{ width: 44, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border-primary)', fontSize: 11, background: 'var(--bg-input)', color: 'var(--text-primary)', textAlign: 'center' }}
          />
        </div>
        <button onClick={runAnalysis} disabled={loading}
          style={{ padding: '4px 12px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? '…' : t('dateAvail.analyze') || 'Analyseer'}
        </button>
      </div>

      {error && <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 8 }}>{error}</div>}

      {analysis && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>
            {t('dateAvail.analysisStats', {
              responded: analysis.statistics.totalResponded,
              total: analysis.statistics.totalMembers,
            }) || `${analysis.statistics.totalResponded}/${analysis.statistics.totalMembers} leden hebben gereageerd`}
          </div>
          {analysis.bestPeriods.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('dateAvail.noPeriodsFound') || 'Geen geschikte perioden gevonden. Probeer minder minimale dagen.'}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {analysis.bestPeriods.map((p, i) => (
                <div key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                    background: 'var(--bg-tertiary)', borderRadius: 8, cursor: 'pointer',
                    border: '1px solid var(--border-faint)',
                  }}
                  onMouseEnter={() => onHighlight({ start: p.start, end: p.end })}
                  onMouseLeave={() => onHighlight(null)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {fmt(p.start)} – {fmt(p.end)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>
                      {p.days} {t('dateAvail.days') || 'dagen'} · {p.avgPercent}% {t('dateAvail.available') || 'beschikbaar'}
                    </div>
                  </div>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: `conic-gradient(#22c55e ${p.avgPercent * 3.6}deg, var(--bg-secondary) 0)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {p.avgPercent}%
                    </div>
                  </div>
                  {proposal.status !== 'confirmed' && (
                    <button
                      onClick={() => onConfirm(p.start, p.end)}
                      style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#22c55e', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                      {t('dateAvail.confirm') || 'Bevestig'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── ProposalCard ──────────────────────────────────────────────────────────────

interface ProposalCardProps {
  proposal: DateProposal
  groupId: number
  currentUserId: number
  isAdmin: boolean
  groupTrips?: Array<{ id: number; title: string }>
  onDelete: (id: number) => void
  onAvailabilityChange: (proposalId: number, availability: DateAvailabilityEntry[]) => void
  onProposalUpdate: (proposalId: number, updates: Partial<DateProposal>) => void
  publicHolidays: Record<string, { name: string }>
}

function ProposalCard({ proposal, groupId, currentUserId, isAdmin, groupTrips, onDelete, onAvailabilityChange, onProposalUpdate, publicHolidays }: ProposalCardProps) {
  const { t } = useTranslation()
  const [viewMonth, setViewMonth] = useState<Date>(() => new Date(proposal.period_start + 'T00:00:00'))
  const [viewMode, setViewMode] = useState<'mine' | 'group'>('mine')
  const [pending, setPending] = useState<Record<string, 'yes' | 'no' | 'maybe'>>({})
  const [pendingNotes, setPendingNotes] = useState<Record<string, string | null>>({})
  const [saving, setSaving] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [highlightRange, setHighlightRange] = useState<{ start: string; end: string } | null>(null)
  const [confirmingPeriod, setConfirmingPeriod] = useState<{ start: string; end: string } | null>(null)
  const [showTripModal, setShowTripModal] = useState(false)
  const [showGuestPanel, setShowGuestPanel] = useState(false)
  const [notePopover, setNotePopover] = useState<{ date: string; x: number; y: number } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isConfirmed = proposal.status === 'confirmed'
  const isCreator = proposal.created_by === currentUserId
  const canManage = isAdmin || isCreator

  const hasMyEntries = proposal.availability.some(e => e.user_id === currentUserId)

  // Auto-prefill: eerste keer dat gebruiker de proposal ziet, alle dagen op 'ja' behalve vakantiedagen
  useEffect(() => {
    if (hasMyEntries || isConfirmed) return
    const pad = (n: number) => String(n).padStart(2, '0')
    const prefill: Record<string, 'yes' | 'no' | 'maybe'> = {}
    const start = new Date(proposal.period_start + 'T00:00:00')
    const end   = new Date(proposal.period_end   + 'T00:00:00')
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const onVacation = proposal.vacationDays?.some(
        v => v.user_id === currentUserId && dateStr >= v.start_date && dateStr <= v.end_date
      )
      const hasVacayEntry = proposal.vacayEntries?.some(
        e => e.user_id === currentUserId && e.date === dateStr
      )
      prefill[dateStr] = (onVacation || hasVacayEntry) ? 'no' : 'yes'
    }
    setPending(prefill)
    dateProposalsApi.setAvailability(groupId, proposal.id, prefill)
      .then(data => { onAvailabilityChange(proposal.id, data.availability); setPending({}) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal.id])

  const myStatus: Record<string, 'yes' | 'no' | 'maybe'> = {}
  const myNotes: Record<string, string> = {}
  for (const e of proposal.availability) {
    if (e.user_id === currentUserId) {
      myStatus[e.date] = e.status
      if (e.note) myNotes[e.date] = e.note
    }
  }
  for (const [d, s] of Object.entries(pending)) {
    myStatus[d] = s
  }

  const triggerSave = useCallback((statusSnap: Record<string, 'yes' | 'no' | 'maybe'>, notesSnap: Record<string, string | null>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        const data = await dateProposalsApi.setAvailability(groupId, proposal.id, statusSnap, notesSnap)
        onAvailabilityChange(proposal.id, data.availability)
        setPending({})
        setPendingNotes({})
      } catch { /* noop */ }
      setSaving(false)
    }, 300)
  }, [groupId, proposal.id, onAvailabilityChange])

  const toggleDate = (date: string) => {
    if (isConfirmed) return
    const current = myStatus[date]
    const idx = current ? STATUS_CYCLE.indexOf(current) : -1
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    const newPending = { ...pending, [date]: next }
    setPending(newPending)
    triggerSave(newPending, pendingNotes)
  }

  const handleBulkSet = (updates: Record<string, 'yes' | 'no' | 'maybe'>) => {
    if (isConfirmed) return
    const newPending = { ...pending, ...updates }
    setPending(newPending)
    triggerSave(newPending, pendingNotes)
  }

  const handleNoteOpen = (date: string, x: number, y: number) => {
    if (isConfirmed) return
    setNotePopover({ date, x, y })
  }

  const handleNoteSave = (date: string, note: string) => {
    const newNotes = { ...pendingNotes, [date]: note.trim() || null }
    setPendingNotes(newNotes)
    triggerSave(pending, newNotes)
  }

  const handleConfirm = async (start: string, end: string) => {
    try {
      await dateProposalsApi.confirm(groupId, proposal.id, { confirmed_start: start, confirmed_end: end })
      onProposalUpdate(proposal.id, { status: 'confirmed', confirmed_start: start, confirmed_end: end })
      setConfirmingPeriod(null)
      if (groupTrips && groupTrips.length > 0) setShowTripModal(true)
    } catch { toast.error(t('common.error')) }
  }

  const handleReopen = async () => {
    try {
      await dateProposalsApi.reopen(groupId, proposal.id)
      onProposalUpdate(proposal.id, { status: 'open', confirmed_start: null, confirmed_end: null })
    } catch { toast.error(t('common.error')) }
  }

  const handleUpdateTripDates = async (tripId: number) => {
    if (!proposal.confirmed_start || !proposal.confirmed_end) return
    try {
      await tripsApi.update(tripId, { start_date: proposal.confirmed_start, end_date: proposal.confirmed_end })
      toast.success(t('dateAvail.tripDatesUpdated') || 'Reisdatums bijgewerkt')
      setShowTripModal(false)
    } catch { toast.error(t('common.error')) }
  }

  const handleCreateGuestLink = async () => {
    try {
      const data = await dateProposalsApi.createGuestLink(groupId, proposal.id) as { guestToken: { id: number; token: string }; url: string }
      await navigator.clipboard.writeText(window.location.origin + data.url).catch(() => {})
      toast.success(t('dateAvail.guestLinkCopied') || 'Gastlink gekopieerd!')
      onProposalUpdate(proposal.id, {
        guestTokens: [...(proposal.guestTokens || []), { id: data.guestToken.id, token: data.guestToken.token, guest_name: null, created_at: new Date().toISOString(), expires_at: null }]
      })
    } catch { toast.error(t('common.error')) }
  }

  const handleDeleteGuestLink = async (tokenId: number) => {
    try {
      await dateProposalsApi.deleteGuestLink(groupId, proposal.id, tokenId)
      onProposalUpdate(proposal.id, {
        guestTokens: (proposal.guestTokens || []).filter(t => t.id !== tokenId)
      })
    } catch { toast.error(t('common.error')) }
  }

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  // Build list of months in range
  const startM = new Date(proposal.period_start + 'T00:00:00')
  const endM = new Date(proposal.period_end + 'T00:00:00')
  const months: Date[] = []
  const cur = new Date(startM.getFullYear(), startM.getMonth(), 1)
  while (cur <= new Date(endM.getFullYear(), endM.getMonth(), 1)) {
    months.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1)
  }
  const mIdx = months.findIndex(m => m.getFullYear() === viewMonth.getFullYear() && m.getMonth() === viewMonth.getMonth())

  const statusLegend = viewMode === 'mine'
    ? [
        { color: STATUS_COLOR.yes,   label: 'Kan' },
        { color: STATUS_COLOR.maybe, label: 'Misschien' },
        { color: STATUS_COLOR.no,    label: 'Kan niet' },
      ]
    : [
        { color: STATUS_COLOR.yes,   label: 'Ja' },
        { color: STATUS_COLOR.maybe, label: 'Misschien' },
        { color: STATUS_COLOR.no,    label: 'Nee' },
        { color: 'var(--border-secondary)', label: 'Geen reactie' },
      ]
  const overlayLegend = [
    { icon: <Plane size={10} />, color: '#3b82f6', label: 'Verlof' },
    { icon: <Briefcase size={10} />, color: '#ef4444', label: 'Bedrijfsfeestdag' },
    { icon: <Globe size={10} />, color: '#f59e0b', label: 'Feestdag' },
  ]

  const confirmedRange = isConfirmed && proposal.confirmed_start && proposal.confirmed_end
    ? { start: proposal.confirmed_start!, end: proposal.confirmed_end! }
    : null

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 14, border: `1px solid ${isConfirmed ? 'rgba(34,197,94,0.35)' : 'var(--border-faint)'}`, overflow: 'hidden' }}>
      {/* Confirmed banner */}
      {isConfirmed && confirmedRange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'rgba(34,197,94,0.1)', borderBottom: '1px solid rgba(34,197,94,0.25)' }}>
          <Check size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a', flex: 1 }}>
            {t('dateAvail.confirmedBanner') || 'Bevestigd'}: {new Date(confirmedRange.start + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })} – {new Date(confirmedRange.end + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
          </span>
          {canManage && (
            <button onClick={handleReopen} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6, border: '1px solid rgba(34,197,94,0.4)', background: 'transparent', color: '#16a34a', fontSize: 11, cursor: 'pointer' }}>
              <Unlock size={11} /> {t('dateAvail.reopen') || 'Heropenen'}
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-faint)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isConfirmed && <Lock size={12} style={{ color: '#16a34a', flexShrink: 0 }} />}
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{proposal.title}</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
            {new Date(proposal.period_start + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
            {' – '}
            {new Date(proposal.period_end + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          {saving && <div style={{ width: 14, height: 14, border: '2px solid var(--border-primary)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />}
          {canManage && !isConfirmed && (
            <>
              <button onClick={() => setShowAnalysis(v => !v)} title={t('dateAvail.overlapAnalysis') || 'Analyse'}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, border: 'none', background: showAnalysis ? 'var(--accent)' : 'transparent', cursor: 'pointer', color: showAnalysis ? 'var(--accent-text)' : 'var(--text-faint)' }}>
                <BarChart2 size={14} />
              </button>
              <button onClick={() => setShowGuestPanel(v => !v)} title={t('dateAvail.guestLink') || 'Gastlink'}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, border: 'none', background: showGuestPanel ? 'var(--accent)' : 'transparent', cursor: 'pointer', color: showGuestPanel ? 'var(--accent-text)' : 'var(--text-faint)' }}>
                <Link2 size={14} />
              </button>
            </>
          )}
          {isCreator && (
            <button onClick={() => onDelete(proposal.id)} title={t('common.delete')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#dc2626' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)' }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Member response overview */}
      <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border-faint)' }}>
        {proposal.members.map(m => {
          const responded = proposal.availability.some(a => a.user_id === m.id)
          return (
            <div key={m.id} title={m.username + (responded ? '' : ` — ${t('dateAvail.notYetFilled')}`)}
              style={{
                width: 26, height: 26, borderRadius: '50%',
                background: responded ? 'var(--accent)' : 'var(--bg-tertiary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
                color: responded ? 'var(--accent-text)' : 'var(--text-faint)',
                border: responded ? 'none' : '1px dashed var(--border-primary)',
                flexShrink: 0,
              }}>
              {m.username.slice(0, 1).toUpperCase()}
            </div>
          )
        })}
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 2 }}>
          {proposal.availability.filter(a => a.user_id === currentUserId).length > 0 ? t('dateAvail.responded') : t('dateAvail.notYetFilled')}
        </div>
      </div>

      {/* Month navigation + view toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 4px', gap: 8 }}>
        <button onClick={() => mIdx > 0 && setViewMonth(months[mIdx - 1])} disabled={mIdx === 0}
          style={{ padding: 4, borderRadius: 6, border: 'none', background: 'transparent', cursor: mIdx > 0 ? 'pointer' : 'default', color: 'var(--text-primary)', opacity: mIdx > 0 ? 1 : 0.25, flexShrink: 0 }}>
          <ChevronLeft size={16} />
        </button>
        <div className="flex flex-col items-center gap-2 flex-1">
          <div className="text-[13px] font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
            {viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </div>
          {isAdmin ? (
            <div className="flex rounded-lg overflow-hidden border text-[11px]" style={{ borderColor: 'var(--border-primary)' }}>
              {(['mine', 'group'] as const).map((mode, i) => (
                <button key={mode} onClick={() => setViewMode(mode)} className="px-3 py-1 cursor-pointer transition-colors"
                  style={{
                    fontFamily: 'inherit', fontSize: 11, border: 'none',
                    borderLeft: i > 0 ? '1px solid var(--border-primary)' : 'none',
                    background: viewMode === mode ? 'var(--accent)' : 'var(--bg-input)',
                    color: viewMode === mode ? 'var(--accent-text)' : 'var(--text-secondary)',
                    fontWeight: viewMode === mode ? 600 : 400,
                  }}>
                  {mode === 'mine' ? (t('dateAvail.myAvailability') || 'Mijn beschikbaarheid') : (t('dateAvail.group') || 'Groep')}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{t('dateAvail.myAvailability') || 'Mijn beschikbaarheid'}</span>
          )}
        </div>
        <button onClick={() => mIdx < months.length - 1 && setViewMonth(months[mIdx + 1])} disabled={mIdx >= months.length - 1}
          style={{ padding: 4, borderRadius: 6, border: 'none', background: 'transparent', cursor: mIdx < months.length - 1 ? 'pointer' : 'default', color: 'var(--text-primary)', opacity: mIdx < months.length - 1 ? 1 : 0.25, flexShrink: 0 }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Quick-select toolbar (only in mine mode, not confirmed) */}
      {!isConfirmed && viewMode === 'mine' && (
        <QuickSelectToolbar
          proposal={proposal}
          viewYear={viewMonth.getFullYear()}
          viewMonth={viewMonth.getMonth()}
          onBulkSet={handleBulkSet}
        />
      )}

      {/* Grid */}
      <div style={{ padding: '4px 16px 12px' }}>
        <MonthGrid
          year={viewMonth.getFullYear()}
          month={viewMonth.getMonth()}
          proposal={proposal}
          myStatus={myStatus}
          myNotes={myNotes}
          onToggle={toggleDate}
          onNoteOpen={handleNoteOpen}
          publicHolidays={publicHolidays}
          viewMode={viewMode}
          highlightRange={highlightRange || confirmedRange}
          readOnly={isConfirmed}
        />
      </div>

      {/* Legend */}
      <div className="px-4 pt-2.5 pb-3 border-t flex flex-col gap-1.5" style={{ borderColor: 'var(--border-faint)' }}>
        <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
          {statusLegend.map(item => (
            <div key={item.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <div className="rounded-sm flex-shrink-0" style={{ width: 10, height: 10, background: item.color, opacity: item.color.startsWith('var') ? 1 : 0.7 }} />
              {item.label}
            </div>
          ))}
          {viewMode === 'group' && (
            <div className="ml-auto text-[10px] flex items-center gap-2" style={{ color: 'var(--text-faint)' }}>
              <span style={{ color: STATUS_COLOR.yes, fontWeight: 700 }}>✓</span> jij
              <span style={{ color: STATUS_COLOR.maybe, fontWeight: 700 }}>◐</span> jij misschien
              <span style={{ color: STATUS_COLOR.no, fontWeight: 700 }}>✕</span> jij niet
            </div>
          )}
          {viewMode === 'mine' && !isConfirmed && (
            <div className="ml-auto text-[10px]" style={{ color: 'var(--text-faint)' }}>
              {t('dateAvail.rightClickNote') || 'Rechts-klik voor notitie'}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
          {overlayLegend.map(item => (
            <div key={item.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <span style={{ color: item.color }}>{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>
      </div>

      {/* Analysis panel */}
      {showAnalysis && canManage && !isConfirmed && (
        <AnalysisPanel
          groupId={groupId}
          proposal={proposal}
          onConfirm={handleConfirm}
          onHighlight={setHighlightRange}
        />
      )}

      {/* Manual confirm controls (when not using analysis panel) */}
      {!isConfirmed && canManage && confirmingPeriod && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-faint)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, flex: 1, color: 'var(--text-secondary)' }}>
            {t('dateAvail.confirmPeriod') || 'Bevestig periode'}: {confirmingPeriod.start} – {confirmingPeriod.end}
          </span>
          <button onClick={() => handleConfirm(confirmingPeriod.start, confirmingPeriod.end)}
            style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Check size={12} style={{ display: 'inline', marginRight: 4 }} />{t('dateAvail.confirm') || 'Bevestigen'}
          </button>
          <button onClick={() => setConfirmingPeriod(null)}
            style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border-primary)', background: 'transparent', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      {/* Guest link panel */}
      {showGuestPanel && canManage && !isConfirmed && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-faint)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Link2 size={13} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
              {t('dateAvail.guestLinks') || 'Gastlinks'}
            </span>
            <button onClick={handleCreateGuestLink}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={11} /> {t('dateAvail.createGuestLink') || 'Nieuw'}
            </button>
          </div>
          {(!proposal.guestTokens || proposal.guestTokens.length === 0) ? (
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('dateAvail.noGuestLinks') || 'Nog geen gastlinks aangemaakt.'}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {proposal.guestTokens.map(gt => (
                <div key={gt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {gt.guest_name || t('dateAvail.unnamedGuest') || 'Gast'} · /guest/availability/{gt.token.slice(0, 8)}…
                  </span>
                  <button onClick={() => { navigator.clipboard.writeText(window.location.origin + '/guest/availability/' + gt.token).catch(() => {}); toast.success(t('dateAvail.guestLinkCopied') || 'Gekopieerd!') }}
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', padding: 3, display: 'flex' }}>
                    <Copy size={12} />
                  </button>
                  <button onClick={() => handleDeleteGuestLink(gt.id)}
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', padding: 3, display: 'flex' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#dc2626' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)' }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trip dates modal */}
      {showTripModal && groupTrips && groupTrips.length > 0 && proposal.confirmed_start && proposal.confirmed_end && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowTripModal(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 20, maxWidth: 360, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              {t('dateAvail.updateTripDates') || 'Reisdatums bijwerken?'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {t('dateAvail.updateTripDatesDesc') || `Wil je de reisdatums bijwerken naar ${proposal.confirmed_start} – ${proposal.confirmed_end}?`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groupTrips.map(trip => (
                <button key={trip.id} onClick={() => handleUpdateTripDates(trip.id)}
                  style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                  {trip.title}
                </button>
              ))}
            </div>
            <button onClick={() => setShowTripModal(false)}
              style={{ marginTop: 12, width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
              {t('common.skip') || 'Overslaan'}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Note popover */}
      {notePopover && (
        <NotePopover
          date={notePopover.date}
          x={notePopover.x}
          y={notePopover.y}
          currentNote={myNotes[notePopover.date] || ''}
          onSave={note => handleNoteSave(notePopover.date, note)}
          onClose={() => setNotePopover(null)}
        />
      )}
    </div>
  )
}

// ── CreateForm ────────────────────────────────────────────────────────────────

interface CreateFormProps {
  groupId: number
  onCreated: (p: DateProposal) => void
  onCancel: () => void
}

function CreateProposalForm({ groupId, onCreated, onCancel }: CreateFormProps) {
  const { t } = useTranslation()
  const now = new Date()
  const [title, setTitle] = useState('')
  const [fromMonth, setFromMonth] = useState(monthKey(now.getFullYear(), now.getMonth()))
  const [toMonth, setToMonth] = useState(monthKey(now.getFullYear(), now.getMonth() + 1))
  const [deadline, setDeadline] = useState('')
  const [reminderDays, setReminderDays] = useState(2)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const fm = parseMonthKey(fromMonth)
    const tm = parseMonthKey(toMonth)
    const start = isoDate(new Date(fm.year, fm.month, 1))
    const end = isoDate(new Date(tm.year, tm.month + 1, 0))

    if (end < start) { setError(t('dateAvail.endBeforeStart')); return }

    setSaving(true); setError('')
    try {
      const data = await dateProposalsApi.create(groupId, {
        title: title.trim() || undefined,
        period_start: start,
        period_end: end,
        deadline: deadline || null,
        reminder_days: reminderDays,
      })
      onCreated(data.proposal as DateProposal)
    } catch { setError(t('common.error')) }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid var(--border-primary)', borderRadius: 10, fontSize: 13, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border-faint)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('dateAvail.newProposal')}</div>

      {/* Title */}
      <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('dateAvail.titlePlaceholder')} maxLength={100} style={inputStyle} />

      {/* Period */}
      <MonthSelector fromMonth={fromMonth} toMonth={toMonth} onChange={(f, tt) => { setFromMonth(f); setToMonth(tt) }} />

      {/* Deadline + reminder */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
        <div>
          <label style={labelStyle}>{t('dateAvail.deadline')}</label>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }} />
        </div>
        <div style={{ width: 80 }}>
          <label style={labelStyle}>{t('dateAvail.reminderDays')}</label>
          <input type="number" value={reminderDays} onChange={e => setReminderDays(Math.max(0, parseInt(e.target.value) || 0))}
            min={0} max={30}
            style={{ ...inputStyle, textAlign: 'center' }} />
        </div>
      </div>
      {deadline && (
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: -6 }}>
          {t('dateAvail.reminderHint', { days: reminderDays })}
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          {t('common.cancel')}
        </button>
        <button onClick={submit} disabled={saving}
          style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>
          {saving ? '…' : t('dateAvail.create')}
        </button>
      </div>
    </div>
  )
}

// ── SettingsPanel ─────────────────────────────────────────────────────────────

interface SettingsPanelProps {
  groupId: number
}

function SettingsPanel({ groupId }: SettingsPanelProps) {
  const { t, language } = useTranslation()
  const { user } = useAuthStore()
  const [region, setRegion] = useState('')
  const countries = useMemo(() => getAllCountries(getLocaleForLanguage(language)), [language])
  const [vacationDays, setVacationDays] = useState<VacationDay[]>([])
  const [companyHolidays, setCompanyHolidays] = useState<CompanyHoliday[]>([])
  const [showVacationForm, setShowVacationForm] = useState(false)
  const [vStart, setVStart] = useState('')
  const [vEnd, setVEnd] = useState('')
  const [vLabel, setVLabel] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [vd, ch, sData] = await Promise.all([
        availabilityApi.listVacationDays(),
        availabilityApi.listCompanyHolidays(),
        settingsApi.get().catch(() => ({ settings: {} })),
      ])
      setVacationDays((vd as any).vacationDays || [])
      setCompanyHolidays((ch as any).companyHolidays || [])
      const settings = (sData as any).settings || {}
      if (settings.holiday_region) setRegion(settings.holiday_region)
      else if (settings.home_country) setRegion(settings.home_country)
    } catch { /* noop */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleRegionChange = async (value: string) => {
    setRegion(value)
    try {
      await settingsApi.set('holiday_region', value)
    } catch { /* noop */ }
  }

  const handleAddVacation = async () => {
    if (!vStart || !vEnd) return
    try {
      const data = await availabilityApi.createVacationDay({ start_date: vStart, end_date: vEnd, label: vLabel || undefined })
      setVacationDays(prev => [...prev, (data as any).vacationDay])
      setVStart(''); setVEnd(''); setVLabel(''); setShowVacationForm(false)
    } catch { toast.error(t('common.error')) }
  }

  const handleDeleteVacation = async (id: number) => {
    try {
      await availabilityApi.deleteVacationDay(id)
      setVacationDays(prev => prev.filter(v => v.id !== id))
    } catch { toast.error(t('common.error')) }
  }

  if (loading) return <div style={{ padding: 16, textAlign: 'center' }}><div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--accent)', margin: '0 auto' }} /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 14, background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border-faint)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Globe size={14} />
        {t('dateAvail.settings') || 'Availability Settings'}
      </div>

      {/* Region */}
      <div>
        <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>{t('dateAvail.holidayRegion') || 'Holiday region'}</label>
        <select
          value={region}
          onChange={e => handleRegionChange(e.target.value)}
          style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border-primary)', borderRadius: 8, fontSize: 13, background: 'var(--bg-input)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
        >
          <option value="">{t('dateAvail.selectCountry') || 'Select country'}</option>
          {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>

      {/* Vacation days */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('dateAvail.yourVacationDays') || 'Your vacation days'}</label>
          <button onClick={() => setShowVacationForm(!showVacationForm)} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
            <Plus size={12} /> {t('common.add')}
          </button>
        </div>

        {showVacationForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: 'var(--bg-tertiary)', borderRadius: 8, marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <input type="date" value={vStart} onChange={e => setVStart(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-primary)', fontSize: 12, fontFamily: 'inherit' }} />
              <input type="date" value={vEnd} onChange={e => setVEnd(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-primary)', fontSize: 12, fontFamily: 'inherit' }} />
            </div>
            <input type="text" value={vLabel} onChange={e => setVLabel(e.target.value)} placeholder={t('dateAvail.vacationLabel') || 'Label (optional)'} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-primary)', fontSize: 12, fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowVacationForm(false)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', fontSize: 12, cursor: 'pointer' }}>{t('common.cancel')}</button>
              <button onClick={handleAddVacation} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 12, cursor: 'pointer' }}>{t('common.add')}</button>
            </div>
          </div>
        )}

        {vacationDays.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '4px 0' }}>{t('dateAvail.noVacationDays') || 'No vacation days set'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {vacationDays.map(v => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 6, background: 'var(--bg-tertiary)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: v.color }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>
                  {v.start_date} – {v.end_date} {v.label && `· ${v.label}`}
                </span>
                <button onClick={() => handleDeleteVacation(v.id)} style={{ border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', padding: 2 }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

interface DateAvailabilityV2Props {
  groupId: number
  canCreate?: boolean
  isAdmin?: boolean
}

export default function DateAvailabilityV2({ groupId, canCreate = true, isAdmin = false }: DateAvailabilityV2Props) {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [proposals, setProposals] = useState<DateProposal[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [loading, setLoading] = useState(true)
  const [publicHolidays, setPublicHolidays] = useState<Record<string, { name: string }>>({})
  const [groupTrips, setGroupTrips] = useState<Array<{ id: number; title: string }>>([])

  const load = useCallback(async () => {
    try {
      const [data, groupData] = await Promise.all([
        dateProposalsApi.list(groupId),
        groupsApi.get(groupId as number).catch(() => null),
      ])
      const parsedProposals = (data.proposals as DateProposal[]) || []
      setProposals(parsedProposals)

      if (groupData?.group?.trips) {
        setGroupTrips((groupData.group.trips as Array<{ id: number; title: string }>).map(t => ({ id: t.id, title: t.title })))
      }

      // Fetch public holidays for all member regions
      const regions = new Set<string>()
      parsedProposals.forEach(p => {
        Object.values(p.memberRegions || {}).forEach(r => regions.add(r))
      })
      const holidayMap: Record<string, { name: string }> = {}
      const currentYear = new Date().getFullYear()
      for (const region of regions) {
        try {
          const hData = await availabilityApi.getHolidays(currentYear, region)
          const holidays = (hData as any).holidays || []
          holidays.forEach((h: any) => {
            if (h.date) holidayMap[h.date] = { name: h.localName || h.name }
          })
        } catch { /* skip unavailable regions */ }
      }
      setPublicHolidays(holidayMap)
    } catch { /* noop */ }
    setLoading(false)
  }, [groupId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = (event: Record<string, unknown>) => {
      const ev = event as any
      if (ev.type === 'dateProposal:created' && ev.proposal) {
        setProposals(prev => prev.some(p => p.id === ev.proposal.id) ? prev : [ev.proposal as DateProposal, ...prev])
      } else if (ev.type === 'dateProposal:deleted' && ev.proposalId) {
        setProposals(prev => prev.filter(p => p.id !== ev.proposalId))
      } else if (ev.type === 'dateProposal:availabilityUpdated' && ev.proposalId && ev.availability) {
        setProposals(prev => prev.map(p => p.id === ev.proposalId ? { ...p, availability: ev.availability as DateAvailabilityEntry[] } : p))
      } else if (ev.type === 'dateProposal:confirmed' && ev.proposalId) {
        setProposals(prev => prev.map(p => p.id === ev.proposalId ? { ...p, status: 'confirmed', confirmed_start: ev.confirmed_start as string, confirmed_end: ev.confirmed_end as string } : p))
      } else if (ev.type === 'dateProposal:reopened' && ev.proposalId) {
        setProposals(prev => prev.map(p => p.id === ev.proposalId ? { ...p, status: 'open', confirmed_start: null, confirmed_end: null } : p))
      }
    }
    addListener(handler)
    return () => removeListener(handler)
  }, [])

  const handleDelete = async (id: number) => {
    try {
      await dateProposalsApi.delete(groupId, id)
      setProposals(prev => prev.filter(p => p.id !== id))
    } catch { /* noop */ }
  }

  const handleProposalUpdate = useCallback((proposalId: number, updates: Partial<DateProposal>) => {
    setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, ...updates } : p))
  }, [])

  if (!user) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
          <CalendarDays size={16} />
          {t('dateAvail.title')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowSettings(!showSettings)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            <Globe size={12} />
            {t('common.settings') || 'Settings'}
          </button>
          {canCreate && !showCreate && (
            <button onClick={() => setShowCreate(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={12} />{t('dateAvail.newProposal')}
            </button>
          )}
        </div>
      </div>

      {showSettings && <SettingsPanel groupId={groupId} />}

      {showCreate && (
        <CreateProposalForm
          groupId={groupId}
          onCreated={p => { setProposals(prev => [p, ...prev]); setShowCreate(false) }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <div style={{ width: 20, height: 20, border: '2px solid var(--border-primary)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : proposals.length === 0 && !showCreate ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-faint)', fontSize: 13 }}>
          {t('dateAvail.empty')}
        </div>
      ) : (
        proposals.map(p => (
          <ProposalCard
            key={p.id}
            proposal={p}
            groupId={groupId}
            currentUserId={user.id}
            isAdmin={isAdmin}
            groupTrips={groupTrips}
            onDelete={handleDelete}
            onAvailabilityChange={(id, availability) => setProposals(prev => prev.map(x => x.id === id ? { ...x, availability } : x))}
            onProposalUpdate={handleProposalUpdate}
            publicHolidays={publicHolidays}
          />
        ))
      )}
    </div>
  )
}
