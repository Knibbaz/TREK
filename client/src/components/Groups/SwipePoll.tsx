import React, { useEffect, useRef, useState } from 'react'
import { groupsApi } from '../../api/client'
import { useTranslation } from '../../i18n'
import { X, ThumbsDown, ThumbsUp, Star, Trophy } from 'lucide-react'
import toast from 'react-hot-toast'

interface PollOption {
  id: string
  label: string
  description: string | null
  lat: number | null
  lng: number | null
  image_url: string | null
  vote_count: number
  match_score?: number
  swipe_stats?: { like: number; superlike: number; dislike: number }
}

interface Poll {
  id: string
  trip_id: string
  title: string
  options: PollOption[]
  my_swipes: Record<string, string>
}

interface Props {
  poll: Poll
  tripId: number | string
  onClose: () => void
}

type SwipeValue = 'like' | 'dislike' | 'superlike'

export default function SwipePoll({ poll, tripId, onClose }: Props): React.ReactElement {
  const { t } = useTranslation()

  // Filter out already-swiped options, start fresh on those not yet voted
  const allOptions = poll.options
  const [currentIdx, setCurrentIdx] = useState(() => {
    // Start from first unvoted option
    const firstUnvoted = allOptions.findIndex(o => !poll.my_swipes[o.id])
    return firstUnvoted >= 0 ? firstUnvoted : 0
  })
  const [swipes, setSwipes] = useState<Record<string, SwipeValue>>({ ...poll.my_swipes as Record<string, SwipeValue> })
  const [done, setDone] = useState(false)
  const [matches, setMatches] = useState<PollOption[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Drag state
  const cardRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const [dragDelta, setDragDelta] = useState(0)
  const [dragHint, setDragHint] = useState<SwipeValue | null>(null)

  const currentOption = allOptions[currentIdx]
  const isLastCard = currentIdx >= allOptions.length - 1

  useEffect(() => {
    if (done) loadMatches()
  }, [done])

  const loadMatches = async () => {
    setLoadingMatches(true)
    try {
      const data = await groupsApi.getSwipeMatches(tripId, poll.id)
      setMatches(data.matches || [])
    } catch {
      // ignore
    } finally {
      setLoadingMatches(false)
    }
  }

  const submitSwipe = async (optionId: string, value: SwipeValue) => {
    if (submitting) return
    setSubmitting(true)
    try {
      await groupsApi.swipeVote(tripId, poll.id, optionId, value)
      setSwipes(prev => ({ ...prev, [optionId]: value }))
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Fout bij opslaan')
    } finally {
      setSubmitting(false)
    }
  }

  const advance = async (value: SwipeValue) => {
    if (!currentOption) return
    await submitSwipe(currentOption.id, value)
    setDragDelta(0)
    setDragHint(null)

    if (isLastCard) {
      setDone(true)
    } else {
      setCurrentIdx(i => i + 1)
    }
  }

  // Pointer events for drag
  const onPointerDown = (e: React.PointerEvent) => {
    if (!cardRef.current) return
    cardRef.current.setPointerCapture(e.pointerId)
    dragStart.current = { x: e.clientX, y: e.clientY }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    setDragDelta(dx)
    if (dx > 60) setDragHint('like')
    else if (dx < -60) setDragHint('dislike')
    else setDragHint(null)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    dragStart.current = null
    setDragDelta(0)
    setDragHint(null)

    if (dy < -80 && Math.abs(dx) < 60) {
      advance('superlike')
    } else if (dx > 80) {
      advance('like')
    } else if (dx < -80) {
      advance('dislike')
    }
  }

  const rotation = Math.min(Math.max(dragDelta * 0.08, -15), 15)
  const progress = allOptions.length > 0 ? ((currentIdx) / allOptions.length) * 100 : 100

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <div>
          <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{poll.title}</p>
          {!done && (
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
              {currentIdx + 1} / {allOptions.length}
            </p>
          )}
        </div>
        <button onClick={onClose} className="p-2 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
          <X size={18} />
        </button>
      </div>

      {/* Progress bar */}
      {!done && (
        <div className="px-4 mb-2 flex-shrink-0">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
          </div>
        </div>
      )}

      {/* Card area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 min-h-0">

        {/* Done: show matches */}
        {done ? (
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">🎉</div>
              <p className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                {t('groups.polls.swipeDone') || 'Klaar!'}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                {t('groups.polls.swipeResults') || 'Groepsresultaten'}
              </p>
            </div>

            {loadingMatches ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-muted)' }} />
              </div>
            ) : (
              <div className="space-y-2">
                {matches.slice(0, 5).map((opt, idx) => {
                  const s = opt.swipe_stats ?? { like: 0, superlike: 0, dislike: 0 }
                  return (
                    <div
                      key={opt.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl border"
                      style={{
                        background: idx === 0 ? '#fef9c3' : 'var(--bg-card)',
                        borderColor: idx === 0 ? '#ca8a04' : 'var(--border-primary)',
                      }}
                    >
                      <span className="text-lg font-bold w-6 text-center" style={{ color: idx === 0 ? '#ca8a04' : 'var(--text-faint)' }}>
                        {idx === 0 ? '🏆' : `#${idx + 1}`}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{opt.label}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          ⭐ {s.superlike} &nbsp; 👍 {s.like} &nbsp; 👎 {s.dislike}
                        </p>
                      </div>
                      {idx === 0 && <Trophy size={16} color="#ca8a04" />}
                    </div>
                  )
                })}
              </div>
            )}

            <button
              onClick={onClose}
              className="mt-6 w-full py-3 rounded-2xl font-medium text-white"
              style={{ background: 'var(--accent)' }}
            >
              {t('common.close') || 'Sluiten'}
            </button>
          </div>
        ) : currentOption ? (
          <>
            {/* Hint overlays */}
            <div className="relative w-full max-w-sm" style={{ height: 420 }}>
              {/* Next card peek */}
              {currentIdx + 1 < allOptions.length && (
                <div
                  className="absolute inset-x-4 rounded-3xl border"
                  style={{
                    top: 12,
                    bottom: -8,
                    background: 'var(--bg-secondary)',
                    borderColor: 'var(--border-primary)',
                    zIndex: 0,
                    transform: 'scale(0.95)',
                  }}
                />
              )}

              {/* Active card */}
              <div
                ref={cardRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="absolute inset-0 rounded-3xl border shadow-xl flex flex-col overflow-hidden select-none cursor-grab active:cursor-grabbing"
                style={{
                  background: 'var(--bg-card)',
                  borderColor: dragHint === 'like' ? '#22c55e' : dragHint === 'dislike' ? '#ef4444' : dragHint === 'superlike' ? '#f59e0b' : 'var(--border-primary)',
                  zIndex: 1,
                  transform: `translateX(${dragDelta}px) rotate(${rotation}deg)`,
                  transition: dragStart.current ? 'none' : 'transform 0.3s ease, border-color 0.15s',
                  touchAction: 'none',
                }}
              >
                {/* Image or placeholder */}
                <div
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{
                    height: 220,
                    background: currentOption.image_url ? `url(${currentOption.image_url}) center/cover` : 'linear-gradient(135deg, var(--accent-soft, #e0e7ff), var(--bg-secondary))',
                  }}
                >
                  {!currentOption.image_url && (
                    <span className="text-5xl opacity-30">🗺️</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 p-5 flex flex-col">
                  <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{currentOption.label}</h2>
                  {currentOption.description && (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{currentOption.description}</p>
                  )}
                  {currentOption.lat && (
                    <p className="text-xs mt-auto pt-2" style={{ color: 'var(--text-faint)' }}>
                      📍 {currentOption.lat.toFixed(2)}, {currentOption.lng?.toFixed(2)}
                    </p>
                  )}
                </div>

                {/* Drag hint badges */}
                {dragHint === 'like' && (
                  <div className="absolute top-6 right-6 px-3 py-1 rounded-full border-2 font-bold text-sm rotate-12" style={{ background: '#dcfce7', borderColor: '#22c55e', color: '#15803d' }}>
                    👍 LIKE
                  </div>
                )}
                {dragHint === 'dislike' && (
                  <div className="absolute top-6 left-6 px-3 py-1 rounded-full border-2 font-bold text-sm -rotate-12" style={{ background: '#fee2e2', borderColor: '#ef4444', color: '#b91c1c' }}>
                    👎 NOPE
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-6 mt-6">
              <button
                onClick={() => advance('dislike')}
                disabled={submitting}
                className="w-14 h-14 rounded-full border-2 flex items-center justify-center shadow-md disabled:opacity-50 transition-transform active:scale-95"
                style={{ background: 'white', borderColor: '#ef4444', color: '#ef4444' }}
              >
                <ThumbsDown size={22} />
              </button>

              <button
                onClick={() => advance('superlike')}
                disabled={submitting}
                className="w-12 h-12 rounded-full border-2 flex items-center justify-center shadow-md disabled:opacity-50 transition-transform active:scale-95"
                style={{ background: 'white', borderColor: '#f59e0b', color: '#f59e0b' }}
              >
                <Star size={18} />
              </button>

              <button
                onClick={() => advance('like')}
                disabled={submitting}
                className="w-14 h-14 rounded-full border-2 flex items-center justify-center shadow-md disabled:opacity-50 transition-transform active:scale-95"
                style={{ background: 'white', borderColor: '#22c55e', color: '#22c55e' }}
              >
                <ThumbsUp size={22} />
              </button>
            </div>

            <p className="text-[11px] mt-4 text-center" style={{ color: 'var(--text-faint)' }}>
              {t('groups.polls.swipeHint') || 'Sleep kaart of gebruik knoppen · omhoog = super-like'}
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
