import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { shareApi } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { useTranslation } from '../i18n'
import { Users } from 'lucide-react'

export default function TripInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { t } = useTranslation()
  const [tripTitle, setTripTitle] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!token) return
    shareApi.previewCollabInvite(token)
      .then(d => setTripTitle(d.tripTitle))
      .catch(() => setError(true))
  }, [token])

  const handleJoin = async () => {
    if (!token) return
    setJoining(true)
    try {
      const d = await shareApi.joinTripViaInvite(token)
      navigate(`/trips/${d.tripId}`)
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 401 || err?.response?.data?.code === 'AUTH_REQUIRED') {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
        return
      }
      setError(true)
      setJoining(false)
    }
  }

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f3f4f6' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{t('shared.expired')}</h1>
        <p style={{ color: '#6b7280', marginTop: 8 }}>{t('shared.expiredHint')}</p>
      </div>
    </div>
  )

  if (!tripTitle) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f3f4f6' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#111827', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f3f4f6', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" }}>
      <div style={{ background: 'white', borderRadius: 20, padding: '40px 32px', maxWidth: 400, width: '100%', margin: '0 16px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Users size={26} color="#374151" />
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          {t('share.collabTitle')}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>{tripTitle}</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 28, lineHeight: 1.5 }}>
          {t('share.collabHint')}
        </p>

        {user ? (
          <button
            onClick={handleJoin}
            disabled={joining}
            style={{
              display: 'block', width: '100%', padding: '12px 0', borderRadius: 12,
              background: '#111827', color: 'white', border: 'none',
              fontSize: 14, fontWeight: 600, cursor: joining ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: joining ? 0.7 : 1, transition: 'opacity 0.15s',
            }}
          >
            {joining ? '...' : t('share.collabJoin')}
          </button>
        ) : (
          <a
            href={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}
            style={{
              display: 'block', width: '100%', padding: '12px 0', borderRadius: 12,
              background: '#111827', color: 'white', textDecoration: 'none',
              fontSize: 14, fontWeight: 600, textAlign: 'center', fontFamily: 'inherit',
            }}
          >
            {t('share.collabLoginRequired')}
          </a>
        )}
      </div>
    </div>
  )
}
