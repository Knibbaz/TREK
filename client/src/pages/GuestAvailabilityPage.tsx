import React, { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { CalendarDays, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import type { GuestAvailabilityInfo } from '../types'

// ── helpers ───────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfWeek(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7
}

const STATUS_COLOR = { yes: '#22c55e', maybe: '#f97316', no: '#ef4444' } as const
const STATUS_CYCLE: Array<'yes' | 'no' | 'maybe'> = ['yes', 'no', 'maybe']
const DAY_LABELS = ['M', 'D', 'W', 'D', 'V', 'Z', 'Z']

// ── GuestAvailabilityPage ─────────────────────────────────────────────────────

export default function GuestAvailabilityPage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<GuestAvailabilityInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [guestName, setGuestName] = useState('')
  const [responses, setResponses] = useState<Record<string, 'yes' | 'no' | 'maybe'>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [viewMonth, setViewMonth] = useState<{ year: number; month: number } | null>(null)

  useEffect(() => {
    if (!token) return
    apiClient.get(`/guest/availability/${token}`)
      .then(r => {
        const d = r.data as GuestAvailabilityInfo
        setInfo(d)
        setGuestName(d.guestName || '')
        setResponses(d.responses || {})
        const start = new Date(d.proposal.period_start + 'T00:00:00')
        setViewMonth({ year: start.getFullYear(), month: start.getMonth() })
      })
      .catch(e => setError(e.response?.data?.error || 'Ongeldige of verlopen link'))
      .finally(() => setLoading(false))
  }, [token])

  const handleToggle = (date: string) => {
    setResponses(prev => {
      const current = prev[date]
      const idx = current ? STATUS_CYCLE.indexOf(current) : -1
      return { ...prev, [date]: STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] }
    })
  }

  const handleSave = async () => {
    if (!guestName.trim()) {
      toast.error('Vul je naam in')
      return
    }
    setSaving(true)
    try {
      await apiClient.put(`/guest/availability/${token}`, { guest_name: guestName, responses })
      setSaved(true)
      toast.success('Beschikbaarheid opgeslagen!')
    } catch {
      toast.error('Er ging iets mis. Probeer opnieuw.')
    }
    setSaving(false)
  }

  // Build months list
  const months: Array<{ year: number; month: number }> = []
  if (info) {
    const start = new Date(info.proposal.period_start + 'T00:00:00')
    const end = new Date(info.proposal.period_end + 'T00:00:00')
    const cur = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cur <= new Date(end.getFullYear(), end.getMonth(), 1)) {
      months.push({ year: cur.getFullYear(), month: cur.getMonth() })
      cur.setMonth(cur.getMonth() + 1)
    }
  }

  const mIdx = viewMonth ? months.findIndex(m => m.year === viewMonth.year && m.month === viewMonth.month) : 0

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
      <div style={{ width: 24, height: 24, border: '2px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg-primary)' }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Link niet geldig</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{error}</div>
      </div>
    </div>
  )

  if (saved) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg-primary)' }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Check size={28} color="#fff" />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Opgeslagen!</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Je beschikbaarheid is verstuurd naar de groep.</div>
        <button onClick={() => setSaved(false)}
          style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>
          Aanpassen
        </button>
      </div>
    </div>
  )

  if (!info || !viewMonth) return null

  const pad = (n: number) => String(n).padStart(2, '0')
  const { year, month } = viewMonth
  const startDow = firstDayOfWeek(year, month)
  const count = daysInMonth(year, month)
  const cells: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= count; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  const todayStr = isoDate(new Date())

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px 16px', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <CalendarDays size={20} color="var(--accent-text)" />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{info.proposal.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {info.proposal.group_name} · {new Date(info.proposal.period_start + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })} – {new Date(info.proposal.period_end + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
          </div>
        </div>
      </div>

      {/* Name input */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Jouw naam *</label>
        <input
          type="text"
          value={guestName}
          onChange={e => setGuestName(e.target.value.slice(0, 50))}
          placeholder="Bijv. Jan"
          style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border-primary)', borderRadius: 10, fontSize: 14, background: 'var(--bg-input)', color: 'var(--text-primary)', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
      </div>

      {/* Instructions */}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
        Klik op een dag om je beschikbaarheid aan te geven:<br />
        <span style={{ color: STATUS_COLOR.yes }}>■</span> Kan · <span style={{ color: STATUS_COLOR.maybe }}>■</span> Misschien · <span style={{ color: STATUS_COLOR.no }}>■</span> Kan niet
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={() => mIdx > 0 && setViewMonth(months[mIdx - 1])} disabled={mIdx === 0}
          style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', cursor: mIdx > 0 ? 'pointer' : 'default', opacity: mIdx > 0 ? 1 : 0.3, color: 'var(--text-primary)' }}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => mIdx < months.length - 1 && setViewMonth(months[mIdx + 1])} disabled={mIdx >= months.length - 1}
          style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', cursor: mIdx < months.length - 1 ? 'pointer' : 'default', opacity: mIdx < months.length - 1 ? 1 : 0.3, color: 'var(--text-primary)' }}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Calendar grid */}
      <div style={{ borderRadius: 12, border: '1px solid var(--border-primary)', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border-secondary)' }}>
          {DAY_LABELS.map((l, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '6px 0', fontSize: 11, fontWeight: 600, color: i >= 5 ? 'var(--text-faint)' : 'var(--text-muted)' }}>{l}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {week.map((day, di) => {
              if (day === null) return (
                <div key={di} style={{ height: 44, borderTop: '1px solid var(--border-secondary)', borderRight: di < 6 ? '1px solid var(--border-secondary)' : undefined, background: di >= 5 ? 'var(--bg-secondary)' : 'transparent' }} />
              )
              const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`
              const inRange = dateStr >= info.proposal.period_start && dateStr <= info.proposal.period_end
              const status = responses[dateStr]
              const isToday = dateStr === todayStr
              const isWeekend = di >= 5

              return (
                <div key={di}
                  onClick={() => inRange && handleToggle(dateStr)}
                  style={{
                    height: 44, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderTop: '1px solid var(--border-secondary)',
                    borderRight: di < 6 ? '1px solid var(--border-secondary)' : undefined,
                    background: status ? `${STATUS_COLOR[status]}22` : isWeekend ? 'var(--bg-secondary)' : 'transparent',
                    cursor: inRange ? 'pointer' : 'default',
                    opacity: inRange ? 1 : 0.3,
                    userSelect: 'none',
                  }}>
                  {status && inRange && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: STATUS_COLOR[status] }} />
                  )}
                  <span style={{
                    fontSize: 13, fontWeight: status ? 700 : 400,
                    color: isToday ? '#fff' : isWeekend ? 'var(--text-faint)' : 'var(--text-primary)',
                    ...(isToday ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)' } : {}),
                  }}>
                    {day}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Save button */}
      <button onClick={handleSave} disabled={saving}
        style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Opslaan…' : 'Beschikbaarheid opslaan'}
      </button>
    </div>
  )
}
