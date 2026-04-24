import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, CalendarDays, ChevronLeft, ChevronRight, ArrowRight, Type } from 'lucide-react'
import { dateProposalsApi } from '../../api/client'
import { addListener, removeListener } from '../../api/websocket'
import { useAuthStore } from '../../store/authStore'
import { useTranslation } from '../../i18n'
import type { DateProposal, DateAvailabilityEntry } from '../../types'

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

// ── heatmap colour calculation ────────────────────────────────────────────────

type HeatStatus = 'none' | 'green' | 'orange' | 'red'

function dayStatus(date: string, availability: DateAvailabilityEntry[], memberCount: number): HeatStatus {
  const responses = availability.filter(a => a.date === date)
  if (responses.length === 0 || memberCount === 0) return 'none'
  const yes = responses.filter(a => a.status === 'yes').length
  const maybe = responses.filter(a => a.status === 'maybe').length
  const available = yes + maybe
  if (yes === memberCount) return 'green'      // Everyone 'yes'
  if (available > 0) return 'orange'           // Mix
  return 'red'                                  // Everyone 'no'
}

const STATUS_COLOR: Record<HeatStatus, string> = {
  none: 'var(--bg-hover)',
  green: '#16a34a',
  orange: '#ea580c',
  red: '#dc2626',
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipProps {
  date: string
  x: number
  y: number
  entries: DateAvailabilityEntry[]
  members: DateProposal['members']
}

function Tooltip({ date, x, y, entries, members }: TooltipProps) {
  const { t } = useTranslation()
  return createPortal(
    <div style={{
      position: 'fixed',
      left: Math.min(x, window.innerWidth - 210),
      top: y,
      transform: 'translateX(-50%) translateY(-100%) translateY(-8px)',
      zIndex: 99999,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-primary)',
      borderRadius: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      padding: '8px 12px',
      minWidth: 160,
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6 }}>
        {new Date(date + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
      </div>
      {members.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('dateAvail.noMembers')}</div>
        : members.map(m => {
          const entry = entries.find(e => e.user_id === m.id)
          const icon = entry ? (entry.status === 'yes' ? '✓' : entry.status === 'maybe' ? '~' : '✗') : '·'
          const color = entry ? (entry.status === 'yes' ? '#16a34a' : entry.status === 'maybe' ? '#ea580c' : '#dc2626') : 'var(--text-faint)'
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color, width: 12, textAlign: 'center' }}>{icon}</span>
              <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{m.username}</span>
            </div>
          )
        })
      }
    </div>,
    document.body
  )
}

// ── MonthHeatmap ──────────────────────────────────────────────────────────────

interface MonthHeatmapProps {
  year: number
  month: number
  proposal: DateProposal
  myStatus: Record<string, 'yes' | 'no' | 'maybe'>
  onToggle: (date: string) => void
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function MonthHeatmap({ year, month, proposal, myStatus, onToggle }: MonthHeatmapProps) {
  const [tooltip, setTooltip] = useState<TooltipProps | null>(null)
  const count = daysInMonth(year, month)
  const first = firstDayOfWeek(year, month)
  const cells: (string | null)[] = [...Array(first).fill(null)]
  for (let d = 1; d <= count; d++) cells.push(isoDate(new Date(year, month, d)))

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
          const heat = dayStatus(date, proposal.availability, proposal.members.length)
          const mine = myStatus[date]
          const bg = heat === 'none' ? 'var(--bg-hover)' : mine ? STATUS_COLOR[heat] : `${STATUS_COLOR[heat]}55`
          const textColor = mine && heat !== 'none' ? '#fff' : 'var(--text-secondary)'
          const borderColor = mine ? 'var(--accent)' : 'transparent'

          return (
            <div
              key={date}
              onClick={() => onToggle(date)}
              onMouseEnter={e => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setTooltip({ date, x: r.left + r.width / 2, y: r.top, entries: proposal.availability.filter(a => a.date === date), members: proposal.members })
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4, cursor: 'pointer', background: bg, color: textColor,
                fontSize: 11, fontWeight: mine ? 700 : 400,
                border: `2px solid ${borderColor}`,
                transition: 'background 0.1s',
                userSelect: 'none',
              }}
            >
              {dayNum}
            </div>
          )
        })}
      </div>
      {tooltip && <Tooltip {...tooltip} />}
    </div>
  )
}

// ── ProposalCard ──────────────────────────────────────────────────────────────

const STATUS_CYCLE: Array<'yes' | 'no' | 'maybe' | null> = ['yes', 'maybe', 'no', null]

interface ProposalCardProps {
  proposal: DateProposal
  groupId: number
  currentUserId: number
  onDelete: (id: number) => void
  onAvailabilityChange: (proposalId: number, availability: DateAvailabilityEntry[]) => void
}

