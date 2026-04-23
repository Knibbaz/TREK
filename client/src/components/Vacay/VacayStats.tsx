import { useEffect, useState } from 'react'
import { Briefcase, Pencil, TrendingUp } from 'lucide-react'
import { useVacayStore } from '../../store/vacayStore'
import { useAuthStore } from '../../store/authStore'
import { useTranslation } from '../../i18n'
import type { VacayStat } from '../../types'

function fmtHours(h: number): string {
  const rounded = Math.round(h * 10) / 10
  return `${rounded}u`
}

function fmtDays(d: number, stdHours: number): string {
  // Show as integer if it's a round number, otherwise show one decimal
  if (Number.isInteger(d)) return String(d)
  // Check if it's a common fraction like 0.5
  const rounded = Math.round(d * 10) / 10
  const hours = Math.round(d * stdHours * 10) / 10
  return `${rounded}`
}

export default function VacayStats() {
  const { t } = useTranslation()
  const { stats, selectedYear, loadStats, updateVacationDays, isFused } = useVacayStore()
  const { user: currentUser } = useAuthStore()

  useEffect(() => { loadStats(selectedYear) }, [selectedYear])

  return (
    <div className="rounded-xl border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center gap-1.5 mb-3">
        <Briefcase size={13} style={{ color: 'var(--text-faint)' }} />
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
          {t('vacay.entitlement')} {selectedYear}
        </span>
      </div>

      {stats.length === 0 ? (
        <p className="text-[11px] text-center py-3" style={{ color: 'var(--text-faint)' }}>{t('vacay.noData')}</p>
      ) : (
        <div className="space-y-2">
          {stats.map(s => (
            <StatCard
              key={s.user_id}
              stat={s}
              isMe={s.user_id === currentUser?.id}
              canEdit={s.user_id === currentUser?.id || isFused}
              selectedYear={selectedYear}
              onSave={updateVacationDays}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface StatCardProps {
  stat: VacayStat
  isMe: boolean
  canEdit: boolean
  selectedYear: number
  onSave: (year: number, days: number, targetUserId?: number) => Promise<void>
  t: (key: string, params?: Record<string, unknown>) => string
}

function StatCard({ stat: s, isMe, canEdit, selectedYear, onSave, t }: StatCardProps) {
  const [editing, setEditing] = useState(false)
  const [localDays, setLocalDays] = useState<string | number>(s.vacation_days)
  const [hoveredStat, setHoveredStat] = useState<'used' | 'remaining' | 'header' | 'comp' | null>(null)
  const stdHours = s.standard_hours_per_day ?? 8
  const pct = s.total_available > 0 ? Math.min(100, (s.used / s.total_available) * 100) : 0
  const hasPartial = !Number.isInteger(s.used) || s.comp_hours > 0

  // Calculate remaining after comp-time usage
  const remainingAfterComp = Math.max(0, s.remaining_hours - s.comp_hours)
  const remainingCompHours = Math.max(0, s.comp_hours - s.remaining_hours)

  // Sync local state when stats reload from server
  useEffect(() => {
    if (!editing) setLocalDays(s.vacation_days)
  }, [s.vacation_days, editing])

  const handleSave = () => {
    setEditing(false)
    const days = parseInt(String(localDays))
    if (!isNaN(days) && days >= 0 && days <= 365 && days !== s.vacation_days) {
      onSave(selectedYear, days, s.user_id)
    }
  }

  return (
    <div className="rounded-lg p-2.5 space-y-2" style={{ border: '1px solid var(--border-secondary)' }}>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.person_color }} />
        <span className="text-xs font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
          {s.person_name}
          {isMe && <span style={{ color: 'var(--text-faint)' }}> ({t('vacay.you')})</span>}
        </span>
        <span
          className="text-[10px] tabular-nums"
          style={{ color: 'var(--text-faint)' }}
          onMouseEnter={() => setHoveredStat('header')}
          onMouseLeave={() => setHoveredStat(null)}
        >
          {hoveredStat === 'header' && hasPartial ? `${fmtHours(s.used_hours)}/${fmtHours(s.total_available * stdHours)}` : (hasPartial ? fmtDays(s.used, stdHours) : s.used) + '/' + (hasPartial ? fmtDays(s.total_available, stdHours) : s.total_available)}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        <div
          className="trek-bar-fill h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
          style={{ width: `${pct}%`, backgroundColor: s.person_color }}
        />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {/* Days — editable */}
        <div
          className="rounded-md px-2 py-2 group/days"
          style={{
            background: canEdit ? 'var(--bg-card)' : 'var(--bg-secondary)',
            border: canEdit ? '1px solid var(--border-primary)' : '1px solid transparent',
            cursor: canEdit ? 'pointer' : 'default',
          }}
          onClick={() => { if (canEdit && !editing) setEditing(true) }}
        >
          <div className="text-[10px] mb-1" style={{ color: 'var(--text-faint)', height: 14, lineHeight: '14px' }}>
            {t('vacay.entitlementDays')} {canEdit && !editing && <Pencil size={9} className="inline opacity-0 group-hover/days:opacity-100 transition-opacity" style={{ color: 'var(--text-faint)', verticalAlign: 'middle' }} />}
          </div>
          {editing ? (
            <input
              type="number"
              value={localDays}
              onChange={e => setLocalDays(e.target.value)}
              onBlur={handleSave}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setEditing(false); setLocalDays(s.vacation_days) } }}
              autoFocus
              className="w-full bg-transparent text-sm font-bold outline-none p-0 m-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              style={{ color: 'var(--text-primary)', height: 18, lineHeight: '18px' }}
            />
          ) : (
            <div className="text-sm font-bold" title={`${s.vacation_days * stdHours}u`} style={{ color: 'var(--text-primary)', height: 18, lineHeight: '18px' }}>{s.vacation_days}</div>
          )}
        </div>
        {/* Used */}
        <div
          className="rounded-md px-2 py-2"
          style={{ background: 'var(--bg-secondary)' }}
          onMouseEnter={() => setHoveredStat('used')}
          onMouseLeave={() => setHoveredStat(null)}
        >
          <div className="text-[10px] mb-1" style={{ color: 'var(--text-faint)', height: 14, lineHeight: '14px' }}>{t('vacay.used')}</div>
          <div className="text-sm font-bold" style={{ color: 'var(--text-primary)', height: 18, lineHeight: '18px' }}>
            {hasPartial && hoveredStat === 'used' ? fmtHours(s.used_hours) : (hasPartial ? fmtDays(s.used, stdHours) : s.used)}
          </div>
        </div>
        {/* Remaining */}
        <div
          className="rounded-md px-2 py-2"
          style={{ background: 'var(--bg-secondary)' }}
          onMouseEnter={() => setHoveredStat('remaining')}
          onMouseLeave={() => setHoveredStat(null)}
        >
          <div className="text-[10px] mb-1" style={{ color: 'var(--text-faint)', height: 14, lineHeight: '14px' }}>{t('vacay.remaining')}</div>
          <div className="text-sm font-bold" style={{ color: s.remaining < 0 ? '#ef4444' : s.remaining <= 3 ? '#f59e0b' : '#22c55e', height: 18, lineHeight: '18px' }}>
            {hoveredStat === 'remaining' && hasPartial ? (
              fmtHours(s.comp_hours + remainingAfterComp)
            ) : (hasPartial ? fmtDays(s.remaining, stdHours) : s.remaining)}
          </div>
        </div>
      </div>

      {/* Carry-over badge */}
      {s.carried_over > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <span className="text-[10px]" style={{ color: '#d97706' }}>+{s.carried_over_hours > 0 && !Number.isInteger(s.carried_over_hours / stdHours) ? fmtHours(s.carried_over_hours) : s.carried_over} {t('vacay.carriedOver', { year: selectedYear - 1 })}</span>
        </div>
      )}

      {/* Comp-time section */}
      {s.comp_hours > 0 && (
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md"
          style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}
          onMouseEnter={() => setHoveredStat('comp')}
          onMouseLeave={() => setHoveredStat(null)}
        >
          <TrendingUp size={10} style={{ color: '#22c55e', flexShrink: 0 }} />
          <span className="text-[10px] font-medium" style={{ color: '#16a34a' }}>
            {/* {hoveredStat === 'comp' ? 
            `${t('vacay.compTime')}: +${fmtHours(s.comp_hours)} (${remainingCompHours > 0 ? `${fmtHours(remainingCompHours)} ${t('vacay.remaining')}` : `${t('vacay.used')}`})`
             : `${t('vacay.compTime')}: +${fmtHours(s.comp_hours)}`
             } */}
             {`${t('vacay.compTime')}: +${fmtHours(s.comp_hours)}`}
          </span>
        </div>
      )}
    </div>
  )
}
