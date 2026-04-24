import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import {
  Plus, Trash2, CalendarDays, ChevronLeft, ChevronRight,
  Globe, Briefcase, Plane, Users, X, ChevronDown
} from 'lucide-react'
import { dateProposalsApi, availabilityApi, settingsApi } from '../../api/client'
import { addListener, removeListener } from '../../api/websocket'
import { useAuthStore } from '../../store/authStore'
import { useTranslation } from '../../i18n'
import type { DateProposal, DateAvailabilityEntry, VacationDay, CompanyHoliday } from '../../types'

// ── helpers ───────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
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

type OverlayType = 'vacation' | 'company' | 'public' | 'availability'

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
            <div key={e.user_id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <span style={{
                fontWeight: 700,
                color: e.status === 'yes' ? '#16a34a' : e.status === 'maybe' ? '#ea580c' : '#dc2626',
              }}>{e.status === 'yes' ? '✓' : e.status === 'maybe' ? '~' : '✗'}</span>
              <span style={{ color: 'var(--text-primary)' }}>{e.username}</span>
            </div>
          ))}
        </div>
      )}
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

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const STATUS_CYCLE: Array<'yes' | 'no' | 'maybe' | null> = ['yes', 'maybe', 'no', null]

interface MonthGridProps {
  year: number
  month: number
  proposal: DateProposal
  myStatus: Record<string, 'yes' | 'no' | 'maybe'>
  onToggle: (date: string) => void
  publicHolidays: Record<string, { name: string }>
}

