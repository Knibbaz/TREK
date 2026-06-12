import React, { useMemo, useEffect, useRef } from 'react'
import { useTranslation } from '../../i18n'
import { getCategoryIcon } from '../shared/categoryIcons'
import type { Day, Category, Assignment } from '../../types'

interface TripOverviewPanelProps {
  days: Day[]
  assignments: Record<string, Assignment[]>
  categories: Category[]
  selectedPlaceId: number | null
  selectedDayId?: number | null
  onPlaceClick: (placeId: number | null, assignmentId?: number | null) => void
  onSelectDay?: (dayId: number | null) => void
}

export default function TripOverviewPanel({
  days,
  assignments,
  categories,
  selectedPlaceId,
  selectedDayId,
  onPlaceClick,
  onSelectDay,
}: TripOverviewPanelProps) {
  const { t } = useTranslation()
  const dayRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const sortedDays = useMemo(() => {
    return [...days].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }, [days])

  // Scroll selected day into view
  useEffect(() => {
    if (selectedDayId && dayRefs.current[selectedDayId]) {
      dayRefs.current[selectedDayId]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [selectedDayId])

  const formatDayDate = (dateStr?: string | null) => {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00Z')
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  }

  const getPlaceTime = (assignment: Assignment) => {
    const time = assignment.place?.place_time
    if (!time) return null
    return time.slice(0, 5)
  }

  return (
    <div
      className="absolute left-0 right-0 bottom-0 z-30 flex gap-3 px-4 pb-3 pt-2 overflow-x-auto"
      style={{
        background: 'var(--sidebar-bg)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderTop: '1px solid var(--border-secondary)',
        scrollbarWidth: 'none',
      }}
    >
      {sortedDays.map((day, dayIdx) => {
        const dayAssignments = assignments[String(day.id)] || []
        const placeAssignments = dayAssignments
          .filter(a => a.place)
          .sort((a, b) => a.order_index - b.order_index)
        const isSelectedDay = selectedDayId === day.id

        return (
          <div
            key={day.id}
            ref={el => { dayRefs.current[day.id] = el }}
            onClick={() => onSelectDay(isSelectedDay ? null : day.id)}
            className="flex-shrink-0 rounded-xl border flex flex-col"
            style={{
              width: 220,
              minHeight: 140,
              maxHeight: 220,
              background: isSelectedDay ? 'var(--bg-selected)' : 'var(--bg-card)',
              borderColor: isSelectedDay ? 'var(--accent)' : 'var(--border-primary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {/* Day header */}
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{ borderBottom: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{
                    background: isSelectedDay ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: isSelectedDay ? 'var(--accent-text)' : 'var(--text-muted)',
                  }}
                >
                  {dayIdx + 1}
                </div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {formatDayDate(day.date)}
                </span>
              </div>
              <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                {placeAssignments.length} {placeAssignments.length === 1 ? t('dashboard.place') : t('dashboard.places')}
              </span>
            </div>

            {/* Places list */}
            <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1" style={{ scrollbarWidth: 'none' }}>
              {placeAssignments.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{t('dayplan.emptyDay')}</span>
                </div>
              )}
              {placeAssignments.map(assignment => {
                const place = assignment.place!
                const cat = categories.find(c => c.id === place.category_id)
                const Icon = getCategoryIcon(cat?.icon)
                const time = getPlaceTime(assignment)
                const isSelected = selectedPlaceId === place.id

                return (
                  <button
                    key={assignment.id}
                    onClick={e => {
                      e.stopPropagation()
                      onPlaceClick(place.id, assignment.id)
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors"
                    style={{
                      background: isSelected ? 'var(--bg-selected)' : 'transparent',
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: cat?.color ? cat.color + '22' : 'var(--bg-secondary)', color: cat?.color || 'var(--text-muted)' }}
                    >
                      <Icon size={12} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {place.name}
                      </p>
                      {(time || place.duration_minutes) && (
                        <p className="text-[9px] flex items-center gap-1" style={{ color: 'var(--text-faint)' }}>
                          {time && <><ClockInline size={8} /> {time}</>}
                          {time && place.duration_minutes && <span>·</span>}
                          {place.duration_minutes && <span>{place.duration_minutes}m</span>}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ClockInline({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
