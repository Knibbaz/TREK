import { useMemo, useState, useCallback, useEffect } from 'react'
import { useVacayStore } from '../../store/vacayStore'
import { useTranslation } from '../../i18n'
import { isWeekend } from './holidays'
import { tripsApi } from '../../api/client'
import VacayMonthCard from './VacayMonthCard'
import HoursEntryPopover from './HoursEntryPopover'
import { Building2, Clock, MousePointer2, TrendingUp } from 'lucide-react'

type CalendarMode = 'vacation' | 'company' | 'comp'

interface PopoverState {
  date: string
  x: number
  y: number
  existingVacationHours: number | null
  existingCompHours: number | null
  existingTvtHours: number | null
}

export default function VacayCalendar() {
  const { t } = useTranslation()
  const { selectedYear, selectedUserId, entries, companyHolidays, toggleEntry, setEntry, toggleCompanyHoliday, plan, users, holidays } = useVacayStore()
  const [mode, setMode] = useState<CalendarMode>('vacation')
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [tripDates, setTripDates] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await tripsApi.list()
        const dates = new Set<string>()
        for (const trip of data.trips || []) {
          if (!trip.start_date || !trip.end_date) continue
          const start = new Date(trip.start_date + 'T00:00:00')
          const end = new Date(trip.end_date + 'T00:00:00')
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const y = d.getFullYear()
            if (y === selectedYear) {
              dates.add(`${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
            }
          }
        }
        if (!cancelled) setTripDates(dates)
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [selectedYear])

  const companyHolidaySet = useMemo(() => {
    const s = new Set<string>()
    companyHolidays.forEach(h => s.add(typeof h === 'string' ? h : (h as any).date))
    return s
  }, [companyHolidays])

  const entryMap = useMemo(() => {
    const map: Record<string, typeof entries> = {}
    entries.forEach(e => {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    })
    return map
  }, [entries])

  const blockWeekends = plan?.block_weekends !== false
  const weekendDays: number[] = plan?.weekend_days ? String(plan.weekend_days).split(',').map(Number) : [0, 6]
  const companyHolidaysEnabled = plan?.company_holidays_enabled !== false
  const standardHours = plan?.standard_hours_per_day ?? 8

  const handleCellClick = useCallback(async (dateStr: string) => {
    if (mode === 'company') {
      if (!companyHolidaysEnabled) return
      await toggleCompanyHoliday(dateStr)
      return
    }
    if (blockWeekends && isWeekend(dateStr, weekendDays)) return
    if (companyHolidaysEnabled && companyHolidaySet.has(dateStr)) return
    if (mode === 'comp') {
      const dayEntries = entryMap[dateStr] || []
      const existingComp = dayEntries.find(e => e.type === 'comp')
      await setEntry(dateStr, existingComp ? null : standardHours, 'comp', selectedUserId || undefined)
      return
    }
    await toggleEntry(dateStr, selectedUserId || undefined)
  }, [mode, toggleEntry, setEntry, toggleCompanyHoliday, holidays, companyHolidaySet, blockWeekends, companyHolidaysEnabled, selectedUserId, entryMap, standardHours])

  const handleCellRightClick = useCallback((dateStr: string, x: number, y: number) => {
    if (mode === 'company') return
    if (holidays[dateStr]) return
    if (blockWeekends && isWeekend(dateStr, weekendDays)) return
    if (companyHolidaysEnabled && companyHolidaySet.has(dateStr)) return

    const dayEntries = entryMap[dateStr] || []
    const vacEntry = dayEntries.find(e => !e.type || e.type === 'vacation')
    const compEntry = dayEntries.find(e => e.type === 'comp')
    const tvtEntry = dayEntries.find(e => e.type === 'tvt')

    setPopover({
      date: dateStr,
      x,
      y,
      existingVacationHours: vacEntry?.hours ?? null,
      existingCompHours: compEntry?.hours ?? null,
      existingTvtHours: tvtEntry?.hours ?? null,
    })
  }, [mode, holidays, blockWeekends, weekendDays, companyHolidaysEnabled, companyHolidaySet, entryMap])

  const handlePopoverSave = useCallback(async (hours: number | null, type: 'vacation' | 'comp' | 'tvt') => {
    if (!popover) return
    await setEntry(popover.date, hours, type, selectedUserId || undefined)
  }, [popover, setEntry, selectedUserId])

  const selectedUser = users.find(u => u.id === selectedUserId)

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-14">
        {Array.from({ length: 12 }, (_, i) => (
          <VacayMonthCard
            key={i}
            year={selectedYear}
            month={i}
            holidays={holidays}
            companyHolidaySet={companyHolidaySet}
            companyHolidaysEnabled={companyHolidaysEnabled}
            entryMap={entryMap}
            onCellClick={handleCellClick}
            onCellRightClick={handleCellRightClick}
            companyMode={mode === 'company'}
            blockWeekends={blockWeekends}
            weekendDays={weekendDays}
            tripDates={tripDates}
            weekStart={plan?.week_start ?? 1}
            standardHours={standardHours}
          />
        ))}
      </div>

      {/* Floating toolbar */}
      <div className="sticky bottom-3 sm:bottom-4 mt-3 sm:mt-4 flex items-center justify-center z-30 px-2">
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
          <button
            onClick={() => setMode('vacation')}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-all"
            style={{
              background: mode === 'vacation' ? 'var(--text-primary)' : 'transparent',
              color: mode === 'vacation' ? 'var(--bg-card)' : 'var(--text-muted)',
              border: mode !== 'vacation' ? '1px solid var(--border-primary)' : '1px solid transparent',
            }}>
            <MousePointer2 size={13} />
            {selectedUser && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedUser.color }} />}
            {selectedUser ? selectedUser.username : t('vacay.modeVacation')}
          </button>
          <button
            onClick={() => setMode('comp')}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-all"
            style={{
              background: mode === 'comp' ? '#22c55e' : 'transparent',
              color: mode === 'comp' ? '#fff' : 'var(--text-muted)',
              border: mode !== 'comp' ? '1px solid var(--border-primary)' : '1px solid transparent',
            }}>
            <TrendingUp size={13} />
            {t('vacay.modeComp')}
          </button>
          {companyHolidaysEnabled && (
            <button
              onClick={() => setMode('company')}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-all"
              style={{
                background: mode === 'company' ? '#d97706' : 'transparent',
                color: mode === 'company' ? '#fff' : 'var(--text-muted)',
                border: mode !== 'company' ? '1px solid var(--border-primary)' : '1px solid transparent',
              }}>
              <Building2 size={13} />
              {t('vacay.modeCompany')}
            </button>
          )}
          <div className="w-px h-4 mx-0.5" style={{ background: 'var(--border-primary)' }} />
          <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-faint)' }}>
            <Clock size={10} />
            {t('vacay.rightClickHint')}
          </div>
        </div>
      </div>

      {popover && (
        <HoursEntryPopover
          date={popover.date}
          initialType={mode === 'comp' ? 'comp' : 'vacation'}
          standardHours={standardHours}
          existingVacationHours={popover.existingVacationHours}
          existingCompHours={popover.existingCompHours}
          existingTvtHours={popover.existingTvtHours}
          position={{ x: popover.x, y: popover.y }}
          onSave={handlePopoverSave}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  )
}
