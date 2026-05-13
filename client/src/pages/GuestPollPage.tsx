import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Check, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { apiClient } from '../api/client'
import { useTranslation } from '../i18n'

interface PollOption {
  id: string
  label: string
  description: string | null
  image_url: string | null
  vote_count: number
}

interface GuestPollData {
  poll: {
    id: string
    trip_id: string
    title: string
    description: string | null
    type: 'single_choice' | 'multi_choice' | 'ranked' | 'swipe'
    status: 'open' | 'closed' | 'decided'
    anonymous: boolean
    deadline: string | null
    options: PollOption[]
  }
  my_votes?: string[]
  my_ranks?: Array<{ option_id: string; rank: number }>
}

export default function GuestPollPage() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()
  const [data, setData] = useState<GuestPollData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [guestName, setGuestName] = useState('')
  const [selectedVotes, setSelectedVotes] = useState<string[]>([])
  const [rankOrder, setRankOrder] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    apiClient.get(`/guest/poll/${token}`)
      .then(r => {
        const d = r.data as GuestPollData
        setData(d)
        setSelectedVotes(d.my_votes || [])
        if (d.my_ranks) {
          setRankOrder(d.my_ranks.sort((a, b) => a.rank - b.rank).map(r => r.option_id))
        } else {
          setRankOrder(d.poll.options.map(o => o.id))
        }
      })
      .catch(e => setError(e.response?.data?.error || t('common.invalidOrExpiredLink') || 'Invalid or expired link'))
      .finally(() => setLoading(false))
  }, [token, t])

  const handleVote = (optionId: string) => {
    if (data?.poll.type === 'single_choice') {
      setSelectedVotes([optionId])
    } else if (data?.poll.type === 'multi_choice') {
      setSelectedVotes(prev =>
        prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId]
      )
    }
  }

  const handleSave = async () => {
    if (!guestName.trim()) {
      toast.error(t('common.nameRequired') || 'Vul je naam in')
      return
    }
    if (!data) return

    let votes = selectedVotes
    if (data.poll.type === 'ranked') {
      votes = rankOrder
    }

    setSaving(true)
    try {
      await apiClient.post(`/guest/poll/${token}/vote`, {
        votes,
        guest_name: guestName,
      })
      setSaved(true)
      toast.success(t('groups.polls.votesSaved') || 'Stemmen opgeslagen!')
    } catch (e: any) {
      toast.error(e.response?.data?.error || t('common.tryAgain') || 'Er ging iets mis')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-muted)' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
        <div className="max-w-sm w-full rounded-2xl p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
          <p className="text-center" style={{ color: 'var(--text-muted)' }}>{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { poll } = data
  const isOpen = poll.status === 'open'
  const totalVotes = poll.options.reduce((s, o) => s + o.vote_count, 0)
  const maxVotes = Math.max(1, ...poll.options.map(o => o.vote_count))

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto p-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{poll.title}</h1>
          {poll.description && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{poll.description}</p>
          )}
          {poll.anonymous && (
            <div className="flex items-center gap-1 mt-2 text-xs" style={{ color: 'var(--text-faint)' }}>
              <Lock size={13} /> {t('groups.polls.anonymousVoting') || 'Anoniem stemmen'}
            </div>
          )}
          {!isOpen && (
            <div className="mt-3 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
              <span className="text-xs font-medium">
                {poll.status === 'decided' ? '✓ Besloten' : 'Gesloten'}
              </span>
            </div>
          )}
        </div>

        {/* Name input */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            {t('common.yourName') || 'Je naam'}
          </label>
          <input
            type="text"
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            placeholder={t('common.enterName') || 'Vul je naam in'}
            disabled={saved}
            className="w-full px-3 py-2 rounded-lg border"
            style={{
              background: 'var(--bg-input)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Poll options */}
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
            style={{ background: 'var(--bg-card)' }}
          >
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {poll.options.length} {t('groups.polls.options') || 'opties'}
            </span>
            {expanded ? <ChevronUp size={18} style={{ color: 'var(--text-faint)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-faint)' }} />}
          </button>

          {expanded && (
            <div style={{ borderTop: '1px solid var(--border-primary)' }}>
              {poll.type === 'ranked' ? (
                <div className="p-4 space-y-2">
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    {t('groups.polls.rankHint') || 'Sleep om in volgorde te zetten'}
                  </p>
                  {rankOrder.map((optId, idx) => {
                    const opt = poll.options.find(o => o.id === optId)
                    if (!opt) return null
                    return (
                      <div
                        key={optId}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border"
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
                      >
                        <span className="w-5 text-center text-xs font-bold" style={{ color: 'var(--accent)' }}>
                          {idx + 1}
                        </span>
                        <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {poll.options.map(opt => {
                    const pct = totalVotes > 0 ? Math.round((opt.vote_count / totalVotes) * 100) : 0
                    const barWidth = maxVotes > 0 ? (opt.vote_count / maxVotes) * 100 : 0
                    const isSelected = selectedVotes.includes(opt.id)

                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleVote(opt.id)}
                        disabled={!isOpen || saved}
                        className="w-full text-left rounded-lg border overflow-hidden transition-all relative"
                        style={{
                          borderColor: isSelected ? 'var(--accent)' : 'var(--border-primary)',
                          background: isSelected ? 'var(--accent-soft, rgba(99,102,241,0.12))' : 'var(--bg-secondary)',
                        }}
                      >
                        <div
                          className="absolute inset-y-0 left-0 transition-all duration-500"
                          style={{
                            width: `${barWidth}%`,
                            background: 'var(--bg-tertiary)',
                            opacity: 0.5,
                          }}
                        />
                        <div className="relative flex items-center gap-2 px-3 py-2.5">
                          <div
                            className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center border"
                            style={{
                              borderRadius: poll.type === 'multi_choice' ? 4 : '50%',
                              background: isSelected ? 'var(--accent)' : 'transparent',
                              borderColor: isSelected ? 'var(--accent)' : 'var(--border-primary)',
                            }}
                          >
                            {isSelected && <Check size={11} color="white" />}
                          </div>
                          {opt.image_url && (
                            <img src={opt.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border" style={{ borderColor: 'var(--border-primary)' }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{opt.label}</p>
                            {opt.description && (
                              <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{opt.description}</p>
                            )}
                          </div>
                          <div className="flex-shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                            {opt.vote_count} ({pct}%)
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={!isOpen || saving || saved}
            className="flex-1 py-3 rounded-lg font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {saved ? (t('common.saved') || '✓ Opgeslagen') : (saving ? '...' : (t('common.save') || 'Opslaan'))}
          </button>
        </div>

        {saved && (
          <div className="mt-4 p-3 rounded-lg text-center text-sm" style={{ background: 'var(--bg-success-soft, #dcfce7)', color: '#15803d' }}>
            ✓ {t('groups.polls.votesSaved') || 'Je stemmen zijn opgeslagen!'}
          </div>
        )}
      </div>
    </div>
  )
}
