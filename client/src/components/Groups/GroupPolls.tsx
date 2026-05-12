import React, { useEffect, useRef, useState } from 'react'
import { groupsApi, mapsApi, filesApi } from '../../api/client'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import { useTranslation } from '../../i18n'
import { useAuthStore } from '../../store/authStore'
import { addListener, removeListener } from '../../api/websocket'
import {
  BarChart2, Check, ChevronDown, ChevronUp, Copy, Link2,
  Lock, MapPin, Plus, Trash2, Trophy, X,
  ArrowUp, ArrowDown, Shuffle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import SwipePoll from './SwipePoll'

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
  borda_score?: number
  swipe_stats?: { like: number; superlike: number; dislike: number }
  match_score?: number
}

interface RankEntry { option_id: string; rank: number }

interface Poll {
  id: string
  trip_id: string
  created_by: number
  creator_name: string
  title: string
  description: string | null
  type: 'single_choice' | 'multi_choice' | 'ranked' | 'swipe'
  status: 'open' | 'closed' | 'decided'
  decided_option_id: string | null
  deadline: string | null
  anonymous: boolean
  allow_guest_votes: boolean
  total_votes: number
  voter_count: number
  my_vote: string | null
  my_votes: string[]
  my_ranks: RankEntry[]
  my_swipes: Record<string, string>
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

const POLL_TYPES = [
  { value: 'single_choice', labelKey: 'groups.polls.typeSingle' },
  { value: 'multi_choice', labelKey: 'groups.polls.typeMulti' },
  { value: 'ranked', labelKey: 'groups.polls.typeRanked' },
  { value: 'swipe', labelKey: 'groups.polls.typeSwipe' },
]

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
  const [pollType, setPollType] = useState<string>('single_choice')
  const [pollDeadline, setPollDeadline] = useState('')
  const [pollAnonymous, setPollAnonymous] = useState(false)
  const [pollAllowGuest, setPollAllowGuest] = useState(false)
  const [creating, setCreating] = useState(false)

  // Add option form
  const [addingOptionTo, setAddingOptionTo] = useState<string | null>(null)
  const [optionLabel, setOptionLabel] = useState('')
  const [optionDesc, setOptionDesc] = useState('')
  const [optionLat, setOptionLat] = useState<number | null>(null)
  const [optionLng, setOptionLng] = useState<number | null>(null)
  const [optionImageUrl, setOptionImageUrl] = useState<string | null>(null)
  const [optionImageUploading, setOptionImageUploading] = useState(false)
  const [locSuggestions, setLocSuggestions] = useState<LocationSuggestion[]>([])
  const [locOpen, setLocOpen] = useState(false)
  const locDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const locRef = useRef<HTMLDivElement>(null)
  const [savingOption, setSavingOption] = useState(false)

  // Ranked: local order state per poll
  const [rankedOrders, setRankedOrders] = useState<Record<string, string[]>>({})
  const [submittingRank, setSubmittingRank] = useState<string | null>(null)

  // Swipe: local order state per poll
  const [swipeOrders, setSwipeOrders] = useState<Record<string, string[]>>({})
  const [submittingSwipeOrder, setSubmittingSwipeOrder] = useState<string | null>(null)

  // Decide modal
  const [decidingPoll, setDecidingPoll] = useState<Poll | null>(null)

  // Swipe modal
  const [swipePoll, setSwipePoll] = useState<Poll | null>(null)

