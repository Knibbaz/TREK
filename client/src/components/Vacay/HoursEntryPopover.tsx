import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../i18n'
import { Clock, TrendingUp } from 'lucide-react'

interface HoursEntryPopoverProps {
  date: string
  initialType: 'vacation' | 'comp'
  standardHours: number
  existingVacationHours: number | null
  existingCompHours: number | null
  position: { x: number; y: number }
  onSave: (hours: number | null, type: 'vacation' | 'comp') => void
  onClose: () => void
}

export default function HoursEntryPopover({
  date,
  initialType,
  standardHours,
  existingVacationHours,
  existingCompHours,
  position,
  onSave,
  onClose,
}: HoursEntryPopoverProps) {
  const { t } = useTranslation()
  const [type, setType] = useState<'vacation' | 'comp'>(initialType)
  const [hours, setHours] = useState<string>(() => {
    const existing = initialType === 'comp' ? existingCompHours : existingVacationHours
    return existing != null ? String(existing) : String(standardHours)
  })
  const ref = useRef<HTMLDivElement>(null)

  // Update hours input when type changes
  useEffect(() => {
    const existing = type === 'comp' ? existingCompHours : existingVacationHours
    setHours(existing != null ? String(existing) : String(standardHours))
  }, [type, existingVacationHours, existingCompHours, standardHours])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const parsedHours = parseFloat(hours)
  const isValid = !isNaN(parsedHours) && parsedHours > 0 && parsedHours <= 24

  const handleSave = () => {
    if (!isValid) return
    onSave(parsedHours, type)
    onClose()
  }

  const handleRemove = () => {
    onSave(null, type)
    onClose()
  }

  // Clamp popover position to viewport
  const POPOVER_W = 220
  const POPOVER_H = 200
  const left = Math.min(position.x, window.innerWidth - POPOVER_W - 8)
  const top = position.y + 8 + POPOVER_H > window.innerHeight
    ? position.y - POPOVER_H - 4
    : position.y + 8

  const hasExisting = type === 'comp' ? existingCompHours != null : existingVacationHours != null

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-xl border shadow-xl p-3 space-y-2.5"
      style={{
        left,
        top,
        width: POPOVER_W,
        background: 'var(--bg-card)',
        borderColor: 'var(--border-primary)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}
    >
      {/* Type toggle */}
      <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
        <button
          onClick={() => setType('vacation')}
          className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-medium transition-all"
          style={{
            background: type === 'vacation' ? 'var(--bg-card)' : 'transparent',
            color: type === 'vacation' ? 'var(--text-primary)' : 'var(--text-faint)',
            boxShadow: type === 'vacation' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <Clock size={11} />
          {t('vacay.modeVacation')}
        </button>
        <button
          onClick={() => setType('comp')}
          className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-medium transition-all"
          style={{
            background: type === 'comp' ? 'var(--bg-card)' : 'transparent',
            color: type === 'comp' ? '#22c55e' : 'var(--text-faint)',
            boxShadow: type === 'comp' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <TrendingUp size={11} />
          {t('vacay.modeComp')}
        </button>
      </div>

      {/* Hours input */}
      <div>
        <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--text-faint)' }}>
          {t('vacay.hours')} ({date})
        </label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={hours}
            onChange={e => setHours(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            step={0.5}
            min={0.5}
            max={24}
            autoFocus
            className="flex-1 rounded-lg px-2 py-1.5 text-sm font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          />
          <span className="text-xs font-medium" style={{ color: 'var(--text-faint)' }}>u</span>
        </div>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-faint)' }}>
          {t('vacay.stdDay')}: {standardHours}u
        </p>
      </div>

      {/* Buttons */}
      <div className="flex gap-1.5">
        <button
          onClick={handleSave}
          disabled={!isValid}
          className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
          style={{ background: type === 'comp' ? '#22c55e' : 'var(--text-primary)', color: type === 'comp' ? '#fff' : 'var(--bg-card)' }}
        >
          {t('vacay.save')}
        </button>
        {hasExisting && (
          <button
            onClick={handleRemove}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
          >
            ✕
          </button>
        )}
        <button
          onClick={onClose}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
        >
          {t('vacay.cancel')}
        </button>
      </div>
    </div>
  )
}