function MonthGrid({ year, month, proposal, myStatus, onToggle, publicHolidays }: MonthGridProps) {
  const { t } = useTranslation()
  const [tooltip, setTooltip] = useState<{ date: string; x: number; y: number; overlays: DayOverlay[] } | null>(null)
  const count = daysInMonth(year, month)
  const first = firstDayOfWeek(year, month)
  const cells: (string | null)[] = [...Array(first).fill(null)]
  for (let d = 1; d <= count; d++) cells.push(isoDate(new Date(year, month, d)))

  const getOverlays = (date: string): DayOverlay[] => {
    const overlays: DayOverlay[] = []
    // Public holiday
    if (publicHolidays[date]) {
      overlays.push({ type: 'public', color: '#f59e0b', label: publicHolidays[date].name })
    }
    // Company holiday
    const ch = proposal.companyHolidays?.find(h => h.date === date)
    if (ch) {
      overlays.push({ type: 'company', color: ch.color, label: ch.name })
    }
    // Vacation days
    proposal.vacationDays?.forEach(v => {
      if (date >= v.start_date && date <= v.end_date) {
        const member = proposal.members.find(m => m.id === v.user_id)
        overlays.push({ type: 'vacation', color: v.color, label: `${member?.username || ''} — ${v.label || t('dateAvail.vacation') || 'Vacation'}`, userId: v.user_id })
      }
    })
    return overlays
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
        {DAY_LABELS.map((l, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-faint)', fontWeight: 600 }}>{l}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((date, idx) => {
          if (!date) return <div key={idx} />
          const inRange = date >= proposal.period_start && date <= proposal.period_end
          const dayNum = new Date(date + 'T00:00:00').getDate()
          if (!inRange) {
            return <div key={date} style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-faint)', opacity: 0.3 }}>{dayNum}</div>
          }

          const overlays = getOverlays(date)
          const mine = myStatus[date]
          const entries = proposal.availability.filter(a => a.date === date)
          const yesCount = entries.filter(e => e.status === 'yes').length
          const maybeCount = entries.filter(e => e.status === 'maybe').length
          const total = proposal.members.length

          // Base color from group consensus
          let bg = 'var(--bg-hover)'
          let textColor = 'var(--text-secondary)'
          if (yesCount === total && total > 0) { bg = '#16a34a'; textColor = '#fff' }
          else if (yesCount + maybeCount > 0) { bg = '#ea580c'; textColor = '#fff' }
          else if (entries.length > 0) { bg = '#dc2626'; textColor = '#fff' }

          // If there are overlays, tint the background
          const hasOverlays = overlays.length > 0
          const borderColor = mine ? 'var(--accent)' : hasOverlays ? overlays[0].color : 'transparent'

          return (
            <div
              key={date}
              onClick={() => onToggle(date)}
              onMouseEnter={e => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setTooltip({ date, x: r.left + r.width / 2, y: r.top, overlays })
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, cursor: 'pointer', background: bg, color: textColor,
                fontSize: 11, fontWeight: mine ? 700 : 400,
                border: `2px solid ${borderColor}`,
                transition: 'background 0.1s',
                userSelect: 'none',
                position: 'relative',
              }}
            >
              {dayNum}
              {hasOverlays && !mine && (
                <div style={{
                  position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', gap: 2,
                }}>
                  {overlays.slice(0, 3).map((o, i) => (
                    <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: o.color }} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
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

// ── ProposalCard ──────────────────────────────────────────────────────────────

interface ProposalCardProps {
  proposal: DateProposal
  groupId: number
  currentUserId: number
  onDelete: (id: number) => void
  onAvailabilityChange: (proposalId: number, availability: DateAvailabilityEntry[]) => void
  publicHolidays: Record<string, { name: string }>
}

function ProposalCard({ proposal, groupId, currentUserId, onDelete, onAvailabilityChange, publicHolidays }: ProposalCardProps) {
  const { t } = useTranslation()
  const [viewMonth, setViewMonth] = useState<Date>(() => new Date(proposal.period_start + 'T00:00:00'))
  const [pending, setPending] = useState<Record<string, 'yes' | 'no' | 'maybe' | null>>({})
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const myStatus: Record<string, 'yes' | 'no' | 'maybe'> = {}
  for (const e of proposal.availability) {
    if (e.user_id === currentUserId) myStatus[e.date] = e.status
  }
  for (const [d, s] of Object.entries(pending)) {
    if (s === null) delete myStatus[d]
    else myStatus[d] = s
  }

  const toggleDate = (date: string) => {
    const current = myStatus[date] ?? null
    const idx = STATUS_CYCLE.indexOf(current)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    setPending(prev => ({ ...prev, [date]: next }))

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const snap = { ...pending, [date]: next }
      setSaving(true)
      try {
        const data = await dateProposalsApi.setAvailability(groupId, proposal.id, snap)
        onAvailabilityChange(proposal.id, data.availability)
        setPending({})
      } catch { /* noop */ }
      setSaving(false)
    }, 600)
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

  // Legend
  const legendItems = [
    { icon: <Users size={10} />, color: '#16a34a', label: t('dateAvail.allYes') || 'All yes' },
    { icon: <Users size={10} />, color: '#ea580c', label: t('dateAvail.someYes') || 'Some yes' },
    { icon: <Plane size={10} />, color: '#3b82f6', label: t('dateAvail.vacation') || 'Vacation' },
    { icon: <Briefcase size={10} />, color: '#ef4444', label: t('dateAvail.companyHoliday') || 'Company holiday' },
    { icon: <Globe size={10} />, color: '#f59e0b', label: t('dateAvail.publicHoliday') || 'Public holiday' },
  ]

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border-faint)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-faint)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{proposal.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            {new Date(proposal.period_start + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
            {' – '}
            {new Date(proposal.period_end + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          {saving && <div style={{ width: 14, height: 14, border: '2px solid var(--border-primary)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />}
          {(proposal.created_by === currentUserId) && (
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

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 4px' }}>
        <button onClick={() => mIdx > 0 && setViewMonth(months[mIdx - 1])} disabled={mIdx === 0}
          style={{ padding: 4, borderRadius: 6, border: 'none', background: 'transparent', cursor: mIdx > 0 ? 'pointer' : 'default', color: 'var(--text-primary)', opacity: mIdx > 0 ? 1 : 0.25 }}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </div>
        <button onClick={() => mIdx < months.length - 1 && setViewMonth(months[mIdx + 1])} disabled={mIdx >= months.length - 1}
          style={{ padding: 4, borderRadius: 6, border: 'none', background: 'transparent', cursor: mIdx < months.length - 1 ? 'pointer' : 'default', color: 'var(--text-primary)', opacity: mIdx < months.length - 1 ? 1 : 0.25 }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Grid */}
      <div style={{ padding: '4px 16px 12px' }}>
        <MonthGrid
          year={viewMonth.getFullYear()}
          month={viewMonth.getMonth()}
          proposal={proposal}
          myStatus={myStatus}
          onToggle={toggleDate}
          publicHolidays={publicHolidays}
        />
      </div>

      {/* Legend */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--border-faint)', paddingTop: 10 }}>
        {legendItems.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
            <span style={{ color: item.color }}>{item.icon}</span>
            {item.label}
          </div>
        ))}
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>
          ✓ = {t('dateAvail.yes')} · ~ = {t('dateAvail.maybe')} · ✗ = {t('dateAvail.no')}
        </div>
      </div>
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
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [region, setRegion] = useState('')
  const [countries, setCountries] = useState<Array<{ countryCode: string; name: string }>>([])
  const [vacationDays, setVacationDays] = useState<VacationDay[]>([])
  const [companyHolidays, setCompanyHolidays] = useState<CompanyHoliday[]>([])
  const [showVacationForm, setShowVacationForm] = useState(false)
  const [vStart, setVStart] = useState('')
  const [vEnd, setVEnd] = useState('')
  const [vLabel, setVLabel] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [vd, ch, cData, sData] = await Promise.all([
        availabilityApi.listVacationDays(),
        availabilityApi.listCompanyHolidays(),
        availabilityApi.listHolidayCountries().catch(() => ({ countries: [] })),
        settingsApi.get().catch(() => ({ settings: {} })),
      ])
      setVacationDays((vd as any).vacationDays || [])
      setCompanyHolidays((ch as any).companyHolidays || [])
      setCountries((cData as any).countries || [])
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
          {countries.map(c => <option key={c.countryCode} value={c.countryCode}>{c.name}</option>)}
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
}

export default function DateAvailabilityV2({ groupId, canCreate = true }: DateAvailabilityV2Props) {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [proposals, setProposals] = useState<DateProposal[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [loading, setLoading] = useState(true)
  const [publicHolidays, setPublicHolidays] = useState<Record<string, { name: string }>>({})

  const load = useCallback(async () => {
    try {
      const data = await dateProposalsApi.list(groupId)
      const parsedProposals = (data.proposals as DateProposal[]) || []
      setProposals(parsedProposals)

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
            onDelete={handleDelete}
            onAvailabilityChange={(id, availability) => setProposals(prev => prev.map(x => x.id === id ? { ...x, availability } : x))}
            publicHolidays={publicHolidays}
          />
        ))
      )}
    </div>
  )
}
