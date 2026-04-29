import React, { useEffect, useRef, useState } from 'react'
import { groupsApi, mapsApi } from '../../api/client'
import { useTranslation } from '../../i18n'
import { useAuthStore } from '../../store/authStore'
import { addListener, removeListener } from '../../api/websocket'
import {
  BarChart2, Check, ChevronDown, ChevronUp, Lock, MapPin,
  Plus, Trash2, Trophy, X,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PollOption {
  id: string
  poll_id: string
  label: string
  description: string | null
  lat: number | null
  lng: number | null
  image_url: string | null
  vote_count: number
  user_voted: 0 | 1
}

interface Poll {
  id: string
  trip_id: string
  created_by: number
  creator_name: string
  title: string
  description: string | null
  type: string
  status: 'open' | 'closed' | 'decided'
  decided_option_id: string | null
  deadline: string | null
  total_votes: number
  voter_count: number
  my_vote: string | null
  options: PollOption[]
}

interface LocationSuggestion {
  placeId: string
  mainText: string
  secondaryText: string
}

interface Props {
  tripId: number | string
  tripTitle?: string
  canCreate: boolean
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function GroupPolls({ tripId, tripTitle, canCreate }: Props): React.ReactElement {
  const { t, locale } = useTranslation()
  const { user } = useAuthStore()

  const [polls, setPolls] = useState<Poll[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Create poll form
  const [showCreate, setShowCreate] = useState(false)
  const [pollTitle, setPollTitle] = useState('')
  const [pollDesc, setPollDesc] = useState('')
  const [creating, setCreating] = useState(false)

  // Add option form
  const [addingOptionTo, setAddingOptionTo] = useState<string | null>(null)
  const [optionLabel, setOptionLabel] = useState('')
  const [optionDesc, setOptionDesc] = useState('')
  const [optionLat, setOptionLat] = useState<number | null>(null)
  const [optionLng, setOptionLng] = useState<number | null>(null)
  const [locSuggestions, setLocSuggestions] = useState<LocationSuggestion[]>([])
  const [locOpen, setLocOpen] = useState(false)
  const locDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const locRef = useRef<HTMLDivElement>(null)
  const [savingOption, setSavingOption] = useState(false)

  // Decide modal
  const [decidingPoll, setDecidingPoll] = useState<Poll | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await groupsApi.listPolls(tripId)
      setPolls(data.polls || [])
      if ((data.polls || []).length > 0 && !expanded) {
        setExpanded((data.polls[0] as Poll).id)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [tripId])

  // Real-time updates
  useEffect(() => {
    const handler = (event: Record<string, unknown>) => {
      if (event.type === 'groups:poll:updated' && String(event.tripId) === String(tripId)) {
        load()
      }
    }
    addListener(handler)
    return () => removeListener(handler)
  }, [tripId])

  // Location autocomplete debounce
  useEffect(() => {
    if (locDebounceRef.current) clearTimeout(locDebounceRef.current)
    const trimmed = optionLabel.trim()
    if (trimmed.length < 3) { setLocSuggestions([]); return }
    locDebounceRef.current = setTimeout(async () => {
      try {
        const data = await mapsApi.autocomplete(trimmed, locale, undefined, undefined, ['locality', 'country', 'administrative_area_level_1'])
        setLocSuggestions(data.suggestions || [])
        if ((data.suggestions || []).length > 0) setLocOpen(true)
      } catch {
        setLocSuggestions([])
      }
    }, 350)
    return () => { if (locDebounceRef.current) clearTimeout(locDebounceRef.current) }
  }, [optionLabel, locale])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (locRef.current && !locRef.current.contains(e.target as Node)) setLocOpen(false)
    }
    if (locOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [locOpen])

  const pickLocation = (s: LocationSuggestion) => {
    setOptionLabel(s.mainText)
    setOptionLat(null)
    setOptionLng(null)
    setLocSuggestions([])
    setLocOpen(false)
    // Try to get details for coordinates
    mapsApi.details(s.placeId, locale).then(d => {
      if (d?.place?.lat) setOptionLat(d.place.lat)
      if (d?.place?.lng) setOptionLng(d.place.lng)
    }).catch(() => {})
  }

  const handleCreatePoll = async () => {
    if (!pollTitle.trim()) return
    setCreating(true)
    try {
      await groupsApi.createPoll(tripId, { title: pollTitle.trim(), description: pollDesc.trim() || undefined })
      toast.success(t('groups.polls.created') || 'Poll created')
      setPollTitle('')
      setPollDesc('')
      setShowCreate(false)
      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleAddOption = async (pollId: string) => {
    if (!optionLabel.trim()) return
    setSavingOption(true)
    try {
      await groupsApi.addPollOption(tripId, pollId, {
        label: optionLabel.trim(),
        description: optionDesc.trim() || undefined,
        lat: optionLat ?? undefined,
        lng: optionLng ?? undefined,
      })
      setOptionLabel('')
      setOptionDesc('')
      setOptionLat(null)
      setOptionLng(null)
      setAddingOptionTo(null)
      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message)
    } finally {
      setSavingOption(false)
    }
  }

  const handleVote = async (poll: Poll, optionId: string) => {
    if (poll.status !== 'open') return
    try {
      await groupsApi.vote(tripId, poll.id, optionId)
      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message)
    }
  }

  const handleDeleteOption = async (poll: Poll, optionId: string) => {
    try {
      await groupsApi.deletePollOption(tripId, poll.id, optionId)
      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message)
    }
  }

  const handleClosePoll = async (poll: Poll) => {
    try {
      await groupsApi.closePoll(tripId, poll.id, 'closed')
      toast.success(t('groups.polls.closed') || 'Poll closed')
      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message)
    }
  }

  const handleDecide = async (poll: Poll, optionId: string) => {
    try {
      await groupsApi.closePoll(tripId, poll.id, 'decided', optionId)
      toast.success(t('groups.polls.decided') || 'Decision made!')
      setDecidingPoll(null)
      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message)
    }
  }

  const totalVotes = (poll: Poll) => poll.options.reduce((s, o) => s + o.vote_count, 0)
  const maxVotes = (poll: Poll) => Math.max(1, ...poll.options.map(o => o.vote_count))

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart2 size={15} style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('groups.polls.title') || 'Polls'} {tripTitle && <span className="font-normal text-xs" style={{ color: 'var(--text-faint)' }}>— {tripTitle}</span>}
          </span>
          {polls.filter(p => p.status === 'open').length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ background: 'var(--accent)' }}>
              {polls.filter(p => p.status === 'open').length}
            </span>
          )}
        </div>
        {canCreate && !polls.some(p => p.status === 'open') && (
          <button
            onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            <Plus size={12} />
            {t('groups.polls.create') || 'Nieuwe poll'}
          </button>
        )}
        {canCreate && polls.some(p => p.status === 'open') && (
          <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            {t('groups.polls.oneOpenMax') || '1 open poll per reis'}
          </span>
        )}
      </div>

      {/* Create Poll Form */}
      {showCreate && (
        <div className="mb-4 p-3 rounded-xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
            {t('groups.polls.newPoll') || 'Nieuwe stemming'}
          </p>
          <input
            type="text"
            value={pollTitle}
            onChange={e => setPollTitle(e.target.value)}
            placeholder={t('groups.polls.titlePlaceholder') || 'Bijv. "Welke bestemming kiezen we?"'}
            className="w-full px-3 py-2 rounded-lg border text-sm mb-2"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            autoFocus
          />
          <textarea
            value={pollDesc}
            onChange={e => setPollDesc(e.target.value)}
            placeholder={t('groups.polls.descPlaceholder') || 'Optionele omschrijving...'}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border text-sm resize-none mb-3"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowCreate(false); setPollTitle(''); setPollDesc('') }}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}
            >
              {t('common.cancel') || 'Annuleer'}
            </button>
            <button
              onClick={handleCreatePoll}
              disabled={!pollTitle.trim() || creating}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {creating ? '...' : t('common.create') || 'Aanmaken'}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && polls.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-muted)' }} />
        </div>
      )}

      {/* Empty state */}
      {!loading && polls.length === 0 && (
        <p className="text-xs text-center py-4" style={{ color: 'var(--text-faint)' }}>
          {t('groups.polls.empty') || 'Nog geen stemmingen. Maak een poll aan om een bestemming voor te stellen.'}
        </p>
      )}

      {/* Poll list */}
      <div className="space-y-3">
        {polls.map(poll => {
          const isOpen = poll.status === 'open'
          const isExpanded = expanded === poll.id
          const tv = totalVotes(poll)
          const mv = maxVotes(poll)
          const isCreator = user?.id === poll.created_by

          return (
            <div
              key={poll.id}
              className="rounded-xl border overflow-hidden"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
            >
              {/* Poll header */}
              <button
                onClick={() => setExpanded(isExpanded ? null : poll.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{poll.title}</span>
                      <span
                        className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          background: isOpen ? 'var(--bg-success-soft, #dcfce7)' : 'var(--bg-secondary)',
                          color: isOpen ? '#15803d' : 'var(--text-faint)',
                        }}
                      >
                        {isOpen ? (t('groups.polls.open') || 'Open') : poll.status === 'decided' ? (t('groups.polls.decided') || 'Besloten') : (t('groups.polls.closed') || 'Gesloten')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        {poll.options.length} {t('groups.polls.options') || 'opties'} · {tv} {t('groups.polls.votes') || 'stemmen'}
                      </span>
                      {poll.my_vote && isOpen && (
                        <span className="flex items-center gap-0.5 text-[11px]" style={{ color: '#15803d' }}>
                          <Check size={10} /> {t('groups.polls.voted') || 'Gestemd'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {isExpanded ? <ChevronUp size={15} style={{ color: 'var(--text-faint)', flexShrink: 0 }} /> : <ChevronDown size={15} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  {poll.description && (
                    <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{poll.description}</p>
                  )}

                  {/* Decided banner */}
                  {poll.status === 'decided' && poll.decided_option_id && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3" style={{ background: '#fef9c3', color: '#713f12' }}>
                      <Trophy size={14} />
                      <span className="text-xs font-semibold">
                        {t('groups.polls.winner') || 'Winnaar:'} {poll.options.find(o => o.id === poll.decided_option_id)?.label}
                      </span>
                    </div>
                  )}

                  {/* Options */}
                  <div className="space-y-2">
                    {poll.options.map(opt => {
                      const pct = tv > 0 ? Math.round((opt.vote_count / tv) * 100) : 0
                      const barWidth = mv > 0 ? (opt.vote_count / mv) * 100 : 0
                      const isMyVote = poll.my_vote === opt.id
                      const isWinner = poll.decided_option_id === opt.id

                      return (
                        <div key={opt.id} className="relative">
                          <button
                            onClick={() => handleVote(poll, opt.id)}
                            disabled={!isOpen}
                            className="w-full text-left rounded-lg border overflow-hidden transition-all"
                            style={{
                              borderColor: isMyVote ? 'var(--accent)' : isWinner ? '#ca8a04' : 'var(--border-primary)',
                              background: isWinner ? '#fefce8' : 'var(--bg-secondary)',
                            }}
                          >
                            {/* Vote bar background */}
                            <div
                              className="absolute inset-y-0 left-0 transition-all duration-500"
                              style={{
                                width: `${barWidth}%`,
                                background: isMyVote ? 'var(--accent-soft, rgba(99,102,241,0.12))' : 'var(--bg-tertiary)',
                                borderRadius: 8,
                              }}
                            />
                            <div className="relative flex items-center gap-2 px-3 py-2.5">
                              {/* Check or map pin */}
                              <div
                                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center border"
                                style={{
                                  background: isMyVote ? 'var(--accent)' : 'transparent',
                                  borderColor: isMyVote ? 'var(--accent)' : 'var(--border-primary)',
                                }}
                              >
                                {isMyVote ? <Check size={11} color="white" /> : opt.lat ? <MapPin size={10} style={{ color: 'var(--text-faint)' }} /> : null}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                                  {isWinner && <Trophy size={12} color="#ca8a04" />}
                                </div>
                                {opt.description && (
                                  <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{opt.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                                  {opt.vote_count} <span className="text-[10px] font-normal">({pct}%)</span>
                                </span>
                                {isCreator && isOpen && (
                                  <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); handleDeleteOption(poll, opt.id) }}
                                    className="p-1 rounded opacity-50 hover:opacity-100 transition-opacity"
                                    style={{ color: 'var(--text-danger)' }}
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {/* Add option form */}
                  {isOpen && (addingOptionTo === poll.id ? (
                    <div className="mt-3" ref={locRef}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={optionLabel}
                            onChange={e => { setOptionLabel(e.target.value); setOptionLat(null); setOptionLng(null) }}
                            onFocus={() => { if (locSuggestions.length > 0) setLocOpen(true) }}
                            placeholder={t('groups.polls.optionPlaceholder') || 'Bestemming (bijv. Parijs)'}
                            className="w-full px-3 py-2 rounded-lg border text-sm"
                            style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                            autoFocus
                          />
                          {optionLat && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2">
                              <MapPin size={12} style={{ color: 'var(--accent)' }} />
                            </div>
                          )}
                          {/* Autocomplete dropdown */}
                          {locOpen && locSuggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-lg z-50 overflow-hidden"
                              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
                              {locSuggestions.map(s => (
                                <button
                                  key={s.placeId}
                                  type="button"
                                  onClick={() => pickLocation(s)}
                                  className="flex items-start gap-2 w-full px-3 py-2 text-left transition-colors hover:opacity-80"
                                  style={{ background: 'transparent', color: 'var(--text-primary)' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                                >
                                  <MapPin size={12} style={{ color: 'var(--text-faint)', marginTop: 2, flexShrink: 0 }} />
                                  <span>
                                    <div className="text-xs font-medium">{s.mainText}</div>
                                    {s.secondaryText && <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{s.secondaryText}</div>}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <input
                        type="text"
                        value={optionDesc}
                        onChange={e => setOptionDesc(e.target.value)}
                        placeholder={t('groups.polls.optionDescPlaceholder') || 'Optionele toelichting...'}
                        className="w-full px-3 py-2 rounded-lg border text-sm mb-2"
                        style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => { setAddingOptionTo(null); setOptionLabel(''); setOptionDesc(''); setOptionLat(null); setOptionLng(null) }}
                          className="px-3 py-1.5 rounded-lg text-xs"
                          style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                        >
                          {t('common.cancel') || 'Annuleer'}
                        </button>
                        <button
                          onClick={() => handleAddOption(poll.id)}
                          disabled={!optionLabel.trim() || savingOption}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                          style={{ background: 'var(--accent)' }}
                        >
                          {savingOption ? '...' : t('groups.polls.addOption') || 'Voeg toe'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingOptionTo(poll.id); setOptionLabel(''); setOptionDesc('') }}
                      className="mt-3 flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
                      style={{ color: 'var(--accent)' }}
                    >
                      <Plus size={12} />
                      {t('groups.polls.addOption') || 'Optie toevoegen'}
                    </button>
                  ))}

                  {/* Poll actions (creator / admin) */}
                  {isOpen && isCreator && (
                    <div className="flex gap-2 mt-4 pt-3 border-t" style={{ borderColor: 'var(--border-faint)' }}>
                      <button
                        onClick={() => setDecidingPoll(poll)}
                        disabled={poll.options.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                        style={{ background: '#ca8a04' }}
                      >
                        <Trophy size={12} />
                        {t('groups.polls.decide') || 'Beslissing nemen'}
                      </button>
                      <button
                        onClick={() => handleClosePoll(poll)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                      >
                        <Lock size={12} />
                        {t('groups.polls.close') || 'Sluiten'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Decide Modal */}
      {decidingPoll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-5" style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Trophy size={16} color="#ca8a04" />
                <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {t('groups.polls.decideTitle') || 'Kies de winnaar'}
                </span>
              </div>
              <button onClick={() => setDecidingPoll(null)} style={{ color: 'var(--text-faint)' }}>
                <X size={16} />
              </button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              {t('groups.polls.decideHint') || 'Selecteer de winnende optie. De poll wordt gesloten.'}
            </p>
            <div className="space-y-2">
              {decidingPoll.options.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleDecide(decidingPoll, opt.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all hover:shadow-sm"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#fef9c3' }}>
                    <Trophy size={14} color="#ca8a04" />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                      {opt.vote_count} {t('groups.polls.votes') || 'stemmen'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