  // Guest link
  const [guestLinkPollId, setGuestLinkPollId] = useState<string | null>(null)
  const [guestLinkToken, setGuestLinkToken] = useState<string | null>(null)
  const [guestLinkLoading, setGuestLinkLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await groupsApi.listPolls(tripId)
      const fetched: Poll[] = (data.polls || []).map((p: any) => ({
        ...p,
        my_votes: p.my_votes || (p.my_vote ? [p.my_vote] : []),
        my_ranks: p.my_ranks || [],
        my_swipes: p.my_swipes || {},
      }))
      setPolls(fetched)
      if (fetched.length > 0 && !expanded) setExpanded(fetched[0].id)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tripId])

  // Init ranked order from server data
  useEffect(() => {
    setRankedOrders(prev => {
      const next = { ...prev }
      for (const poll of polls) {
        if (poll.type === 'ranked' && !next[poll.id]) {
          if (poll.my_ranks?.length > 0) {
            const sorted = [...poll.my_ranks].sort((a, b) => a.rank - b.rank)
            next[poll.id] = sorted.map(r => r.option_id)
          } else {
            next[poll.id] = poll.options.map(o => o.id)
          }
        }
      }
      return next
    })
  }, [polls])

  // Init/update swipe order from server data (by sort_order)
  useEffect(() => {
    setSwipeOrders(prev => {
      const next = { ...prev }
      for (const poll of polls) {
        if (poll.type === 'swipe') {
          const sorted = [...poll.options].sort((a, b) => (a as any).sort_order - (b as any).sort_order)
          const newOrder = sorted.map(o => o.id)
          // Always update to ensure new options are included
          next[poll.id] = newOrder
        }
      }
      return next
    })
  }, [polls])

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

  // Location autocomplete
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
    mapsApi.details(s.placeId, locale).then(d => {
      if (d?.place?.lat) setOptionLat(d.place.lat)
      if (d?.place?.lng) setOptionLng(d.place.lng)
    }).catch(() => {})
  }

  const handleCreatePoll = async () => {
    if (!pollTitle.trim()) return
    setCreating(true)
    try {
      await groupsApi.createPoll(tripId, {
        title: pollTitle.trim(),
        description: pollDesc.trim() || undefined,
        type: pollType,
        deadline: pollDeadline || undefined,
        anonymous: pollAnonymous,
        allow_guest_votes: pollAllowGuest,
      })
      toast.success(t('groups.polls.created') || 'Poll aangemaakt')
      setPollTitle(''); setPollDesc(''); setPollType('single_choice'); setPollDeadline('')
      setPollAnonymous(false); setPollAllowGuest(false)
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
        image_url: optionImageUrl ?? undefined,
      })
      setOptionLabel(''); setOptionDesc(''); setOptionLat(null); setOptionLng(null); setOptionImageUrl(null)
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

  const handleSubmitRanked = async (poll: Poll) => {
    const order = rankedOrders[poll.id]
    if (!order?.length) return
    setSubmittingRank(poll.id)
    try {
      const rankings = order.map((optId, idx) => ({ option_id: optId, rank: idx + 1 }))
      await groupsApi.submitRankedVote(tripId, poll.id, rankings)
      toast.success(t('groups.polls.rankSubmitted') || 'Volgorde opgeslagen')
      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message)
    } finally {
      setSubmittingRank(null)
    }
  }

  const moveRankItem = (pollId: string, idx: number, dir: -1 | 1) => {
    setRankedOrders(prev => {
      const order = [...(prev[pollId] || [])]
      const target = idx + dir
      if (target < 0 || target >= order.length) return prev
      ;[order[idx], order[target]] = [order[target], order[idx]]
      return { ...prev, [pollId]: order }
    })
  }

  const moveSwipeItem = (pollId: string, idx: number, dir: -1 | 1) => {
    setSwipeOrders(prev => {
      const order = [...(prev[pollId] || [])]
      const target = idx + dir
      if (target < 0 || target >= order.length) return prev
      ;[order[idx], order[target]] = [order[target], order[idx]]
      return { ...prev, [pollId]: order }
    })
  }

  const handleSubmitSwipeOrder = async (poll: Poll) => {
    const order = swipeOrders[poll.id]
    if (!order?.length) return
    setSubmittingSwipeOrder(poll.id)
    try {
      const options = order.map((optId, idx) => ({ option_id: optId, sort_order: idx }))
      await groupsApi.updatePollOptionOrder(tripId, poll.id, options)
      toast.success(t('groups.polls.orderSaved') || 'Volgorde opgeslagen')
      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message)
    } finally {
      setSubmittingSwipeOrder(null)
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
      toast.success(t('groups.polls.closed') || 'Poll gesloten')
      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message)
    }
  }

  const handleDecide = async (poll: Poll, optionId: string) => {
    try {
      await groupsApi.closePoll(tripId, poll.id, 'decided', optionId)
      toast.success(t('groups.polls.decided') || 'Beslissing vastgelegd!')
      setDecidingPoll(null)
      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message)
    }
  }

  const handleGenerateGuestLink = async (pollId: string) => {
    setGuestLinkLoading(true)
    setGuestLinkPollId(pollId)
    try {
      const data = await groupsApi.createGuestLink(tripId, pollId)
      setGuestLinkToken(data.token)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message)
      setGuestLinkPollId(null)
    } finally {
      setGuestLinkLoading(false)
    }
  }

  const guestVoteUrl = (token: string) => `${window.location.origin}/guest/poll/${token}`

  const copyGuestLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(guestVoteUrl(token))
      toast.success(t('groups.polls.linkCopied') || 'Link gekopieerd!')
    } catch {
      toast.error('Kopiëren mislukt')
    }
  }

  const totalVotes = (poll: Poll) => poll.options.reduce((s, o) => s + o.vote_count, 0)
  const maxVotes = (poll: Poll) => Math.max(1, ...poll.options.map(o => o.vote_count))

  const pollTypeLabel = (type: string) => {
    const found = POLL_TYPES.find(pt => pt.value === type)
    return found ? (t(found.labelKey) || found.value) : type
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart2 size={15} style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('groups.polls.title') || 'Stemmingen'}{tripTitle && <span className="font-normal text-xs ml-1" style={{ color: 'var(--text-faint)' }}>— {tripTitle}</span>}
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
            {t('groups.polls.newPoll') || 'Nieuwe stemming aanmaken'}
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
            className="w-full px-3 py-2 rounded-lg border text-sm resize-none mb-2"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
          />
          {/* Poll type */}
          <div className="flex gap-1 flex-wrap mb-2">
            {POLL_TYPES.map(pt => (
              <button
                key={pt.value}
                type="button"
                onClick={() => setPollType(pt.value)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors"
                style={{
                  background: pollType === pt.value ? 'var(--accent)' : 'var(--bg-card)',
                  color: pollType === pt.value ? 'white' : 'var(--text-muted)',
                  borderColor: pollType === pt.value ? 'var(--accent)' : 'var(--border-primary)',
                }}
              >
                {t(pt.labelKey) || pt.value}
              </button>
            ))}
          </div>
          {/* Deadline */}
          <div className="mb-3">
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-muted)' }}>
              {t('groups.polls.deadline') || 'Deadline (optioneel)'}
            </label>
            <input
              type="datetime-local"
              value={pollDeadline}
              onChange={e => setPollDeadline(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border text-xs"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            />
          </div>
          {/* Settings toggles */}
          <div className="flex gap-3 mb-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={pollAnonymous}
                onChange={e => setPollAnonymous(e.target.checked)}
                className="w-3.5 h-3.5 rounded"
              />
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {t('groups.polls.anonymous') || 'Anoniem stemmen'}
              </span>
              <Lock size={11} style={{ color: 'var(--text-faint)' }} />
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={pollAllowGuest}
                onChange={e => setPollAllowGuest(e.target.checked)}
                className="w-3.5 h-3.5 rounded"
              />
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {t('groups.polls.allowGuest') || 'Gasten toestaan'}
              </span>
              <Link2 size={11} style={{ color: 'var(--text-faint)' }} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowCreate(false); setPollTitle(''); setPollDesc(''); setPollType('single_choice'); setPollDeadline(''); setPollAnonymous(false); setPollAllowGuest(false) }}
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

      {loading && polls.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-muted)' }} />
        </div>
      )}

      {!loading && polls.length === 0 && (
        <p className="text-xs text-center py-4" style={{ color: 'var(--text-faint)' }}>
          {t('groups.polls.empty') || 'Nog geen stemmingen. Maak een poll aan om bestemmingen voor te stellen.'}
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
                      <span className="px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: 'var(--bg-secondary)', color: 'var(--text-faint)' }}>
                        {pollTypeLabel(poll.type)}
                      </span>
                      {poll.anonymous && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: 'var(--bg-secondary)', color: 'var(--text-faint)' }}>
                          <Lock size={9} /> {t('groups.polls.anonymousShort') || 'Anoniem'}
                        </span>
                      )}
                      {poll.allow_guest_votes && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: 'var(--bg-secondary)', color: 'var(--text-faint)' }}>
                          <Link2 size={9} /> {t('groups.polls.guestShort') || 'Gasten'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        {poll.options.length} {t('groups.polls.options') || 'opties'} · {tv} {t('groups.polls.votes') || 'stemmen'}
                      </span>
                      {poll.my_votes?.length > 0 && isOpen && (
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

                  {/* ── Swipe type: button to open swipe modal ── */}
                  {poll.type === 'swipe' && isOpen && (
                    <button
                      onClick={() => setSwipePoll(poll)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border mb-3 text-sm font-medium transition-opacity hover:opacity-80"
                      style={{ background: 'var(--accent)', color: 'white', borderColor: 'transparent' }}
                    >
                      <Shuffle size={14} />
                      {t('groups.polls.startSwipe') || 'Swipe door opties'}
                    </button>
                  )}

                  {/* ── Swipe type: reorder options ── */}
                  {poll.type === 'swipe' && isOpen && isCreator && (
                    <div className="mb-3">
                      <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
                        {t('groups.polls.reorderSwipe') || 'Verander volgorde van opties:'}
                      </p>
                      <div className="space-y-1">
                        {(swipeOrders[poll.id] || poll.options.map(o => o.id)).map((optId, idx) => {
                          const opt = poll.options.find(o => o.id === optId)
                          if (!opt) return null
                          return (
                            <div
                              key={optId}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg border"
                              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
                            >
                              <span className="w-5 text-center text-xs font-bold" style={{ color: 'var(--accent)' }}>{idx + 1}</span>
                              <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                              <button
                                disabled={idx === 0}
                                onClick={() => moveSwipeItem(poll.id, idx, -1)}
                                className="p-1 rounded disabled:opacity-20"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                <ArrowUp size={13} />
                              </button>
                              <button
                                disabled={idx === (swipeOrders[poll.id]?.length ?? poll.options.length) - 1}
                                onClick={() => moveSwipeItem(poll.id, idx, 1)}
                                className="p-1 rounded disabled:opacity-20"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                <ArrowDown size={13} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                      <button
                        onClick={() => handleSubmitSwipeOrder(poll)}
                        disabled={submittingSwipeOrder === poll.id}
                        className="mt-2 w-full py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--accent)' }}
                      >
                        {submittingSwipeOrder === poll.id ? '...' : t('groups.polls.submitRanking') || 'Volgorde opslaan'}
                      </button>
                    </div>
                  )}

                  {/* ── Ranked type: drag order ── */}
                  {poll.type === 'ranked' && isOpen && (
                    <div className="mb-3">
                      <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
                        {t('groups.polls.rankHint') || 'Zet de opties in volgorde van voorkeur (1 = beste keuze)'}
                      </p>
                      <div className="space-y-1">
                        {(rankedOrders[poll.id] || poll.options.map(o => o.id)).map((optId, idx) => {
                          const opt = poll.options.find(o => o.id === optId)
                          if (!opt) return null
                          return (
                            <div
                              key={optId}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg border"
                              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
                            >
                              <span className="w-5 text-center text-xs font-bold" style={{ color: 'var(--accent)' }}>{idx + 1}</span>
                              <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                              <button
                                disabled={idx === 0}
                                onClick={() => moveRankItem(poll.id, idx, -1)}
                                className="p-1 rounded disabled:opacity-20"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                <ArrowUp size={13} />
                              </button>
                              <button
                                disabled={idx === (rankedOrders[poll.id]?.length ?? poll.options.length) - 1}
                                onClick={() => moveRankItem(poll.id, idx, 1)}
                                className="p-1 rounded disabled:opacity-20"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                <ArrowDown size={13} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                      <button
                        onClick={() => handleSubmitRanked(poll)}
                        disabled={submittingRank === poll.id}
                        className="mt-2 w-full py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--accent)' }}
                      >
                        {submittingRank === poll.id ? '...' : t('groups.polls.submitRanking') || 'Volgorde opslaan'}
                      </button>
                    </div>
                  )}

                  {/* ── Ranked results (closed) ── */}
                  {poll.type === 'ranked' && !isOpen && (
                    <div className="space-y-2 mb-3">
                      {[...poll.options].sort((a, b) => (b.borda_score ?? 0) - (a.borda_score ?? 0)).map((opt, idx) => (
                        <div key={opt.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                          <span className="w-5 text-center text-xs font-bold" style={{ color: idx === 0 ? '#ca8a04' : 'var(--text-faint)' }}>#{idx + 1}</span>
                          <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{opt.borda_score ?? 0} pts</span>
                          {idx === 0 && <Trophy size={12} color="#ca8a04" />}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Swipe results (closed) ── */}
                  {poll.type === 'swipe' && !isOpen && (
                    <div className="space-y-2 mb-3">
                      {[...poll.options].sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0)).map((opt, idx) => {
                        const s = opt.swipe_stats ?? { like: 0, superlike: 0, dislike: 0 }
                        return (
                          <div key={opt.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                            <span className="w-5 text-center text-xs font-bold" style={{ color: idx === 0 ? '#ca8a04' : 'var(--text-faint)' }}>#{idx + 1}</span>
                            <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>⭐{s.superlike} 👍{s.like} 👎{s.dislike}</span>
                            {idx === 0 && <Trophy size={12} color="#ca8a04" />}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* ── Single / Multi choice options ── */}
                  {(poll.type === 'single_choice' || poll.type === 'multi_choice') && (
                    <div className="space-y-2">
                      {poll.options.map(opt => {
                        const pct = tv > 0 ? Math.round((opt.vote_count / tv) * 100) : 0
                        const barWidth = mv > 0 ? (opt.vote_count / mv) * 100 : 0
                        const isMyVote = poll.my_votes?.includes(opt.id)
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
                              <div
                                className="absolute inset-y-0 left-0 transition-all duration-500"
                                style={{ width: `${barWidth}%`, background: isMyVote ? 'var(--accent-soft, rgba(99,102,241,0.12))' : 'var(--bg-tertiary)', borderRadius: 8 }}
                              />
                              <div className="relative flex items-center gap-2 px-3 py-2.5">
                                <div
                                  className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center border"
                                  style={{
                                    borderRadius: poll.type === 'multi_choice' ? 4 : '50%',
                                    background: isMyVote ? 'var(--accent)' : 'transparent',
                                    borderColor: isMyVote ? 'var(--accent)' : 'var(--border-primary)',
                                  }}
                                >
                                  {isMyVote ? <Check size={11} color="white" /> : opt.lat ? <MapPin size={10} style={{ color: 'var(--text-faint)' }} /> : null}
                                </div>
                                {opt.image_url && (
                                  <img src={opt.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border" style={{ borderColor: 'var(--border-primary)' }} />
                                )}
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
                  )}

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
                      {/* Minimap for selected location */}
                      {optionLat != null && optionLng != null && (
                        <div className="mb-2 rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-primary)', height: 120 }}>
                          <MapContainer
                            center={[optionLat, optionLng]}
                            zoom={12}
                            zoomControl={false}
                            scrollWheelZoom={false}
                            style={{ width: '100%', height: '100%' }}
                          >
                            <TileLayer
                              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            />
                            <Marker
                              position={[optionLat, optionLng]}
                              icon={L.divIcon({
                                className: '',
                                html: '<div style="width:10px;height:10px;border-radius:50%;background:#111827;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
                                iconSize: [10, 10],
                                iconAnchor: [5, 5],
                              })}
                            />
                          </MapContainer>
                        </div>
                      )}
                      <input
                        type="text"
                        value={optionDesc}
                        onChange={e => setOptionDesc(e.target.value)}
                        placeholder={t('groups.polls.optionDescPlaceholder') || 'Optionele toelichting...'}
                        className="w-full px-3 py-2 rounded-lg border text-sm mb-2"
                        style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                      />
                      {/* Image upload */}
                      <div className="mb-2">
                        <label className="flex items-center gap-2 cursor-pointer w-fit">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              setOptionImageUploading(true)
                              try {
                                const fd = new FormData()
                                fd.append('file', file)
                                const res = await filesApi.upload(tripId, fd)
                                setOptionImageUrl(res.file?.url || res.url)
                              } catch {
                                toast.error(t('groups.polls.imageUploadError') || 'Upload mislukt')
                              } finally {
                                setOptionImageUploading(false)
                              }
                            }}
                          />
                          <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors hover:opacity-80"
                            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', color: 'var(--text-muted)' }}>
                            <MapPin size={12} />
                            {optionImageUploading ? '...' : (optionImageUrl ? t('groups.polls.changeImage') || 'Afbeelding wijzigen' : t('groups.polls.addImage') || 'Afbeelding toevoegen')}
                          </span>
                        </label>
                        {optionImageUrl && (
                          <div className="mt-2 relative inline-block">
                            <img src={optionImageUrl} alt="" className="w-24 h-16 object-cover rounded-lg border" style={{ borderColor: 'var(--border-primary)' }} />
                            <button
                              onClick={() => setOptionImageUrl(null)}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px]"
                            >×</button>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => { setAddingOptionTo(null); setOptionLabel(''); setOptionDesc(''); setOptionLat(null); setOptionLng(null); setOptionImageUrl(null) }}
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

                  {/* Poll actions */}
                  {isOpen && isCreator && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t" style={{ borderColor: 'var(--border-faint)' }}>
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
                      {/* Guest link */}
                      {poll.allow_guest_votes && (
                        guestLinkPollId !== poll.id ? (
                          <button
                            onClick={() => handleGenerateGuestLink(poll.id)}
                            disabled={guestLinkLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                          >
                            <Link2 size={12} />
                            {t('groups.polls.shareLink') || 'Deellink'}
                          </button>
                        ) : (
                          guestLinkToken && (
                            <button
                              onClick={() => copyGuestLink(guestLinkToken)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ background: 'var(--bg-success-soft, #dcfce7)', color: '#15803d' }}
                            >
                              <Copy size={12} />
                              {t('groups.polls.copyLink') || 'Link kopiëren'}
                            </button>
                          )
                        )
                      )}
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
              <button onClick={() => setDecidingPoll(null)} style={{ color: 'var(--text-faint)' }}><X size={16} /></button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              {t('groups.polls.decideHint') || 'Selecteer de winnende optie. De poll wordt daarna gesloten.'}
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

      {/* Swipe Poll Modal */}
      {swipePoll && (
        <SwipePoll
          poll={swipePoll}
          tripId={tripId}
          onClose={() => { setSwipePoll(null); load() }}
        />
      )}
    </div>
  )
}