function ProposalCard({ proposal, groupId, currentUserId, onDelete, onAvailabilityChange }: ProposalCardProps) {
  const { t } = useTranslation()
  const [viewMonth, setViewMonth] = useState<Date>(() => new Date(proposal.period_start + 'T00:00:00'))
  const [pending, setPending] = useState<Record<string, 'yes' | 'no' | 'maybe' | null>>({})
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // My current status from server data, overlaid with pending
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

  // Stats
  let green = 0, orange = 0, red = 0
  const allDays: string[] = []
  const d = new Date(proposal.period_start + 'T00:00:00Z')
  const last = new Date(proposal.period_end + 'T00:00:00Z')
  while (d <= last) { allDays.push(isoDate(d)); d.setUTCDate(d.getUTCDate() + 1) }
  for (const day of allDays) {
    const s = dayStatus(day, proposal.availability, proposal.members.length)
    if (s === 'green') green++
    else if (s === 'orange') orange++
    else if (s === 'red') red++
  }

  const respondedCount = proposal.members.filter(m => proposal.availability.some(a => a.user_id === m.id)).length

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
          {respondedCount}/{proposal.members.length} {t('dateAvail.responded')}
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

      {/* Heatmap */}
      <div style={{ padding: '4px 16px 12px' }}>
        <MonthHeatmap
          year={viewMonth.getFullYear()}
          month={viewMonth.getMonth()}
          proposal={proposal}
          myStatus={myStatus}
          onToggle={toggleDate}
        />
      </div>

      {/* Legend */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--border-faint)', paddingTop: 10 }}>
        {(['green', 'orange', 'red'] as const).map((key, i) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: STATUS_COLOR[key] }} />
            {[green, orange, red][i]}
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
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!start || !end) { setError(t('dateAvail.formRequired')); return }
    if (end < start) { setError(t('dateAvail.endBeforeStart')); return }
    setSaving(true); setError('')
    try {
      const data = await dateProposalsApi.create(groupId, { title: title.trim() || undefined, period_start: start, period_end: end })
      onCreated(data.proposal as DateProposal)
    } catch { setError(t('common.error')) }
    finally { setSaving(false) }
  }

  const datePreview = start && end
    ? `${new Date(start + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(end + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border-faint)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('dateAvail.newProposal')}</div>

      {/* Title — optional */}
      <div style={{ position: 'relative' }}>
        <Type size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('dateAvail.titlePlaceholder')} maxLength={100}
          style={{ width: '100%', padding: '8px 11px 8px 32px', border: '1px solid var(--border-primary)', borderRadius: 10, fontSize: 13, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
      </div>

      {/* Date range row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <CalendarDays size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
          <input type="date" value={start} onChange={e => setStart(e.target.value)}
            style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border-primary)', borderRadius: 10, fontSize: 13, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }} />
        </div>
        <ArrowRight size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
        <div style={{ flex: 1, position: 'relative' }}>
          <CalendarDays size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
          <input type="date" value={end} onChange={e => setEnd(e.target.value)}
            style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border-primary)', borderRadius: 10, fontSize: 13, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }} />
        </div>
      </div>

      {/* Preview badge */}
      {datePreview && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', fontSize: 12, color: 'var(--text-secondary)', width: 'fit-content' }}>
          <CalendarDays size={12} />
          {datePreview}
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          {t('common.cancel')}
        </button>
        <button onClick={submit} disabled={saving || !start || !end}
          style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving || !start || !end ? 0.5 : 1, fontFamily: 'inherit' }}>
          {saving ? '…' : t('dateAvail.create')}
        </button>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

interface DateAvailabilityProps {
  groupId: number
  canCreate?: boolean
}

export default function DateAvailability({ groupId, canCreate = true }: DateAvailabilityProps) {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [proposals, setProposals] = useState<DateProposal[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await dateProposalsApi.list(groupId)
      setProposals(data.proposals as DateProposal[])
    } catch { /* noop */ }
    setLoading(false)
  }, [groupId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = (event: { type: string; proposalId?: number; proposal?: DateProposal; availability?: DateAvailabilityEntry[] }) => {
      if (event.type === 'dateProposal:created' && event.proposal) {
        setProposals(prev => prev.some(p => p.id === event.proposal!.id) ? prev : [event.proposal!, ...prev])
      } else if (event.type === 'dateProposal:deleted' && event.proposalId) {
        setProposals(prev => prev.filter(p => p.id !== event.proposalId))
      } else if (event.type === 'dateProposal:availabilityUpdated' && event.proposalId && event.availability) {
        setProposals(prev => prev.map(p => p.id === event.proposalId ? { ...p, availability: event.availability! } : p))
      }
    }
    addListener(handler as Parameters<typeof addListener>[0])
    return () => removeListener(handler as Parameters<typeof removeListener>[0])
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
        {canCreate && !showCreate && (
          <button onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={12} />{t('dateAvail.newProposal')}
          </button>
        )}
      </div>

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
          />
        ))
      )}
    </div>
  )
}
