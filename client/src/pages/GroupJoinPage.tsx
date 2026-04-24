import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from '../i18n'
import { useAuthStore } from '../store/authStore'
import { groupsApi } from '../api/client'
import { Users, LogIn, UserPlus, ArrowRight, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'

interface GroupPreview {
  groupId: number
  name: string
  description: string | null
  cover_image: string | null
  role: string
}

export default function GroupJoinPage(): React.ReactElement {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const { isAuthenticated, user } = useAuthStore()

  const [group, setGroup] = useState<GroupPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)

  useEffect(() => {
    if (!token) { setError('Invalid link'); setLoading(false); return }
    groupsApi.validateInvite(token)
      .then(data => { setGroup(data.group); setLoading(false) })
      .catch((err: any) => {
        setError(err?.response?.data?.error || 'Invalid or expired invite link')
        setLoading(false)
      })
  }, [token])

  const handleJoin = async () => {
    if (!token || !group) return
    setJoining(true)
    try {
      await groupsApi.joinWithToken(token)
      toast.success(t('groups.join.success') || 'You joined the group!')
      setJoined(true)
      setTimeout(() => navigate('/groups'), 1500)
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to join group'
      toast.error(msg)
      if (msg.includes('already a member')) {
        setJoined(true)
        setTimeout(() => navigate('/groups'), 1500)
      }
    } finally {
      setJoining(false)
    }
  }

  const redirectPath = token ? `/join-group/${token}` : '/groups'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }} />
      </div>
    )
  }

  if (error || !group) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center max-w-sm">
          <Users size={48} className="mx-auto mb-4" style={{ color: 'var(--text-faint)' }} />
          <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            {t('groups.join.invalidTitle') || 'Invite link expired'}
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            {error || t('groups.join.invalidBody') || 'This invite link is invalid or has expired. Ask the group owner for a new one.'}
          </p>
          <button
            onClick={() => navigate('/groups')}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--accent)' }}
          >
            {t('groups.title') || 'Groups'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm">
        {/* Group card */}
        <div className="rounded-2xl border p-6 mb-6 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: group.cover_image ? undefined : 'var(--bg-secondary)', backgroundImage: group.cover_image ? `url(${group.cover_image})` : undefined, backgroundSize: 'cover' }}
          >
            {!group.cover_image && <Users size={28} style={{ color: 'var(--text-faint)' }} />}
          </div>
          <h1 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{group.name}</h1>
          {group.description && (
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{group.description}</p>
          )}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
            <Users size={12} />
            {t('groups.join.invitedAs') || 'Invited as'} <span className="capitalize font-semibold">{group.role}</span>
          </span>
        </div>

        {/* Actions */}
        {joined ? (
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-success)' }}>
                <Check size={16} className="text-white" />
              </div>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{t('groups.join.joined') || 'Joined!'}</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{t('groups.join.redirecting') || 'Redirecting...'}</p>
          </div>
        ) : isAuthenticated ? (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-60 transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            {joining ? (
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />
            ) : (
              <>
                <ArrowRight size={16} />
                {t('groups.join.join') || 'Join Group'}
              </>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-center text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              {t('groups.join.loginRequired') || 'Sign in or create an account to join this group.'}
            </p>
            <button
              onClick={() => navigate(`/login?redirect=${encodeURIComponent(redirectPath)}`)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              <LogIn size={16} />
              {t('login.title') || 'Sign In'}
            </button>
            <button
              onClick={() => navigate(`/register?redirect=${encodeURIComponent(redirectPath)}`)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border transition-colors"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            >
              <UserPlus size={16} />
              {t('login.register') || 'Create Account'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
