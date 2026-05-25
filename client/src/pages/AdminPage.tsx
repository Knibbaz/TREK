import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { adminApi, authApi, notificationsApi, exploreApi } from '../api/client'
import DevNotificationsPanel from '../components/Admin/DevNotificationsPanel'
import DefaultUserSettingsTab from '../components/Admin/DefaultUserSettingsTab'
import { useAuthStore } from '../store/authStore'
import { useSettingsStore } from '../store/settingsStore'
import { useAddonStore } from '../store/addonStore'
import { useTranslation } from '../i18n'
import { getApiErrorMessage } from '../types'
import Navbar from '../components/Layout/Navbar'
import Modal from '../components/shared/Modal'
import { useToast } from '../components/shared/Toast'
import { useCountUp } from '../hooks/useCountUp'
import CategoryManager from '../components/Admin/CategoryManager'
import BackupPanel from '../components/Admin/BackupPanel'
import GitHubPanel from '../components/Admin/GitHubPanel'
import AddonManager from '../components/Admin/AddonManager'
import PackingTemplateManager from '../components/Admin/PackingTemplateManager'
import AuditLogPanel from '../components/Admin/AuditLogPanel'
import AdminMcpTokensPanel from '../components/Admin/AdminMcpTokensPanel'
import PermissionsPanel from '../components/Admin/PermissionsPanel'
import GdprAdminPanel from '../components/Admin/GdprAdminPanel'
import { CreatorApplicationQueue } from '../components/Admin/CreatorApplicationQueue'
import BrandingPanel from '../components/Admin/BrandingPanel'
import { Users, Map, Briefcase, Shield, Trash2, Edit2, FileText, Eye, EyeOff, Save, CheckCircle, XCircle, Loader2, UserPlus, ArrowUpCircle, ExternalLink, Download, Sun, Link2, Copy, Plus, RefreshCw, AlertTriangle, SlidersHorizontal, UserCog, Puzzle, Settings as SettingsIcon, Bell, Database, ScrollText, KeyRound, GitBranch, Bug, Compass, Clock, CreditCard, ChevronDown, Palette } from 'lucide-react'
import CustomSelect from '../components/shared/CustomSelect'
import PageSidebar, { type PageSidebarTab } from '../components/Layout/PageSidebar'

interface AdminUser {
  id: number
  username: string
  email: string
  role: 'admin' | 'user' | 'creator'
  creator_auto_approved?: number
  creator_fee_percent?: number | null
  created_at: string
  last_login?: string | null
  online?: boolean
  oidc_issuer?: string | null
  avatar_url?: string | null
}

interface ExploreSubmission {
  id: number
  trip_id: number
  status: 'pending' | 'approved' | 'rejected'
  price: number
  title: string
  description: string | null
  start_date: string | null
  end_date: string | null
  cover_image: string | null
  submitter_name: string
  submitter_email: string
  creator_auto_approved: number
  community_enabled: number
  created_at: string
  day_count?: number
  place_count?: number
}

interface AdminStats {
  totalUsers: number
  totalTrips: number
  totalPlaces: number
  totalFiles: number
}

interface OidcConfig {
  issuer: string
  client_id: string
  client_secret: string
  client_secret_set: boolean
  display_name: string
  discovery_url: string
}

interface UpdateInfo {
  update_available: boolean
  latest: string
  current: string
  release_url?: string
  is_docker?: boolean
  is_prerelease?: boolean
}

interface MollieMethod {
  name: string
  fixed_cents: number
  variable_pct: number
}

const ADMIN_EVENT_LABEL_KEYS: Record<string, string> = {
  version_available: 'settings.notifyVersionAvailable',
}

const ADMIN_CHANNEL_LABEL_KEYS: Record<string, string> = {
  inapp: 'settings.notificationPreferences.inapp',
  email: 'settings.notificationPreferences.email',
  webhook: 'settings.notificationPreferences.webhook',
  ntfy: 'settings.notificationPreferences.ntfy',
}

function AdminNotificationsPanel({ t, toast }: { t: (k: string) => string; toast: ReturnType<typeof useToast> }) {
  const [matrix, setMatrix] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminApi.getNotificationPreferences().then((data: any) => setMatrix(data)).catch(() => {})
  }, [])

  if (!matrix) return <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', padding: 16 }}>Loading…</p>

  const visibleChannels = (['inapp', 'email', 'webhook', 'ntfy'] as const).filter(ch => {
    if (!matrix.available_channels[ch]) return false
    return matrix.event_types.some((evt: string) => matrix.implemented_combos[evt]?.includes(ch))
  })

  const toggle = async (eventType: string, channel: string) => {
    const current = matrix.preferences[eventType]?.[channel] ?? true
    const updated = { ...matrix.preferences, [eventType]: { ...matrix.preferences[eventType], [channel]: !current } }
    setMatrix((m: any) => m ? { ...m, preferences: updated } : m)
    setSaving(true)
    try {
      await adminApi.updateNotificationPreferences(updated)
    } catch {
      setMatrix((m: any) => m ? { ...m, preferences: matrix.preferences } : m)
      toast.error(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  if (matrix.event_types.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('settings.notificationPreferences.noChannels')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">{t('admin.tabs.notifications')}</h2>
          <p className="text-xs text-slate-400 mt-1">{t('admin.notifications.adminNotificationsHint')}</p>
        </div>
        <div className="p-6">
          {saving && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>Saving…</p>}
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: `1fr ${visibleChannels.map(() => '80px').join(' ')}`, gap: 4, paddingBottom: 6, marginBottom: 4, borderBottom: '1px solid var(--border-primary)' }}>
            <span />
            {visibleChannels.map(ch => (
              <span key={ch} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t(ADMIN_CHANNEL_LABEL_KEYS[ch]) || ch}
              </span>
            ))}
          </div>
          {/* Event rows */}
          {matrix.event_types.map((eventType: string) => {
            const implementedForEvent = matrix.implemented_combos[eventType] ?? []
            return (
              <div key={eventType} style={{ display: 'grid', gridTemplateColumns: `1fr ${visibleChannels.map(() => '80px').join(' ')}`, gap: 4, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-primary)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  {t(ADMIN_EVENT_LABEL_KEYS[eventType]) || eventType}
                </span>
                {visibleChannels.map(ch => {
                  if (!implementedForEvent.includes(ch)) {
                    return <span key={ch} style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>—</span>
                  }
                  const isOn = matrix.preferences[eventType]?.[ch] ?? true
                  return (
                    <div key={ch} style={{ display: 'flex', justifyContent: 'center' }}>
                      <button
                        onClick={() => toggle(eventType, ch)}
                        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0"
                        style={{ background: isOn ? 'var(--text-primary)' : 'var(--border-primary)' }}
                      >
                        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-200"
                          style={{ transform: isOn ? 'translateX(16px)' : 'translateX(0)' }} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AdminStatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }): React.ReactElement {
  const animated = useCountUp(value, 900)
  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center gap-4">
        <Icon className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
        <div>
          <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{animated}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
        </div>
      </div>
    </div>
  )
}

export default function AdminPage(): React.ReactElement {
  const { demoMode, serverTimezone } = useAuthStore()
  const { t, locale } = useTranslation()
  const hour12 = useSettingsStore(s => s.settings.time_format) === '12h'
  const loadSettings = useSettingsStore(s => s.loadSettings)
  const mcpEnabled = useAddonStore(s => s.isEnabled('mcp'))
  const exploreEnabled = useAddonStore(s => s.isEnabled('explore'))
  const packingEnabled = useAddonStore(s => s.isEnabled('packing'))
  const devMode = useAuthStore(s => s.devMode)
  const TABS: PageSidebarTab[] = [
    { id: 'users', label: t('admin.tabs.users'), icon: Users },
    ...(exploreEnabled ? [{ id: 'explore', label: 'Explore', icon: Compass }] : []),
    ...(exploreEnabled ? [{ id: 'payouts', label: t('admin.tabs.payouts') || 'Payouts', icon: CreditCard }] : []),
    { id: 'config', label: t('admin.tabs.config'), icon: SlidersHorizontal },
    { id: 'defaults', label: t('admin.tabs.defaults'), icon: UserCog },
    { id: 'addons', label: t('admin.tabs.addons'), icon: Puzzle },
    { id: 'groups', label: t('admin.tabs.groups') || 'Groups', icon: Users },
    { id: 'branding', label: t('admin.tabs.branding') || 'Branding', icon: Palette },
    { id: 'settings', label: t('admin.tabs.settings'), icon: SettingsIcon },
    { id: 'notifications', label: t('admin.tabs.notifications'), icon: Bell },
    { id: 'backup', label: t('admin.tabs.backup'), icon: Database },
    { id: 'audit', label: t('admin.tabs.audit'), icon: ScrollText },
    { id: 'gdpr', label: t('admin.tabs.gdpr'), icon: Shield },
    ...(mcpEnabled ? [{ id: 'mcp-tokens', label: t('admin.tabs.mcpTokens'), icon: KeyRound }] : []),
    { id: 'github', label: t('admin.tabs.github'), icon: GitBranch },
    ...(devMode ? [{ id: 'dev-notifications', label: 'Dev: Notifications', icon: Bug }] : []),
  ]

  const [activeTab, setActiveTab] = useState<string>('users')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [editForm, setEditForm] = useState<{ username: string; email: string; role: string; password: string; creator_auto_approved: boolean; creator_fee_percent: string }>({ username: '', email: '', role: 'user', password: '', creator_auto_approved: false, creator_fee_percent: '' })
  const [showCreateUser, setShowCreateUser] = useState<boolean>(false)
  const [createForm, setCreateForm] = useState<{ username: string; email: string; password: string; role: string; send_welcome_email: boolean }>({ username: '', email: '', password: '', role: 'user', send_welcome_email: false })
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null)
  const [userTripStats, setUserTripStats] = useState<Record<number, any>>({})

  // Explore submissions
  const [submissions, setSubmissions] = useState<ExploreSubmission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissionFilter, setSubmissionFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [approvingId, setApprovingId] = useState<number | null>(null)
  const [autoApproveMap, setAutoApproveMap] = useState<Record<number, boolean>>({})
  const [previewSubmission, setPreviewSubmission] = useState<ExploreSubmission | null>(null)
  const [exploreSubtab, setExploreSubtab] = useState<'submissions' | 'creators'>('submissions')

  const loadSubmissions = async () => {
    setSubmissionsLoading(true)
    try {
      const data = await exploreApi.getSubmissions(submissionFilter)
      setSubmissions(data.submissions || [])
    } catch {}
    setSubmissionsLoading(false)
  }

  useEffect(() => {
    if (activeTab === 'explore') loadSubmissions()
    if (activeTab === 'payouts') loadPayouts()
  }, [activeTab, submissionFilter])

  const handleApprove = async (s: ExploreSubmission) => {
    setApprovingId(s.id)
    try {
      await exploreApi.approveSubmission(s.id, { auto_approve: autoApproveMap[s.id] ?? false })
      await loadSubmissions()
      toast.success(t('admin.explore.approveSuccess', { title: s.title }))
    } catch {
      toast.error(t('admin.explore.approveError'))
    }
    setApprovingId(null)
  }

  const handleReject = async (s: ExploreSubmission) => {
    if (!window.confirm(t('admin.explore.rejectConfirm', { title: s.title }))) return
    try {
      await exploreApi.rejectSubmission(s.id)
      await loadSubmissions()
      toast.success(t('admin.explore.rejectSuccess'))
    } catch {
      toast.error(t('admin.explore.rejectError'))
    }
  }

  // Bag tracking
  const [bagTrackingEnabled, setBagTrackingEnabled] = useState<boolean>(false)
  useEffect(() => { adminApi.getBagTracking().then(d => setBagTrackingEnabled(d.enabled)).catch(() => {}) }, [])

  // Places photos
  const [placesPhotosEnabled, setPlacesPhotosEnabledState] = useState<boolean>(true)
  useEffect(() => { adminApi.getPlacesPhotos().then(d => setPlacesPhotosEnabledState(d.enabled)).catch(() => {}) }, [])

  // Places autocomplete
  const [placesAutocompleteEnabled, setPlacesAutocompleteEnabledState] = useState<boolean>(true)
  useEffect(() => { adminApi.getPlacesAutocomplete().then(d => setPlacesAutocompleteEnabledState(d.enabled)).catch(() => {}) }, [])

  // Places details
  const [placesDetailsEnabled, setPlacesDetailsEnabledState] = useState<boolean>(true)
  useEffect(() => { adminApi.getPlacesDetails().then(d => setPlacesDetailsEnabledState(d.enabled)).catch(() => {}) }, [])

  // Collab features
  const [collabFeatures, setCollabFeatures] = useState<{ chat: boolean; notes: boolean; polls: boolean; whatsnext: boolean }>({ chat: true, notes: true, polls: true, whatsnext: true })
  useEffect(() => { adminApi.getCollabFeatures().then(d => setCollabFeatures(d)).catch(() => {}) }, [])

  // Group welcome notice
  const [groupWelcome, setGroupWelcome] = useState<{ title: string; body: string; icon: string }>({ title: '', body: '', icon: 'Users' })
  const [savingGroupWelcome, setSavingGroupWelcome] = useState(false)
  useEffect(() => { adminApi.getGroupWelcomeNotice().then(d => setGroupWelcome(d)).catch(() => {}) }, [])

  // OIDC config
  const [oidcConfig, setOidcConfig] = useState<OidcConfig>({ issuer: '', client_id: '', client_secret: '', client_secret_set: false, display_name: '', discovery_url: '' })
  const [savingOidc, setSavingOidc] = useState<boolean>(false)

  // Auth toggles
  const [passwordLogin, setPasswordLogin] = useState<boolean>(true)
  const [passwordRegistration, setPasswordRegistration] = useState<boolean>(true)
  const [oidcLogin, setOidcLogin] = useState<boolean>(true)
  const [oidcRegistration, setOidcRegistration] = useState<boolean>(true)
  const [envOverrideOidcOnly, setEnvOverrideOidcOnly] = useState<boolean>(false)
  const [oidcConfigured, setOidcConfigured] = useState<boolean>(false)
  const [requireMfa, setRequireMfa] = useState<boolean>(false)

  // Invite links
  const [invites, setInvites] = useState<any[]>([])
  const [showCreateInvite, setShowCreateInvite] = useState<boolean>(false)
  const [inviteForm, setInviteForm] = useState<{ max_uses: number; expires_in_days: number | '' }>({ max_uses: 1, expires_in_days: 7 })

  // File types
  const [allowedFileTypes, setAllowedFileTypes] = useState<string>('jpg,jpeg,png,gif,webp,heic,pdf,doc,docx,xls,xlsx,txt,csv')
  const [savingFileTypes, setSavingFileTypes] = useState<boolean>(false)

  // Booking.com affiliate
  const [bookingAffiliateId, setBookingAffiliateId] = useState<string>('')
  const [savingBookingAffiliate, setSavingBookingAffiliate] = useState<boolean>(false)

  // Platform fee
  const [platformFee, setPlatformFee] = useState<string>('')
  const [savingPlatformFee, setSavingPlatformFee] = useState<boolean>(false)

  // Mollie fees
  const [mollieMethods, setMollieMethods] = useState<MollieMethod[]>([])
  const [savingMollie, setSavingMollie] = useState<boolean>(false)

  // Payouts
  const [payoutData, setPayoutData] = useState<any>(null)
  const [payoutsLoading, setPayoutsLoading] = useState(false)
  const [payoutForm, setPayoutForm] = useState<{ creatorId: number | ''; amount: string; description: string }>({ creatorId: '', amount: '', description: '' })
  const [savingPayout, setSavingPayout] = useState(false)

  // SMTP settings
  const [smtpValues, setSmtpValues] = useState<Record<string, string>>({})
  const [smtpLoaded, setSmtpLoaded] = useState(false)
  useEffect(() => {
    apiClient.get('/auth/app-settings').then(r => {
      setSmtpValues(r.data || {})
      setSmtpLoaded(true)
      if (r.data?.booking_affiliate_id) setBookingAffiliateId(r.data.booking_affiliate_id)
    }).catch(() => setSmtpLoaded(true))
  }, [])

  // Load platform fee
  useEffect(() => {
    adminApi.getPlatformFee().then(r => {
      setPlatformFee(r.platform_fee_percent != null ? String(r.platform_fee_percent) : '')
    }).catch(() => {})
  }, [])

  // Load Mollie fees when config tab is active
  useEffect(() => {
    if (activeTab === 'config') {
      adminApi.getMollieFees().then(d => setMollieMethods(d.methods || [])).catch(() => {})
    }
  }, [activeTab])

  // API Keys
  const [mapsKey, setMapsKey] = useState<string>('')
  const [weatherKey, setWeatherKey] = useState<string>('')
  const [unsplashKey, setUnsplashKey] = useState<string>('')
  const [savingUnsplashKey, setSavingUnsplashKey] = useState<boolean>(false)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [savingKeys, setSavingKeys] = useState<boolean>(false)
  const [validating, setValidating] = useState<Record<string, boolean>>({})
  const [validation, setValidation] = useState<Record<string, boolean | undefined>>({})

  // Version check & update
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false)

  const { user: currentUser, updateApiKeys, setAppRequireMfa, setTripRemindersEnabled, setPlacesPhotosEnabled, setPlacesAutocompleteEnabled, setPlacesDetailsEnabled, setUnsplashConfigured, logout } = useAuthStore()
  const navigate = useNavigate()
  const toast = useToast()

  const [showRotateJwtModal, setShowRotateJwtModal] = useState<boolean>(false)
  const [rotatingJwt, setRotatingJwt] = useState<boolean>(false)
  const [transferring, setTransferring] = useState<{ tripId: number; tripTitle: string } | null>(null)
  const [selectedNewOwner, setSelectedNewOwner] = useState<number | null>(null)

  useEffect(() => {
    loadData()
    loadAppConfig()
    loadApiKeys()
    adminApi.getOidc().then(setOidcConfig).catch(() => {})
    adminApi.checkVersion().then(data => {
      if (data.update_available) setUpdateInfo(data)
    }).catch(() => {})
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [usersData, statsData, invitesData, userStatsData] = await Promise.all([
        adminApi.users(),
        adminApi.stats(),
        adminApi.listInvites().catch(() => ({ invites: [] })),
        adminApi.usersTripStats().catch(() => ({ users: [] })),
      ])
      setUsers(usersData.users)
      setStats(statsData)
      setInvites(invitesData.invites || [])
      // Index user trip stats by user ID for quick lookup
      const statsMap: Record<number, any> = {}
      if (userStatsData.users) {
        userStatsData.users.forEach((u: any) => {
          statsMap[u.id] = u
        })
      }
      setUserTripStats(statsMap)
    } catch (err: unknown) {
      toast.error(t('admin.toast.loadError'))
    } finally {
      setIsLoading(false)
    }
  }

  const loadAppConfig = async () => {
    try {
      const config = await authApi.getAppConfig()
      setPasswordLogin(config.password_login ?? true)
      setPasswordRegistration(config.password_registration ?? config.allow_registration ?? true)
      setOidcLogin(config.oidc_login ?? true)
      setOidcRegistration(config.oidc_registration ?? config.allow_registration ?? true)
      setEnvOverrideOidcOnly(config.env_override_oidc_only ?? false)
      setOidcConfigured(config.oidc_configured ?? false)
      if (config.require_mfa !== undefined) setRequireMfa(!!config.require_mfa)
      if (config.allowed_file_types) setAllowedFileTypes(config.allowed_file_types)
    } catch (err: unknown) {
      // ignore
    }
  }

  const loadApiKeys = async () => {
    try {
      const data = await authApi.getSettings()
      setMapsKey(data.settings?.maps_api_key || '')
      setWeatherKey(data.settings?.openweather_api_key || '')
    } catch (err: unknown) {
      // ignore
    }
    try {
      const unsplash = await adminApi.getUnsplash()
      setUnsplashKey(unsplash.configured ? '••••••••' : '')
    } catch (err: unknown) {
      // ignore
    }
  }

  const handleToggleAuthSetting = async (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value)
    try {
      await authApi.updateAppSettings({ [key]: value })
    } catch (err: unknown) {
      setter(!value)
      toast.error(getApiErrorMessage(err, t('common.error')))
    }
  }

  const handleToggleRequireMfa = async (value: boolean) => {
    setRequireMfa(value)
    try {
      await authApi.updateAppSettings({ require_mfa: value })
      setAppRequireMfa(value)
      toast.success(t('common.saved'))
    } catch (err: unknown) {
      setRequireMfa(!value)
      toast.error(getApiErrorMessage(err, t('common.error')))
    }
  }

  const toggleKey = (key) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSaveApiKeys = async () => {
    setSavingKeys(true)
    try {
      await updateApiKeys({
        maps_api_key: mapsKey,
        openweather_api_key: weatherKey,
      })
      toast.success(t('admin.keySaved'))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSavingKeys(false)
    }
  }

  const handleValidateKeys = async () => {
    setValidating({ maps: true, weather: true })
    try {
      // Save first so validation uses the current values
      await updateApiKeys({ maps_api_key: mapsKey, openweather_api_key: weatherKey })
      const result = await authApi.validateKeys()
      setValidation(result)
    } catch (err: unknown) {
      toast.error(t('common.error'))
    } finally {
      setValidating({})
    }
  }

  const handleSaveUnsplashKey = async () => {
    setSavingUnsplashKey(true)
    try {
      const result = await adminApi.updateUnsplash(unsplashKey)
      setUnsplashConfigured(result.configured)
      toast.success(t('admin.keySaved'))
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('common.error')))
    } finally {
      setSavingUnsplashKey(false)
    }
  }

  const handleValidateKey = async (keyType) => {
    setValidating(prev => ({ ...prev, [keyType]: true }))
    try {
      // Save first so validation uses the current values
      await updateApiKeys({ maps_api_key: mapsKey, openweather_api_key: weatherKey })
      const result = await authApi.validateKeys()
      setValidation(prev => ({ ...prev, [keyType]: result[keyType] }))
    } catch (err: unknown) {
      toast.error(t('common.error'))
    } finally {
      setValidating(prev => ({ ...prev, [keyType]: false }))
    }
  }

  const handleCreateUser = async () => {
    if (!createForm.username.trim() || !createForm.email.trim()) {
      toast.error(t('admin.toast.fieldsRequired'))
      return
    }
    if (!createForm.send_welcome_email) {
      if (!createForm.password.trim()) {
        toast.error(t('admin.toast.fieldsRequired'))
        return
      }
      if (createForm.password.trim().length < 8) {
        toast.error(t('settings.passwordTooShort'))
        return
      }
    }
    try {
      const payload: Record<string, unknown> = {
        username: createForm.username,
        email: createForm.email,
        role: createForm.role,
        send_welcome_email: createForm.send_welcome_email,
      }
      if (!createForm.send_welcome_email) payload.password = createForm.password
      const data = await adminApi.createUser(payload)
      setUsers(prev => [data.user, ...prev])
      setShowCreateUser(false)
      setCreateForm({ username: '', email: '', password: '', role: 'user', send_welcome_email: false })
      toast.success(createForm.send_welcome_email ? t('admin.toast.userCreatedWithEmail') : t('admin.toast.userCreated'))
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('admin.toast.createError')))
    }
  }

  const handleCreateInvite = async () => {
    try {
      const data = await adminApi.createInvite({
        max_uses: inviteForm.max_uses,
        expires_in_days: inviteForm.expires_in_days || undefined,
      })
      setInvites(prev => [data.invite, ...prev])
      setShowCreateInvite(false)
      setInviteForm({ max_uses: 1, expires_in_days: 7 })
      // Copy link to clipboard
      const link = `${window.location.origin}/register?invite=${data.invite.token}`
      navigator.clipboard.writeText(link).then(() => toast.success(t('admin.invite.copied')))
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('admin.invite.createError')))
    }
  }

  const handleDeleteInvite = async (id: number) => {
    try {
      await adminApi.deleteInvite(id)
      setInvites(prev => prev.filter(i => i.id !== id))
      toast.success(t('admin.invite.deleted'))
    } catch {
      toast.error(t('admin.invite.deleteError'))
    }
  }

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/register?invite=${token}`
    navigator.clipboard.writeText(link).then(() => toast.success(t('admin.invite.copied')))
  }

  const handleEditUser = (user) => {
    setEditingUser(user)
    setEditForm({ username: user.username, email: user.email, role: user.role, password: '', creator_auto_approved: !!(user.creator_auto_approved), creator_fee_percent: user.creator_fee_percent != null ? String(user.creator_fee_percent) : '' })
  }

  const handleSaveUser = async () => {
    try {
      const payload: { username?: string; email?: string; role: string; password?: string; creator_auto_approved?: boolean; creator_fee_percent?: number | null } = {
        username: editForm.username.trim() || undefined,
        email: editForm.email.trim() || undefined,
        role: editForm.role,
        creator_auto_approved: editForm.role === 'creator' ? editForm.creator_auto_approved : undefined,
        creator_fee_percent: editForm.role === 'creator' && editForm.creator_fee_percent.trim() !== '' ? parseInt(editForm.creator_fee_percent.trim(), 10) : null,
      }
      if (editForm.password.trim()) {
        if (editForm.password.trim().length < 8) {
          toast.error(t('settings.passwordTooShort'))
          return
        }
        payload.password = editForm.password.trim()
      }
      const data = await adminApi.updateUser(editingUser.id, payload as any)
      setUsers(prev => prev.map(u => u.id === editingUser.id ? data.user : u))
      setEditingUser(null)
      toast.success(t('admin.toast.userUpdated'))
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('admin.toast.updateError')))
    }
  }

  const handleDeleteUser = async (user) => {
    if (user.id === currentUser?.id) {
      toast.error(t('admin.toast.cannotDeleteSelf'))
      return
    }
    if (!confirm(t('admin.deleteUser', { name: user.username }))) return
    try {
      await adminApi.deleteUser(user.id)
      setUsers(prev => prev.filter(u => u.id !== user.id))
      toast.success(t('admin.toast.userDeleted'))
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('admin.toast.deleteError')))
    }
  }

  const handleTransferTrip = async () => {
    if (!transferring || !selectedNewOwner) return
    try {
      await adminApi.transferTrip(transferring.tripId, selectedNewOwner)
      toast.success(t('admin.toast.tripTransferred'))
      loadData() // Reload user stats
      setTransferring(null)
      setSelectedNewOwner(null)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('admin.toast.transferError')))
    }
  }

  const loadPayouts = async () => {
    setPayoutsLoading(true)
    try {
      const data = await adminApi.getPayouts()
      setPayoutData(data)
    } catch {
      toast.error(t('admin.payouts.loadError') || 'Payouts laden mislukt')
    }
    setPayoutsLoading(false)
  }

  const handleRegisterPayout = async () => {
    if (!payoutForm.creatorId || !payoutForm.amount.trim()) return
    try {
      setSavingPayout(true)
      await adminApi.registerPayout({
        creator_user_id: Number(payoutForm.creatorId),
        amount_cents: Math.round(parseFloat(payoutForm.amount) * 100),
        description: payoutForm.description,
      })
      setPayoutForm({ creatorId: '', amount: '', description: '' })
      await loadPayouts()
      toast.success(t('admin.payouts.saved') || 'Payout geregistreerd')
    } catch {
      toast.error(t('admin.payouts.saveError') || 'Payout registreren mislukt')
    } finally {
      setSavingPayout(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-secondary)' }}>
      <Navbar />

      <div style={{ paddingTop: 'var(--nav-h)' }}>
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('admin.title')}</h1>
              <p className="text-slate-500 text-sm">{t('admin.subtitle')}</p>
            </div>
          </div>

          {/* Update Banner */}
          {updateInfo && (
            <div className="mb-6 p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-amber-500 dark:bg-amber-600">
                  <ArrowUpCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{t('admin.update.available')}</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    {t('admin.update.text').replace('{version}', `v${updateInfo.latest}`).replace('{current}', `v${updateInfo.current}`)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {updateInfo.release_url && (
                  <a
                    href={updateInfo.release_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t('admin.update.button')}
                  </a>
                )}
                <button
                  onClick={() => setShowUpdateModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-gray-200"
                >
                  <Download className="w-4 h-4" />
                  {t('admin.update.howTo')}
                </button>
              </div>
            </div>
          )}

          {/* Demo Baseline Button */}
          {demoMode && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-amber-900">Demo Baseline</p>
                <p className="text-xs text-amber-700">Save current state as the hourly reset point. All admin trips and settings will be preserved.</p>
              </div>
              <button
                onClick={async () => {
                  try {
                    await adminApi.saveDemoBaseline()
                    toast.success('Baseline saved! Resets will restore to this state.')
                  } catch (e) {
                    toast.error(e.response?.data?.error || 'Failed to save baseline')
                  }
                }}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 transition-colors flex-shrink-0 ml-4"
              >
                Save Baseline
              </button>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                { label: t('admin.stats.users'), value: stats.totalUsers, icon: Users },
                { label: t('admin.stats.trips'), value: stats.totalTrips, icon: Briefcase },
                { label: t('admin.stats.places'), value: stats.totalPlaces, icon: Map },
                { label: t('admin.stats.files'), value: stats.totalFiles || 0, icon: FileText },
              ].map(({ label, value, icon: Icon }) => (
                <AdminStatCard key={label} label={label} value={value} icon={Icon} />
              ))}
            </div>
          )}

          {/* Sidebar layout — nav on the left, active panel on the right */}
          <PageSidebar
            sidebarLabel={t('admin.title').toUpperCase()}
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            footer="admin · self-hosted"
          >
            {/* Tab content */}
          {activeTab === 'users' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">{t('admin.tabs.users')}</h2>
                  <p className="text-xs text-slate-400 mt-1">{users.length} {t('admin.stats.users')}</p>
                </div>
                <button
                  onClick={() => setShowCreateUser(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  {t('admin.createUser')}
                </button>
              </div>

              {isLoading ? (
                <div className="p-8 text-center">
                  <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin mx-auto"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50">
                        <th className="px-5 py-3 w-8"></th>
                        <th className="px-5 py-3">{t('admin.table.user')}</th>
                        <th className="px-5 py-3">{t('admin.table.email')}</th>
                        <th className="px-5 py-3">{t('admin.table.role')}</th>
                        <th className="px-5 py-3">{t('admin.table.created')}</th>
                        <th className="px-5 py-3">{t('admin.table.lastLogin')}</th>
                        <th className="px-5 py-3 text-center">Trips</th>
                        <th className="px-5 py-3 text-right">{t('admin.table.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 trek-stagger">
                      {users.map(u => {
                        const stats = userTripStats[u.id]
                        const isExpanded = expandedUserId === u.id
                        return (
                          <React.Fragment key={u.id}>
                            <tr className={`hover:bg-slate-50 transition-colors ${u.id === currentUser?.id ? 'bg-slate-50/60' : ''}`}>
                              <td className="px-5 py-3">
                                {stats?.trips && stats.trips.length > 0 && (
                                  <button
                                    onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                                    className="p-1 hover:bg-slate-200 rounded transition-colors"
                                    title={isExpanded ? 'Hide trips' : 'Show trips'}
                                  >
                                    <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  </button>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="relative">
                                    {u.avatar_url ? (
                                      <img src={u.avatar_url} alt={u.username} className="w-8 h-8 rounded-full object-cover" />
                                    ) : (
                                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-medium text-slate-700">
                                        {u.username.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2" style={{ borderColor: 'var(--bg-card)', background: u.online ? '#22c55e' : '#94a3b8' }} />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-slate-900">{u.username}</p>
                                    {u.id === currentUser?.id && (
                                      <span className="text-xs text-slate-500">{t('admin.you')}</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-sm text-slate-600">{u.email}</td>
                              <td className="px-5 py-3">
                                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${
                                  u.role === 'admin'
                                    ? 'bg-slate-900 text-white'
                                    : u.role === 'creator'
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {u.role === 'admin' && <Shield className="w-3 h-3" />}
                                  {u.role === 'admin' ? t('settings.roleAdmin') : u.role === 'creator' ? t('settings.roleCreator') : t('settings.roleUser')}
                                </span>
                                {u.role === 'creator' && u.creator_auto_approved ? (
                                  <span className="ml-1 text-xs text-green-600 font-medium">{t('admin.explore.autoApprovedBadge')}</span>
                                ) : null}
                              </td>
                              <td className="px-5 py-3 text-sm text-slate-500">
                                {new Date(u.created_at).toLocaleDateString(locale, { timeZone: serverTimezone })}
                              </td>
                              <td className="px-5 py-3 text-sm text-slate-500">
                                {u.last_login ? new Date(u.last_login).toLocaleDateString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12, timeZone: serverTimezone }) : '—'}
                              </td>
                              <td className="px-5 py-3 text-center">
                                <span className="inline-flex items-center justify-center px-3 py-1 text-xs font-semibold text-white bg-slate-500 rounded-full">
                                  {stats?.trip_count || 0}
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    onClick={() => handleEditUser(u)}
                                    className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                                    title={t('admin.editUser')}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteUser(u)}
                                    disabled={u.id === currentUser?.id}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={t('admin.deleteUserTitle')}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && stats?.trips && stats.trips.length > 0 && (
                              <tr className="bg-slate-50/50">
                                <td colSpan={8} className="px-5 py-4">
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-4 mb-4">
                                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                                        <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">Total Trips</p>
                                        <p className="text-2xl font-bold text-slate-900">{stats.trip_count}</p>
                                      </div>
                                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                                        <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">Total Days</p>
                                        <p className="text-2xl font-bold text-slate-900">{stats.total_days}</p>
                                      </div>
                                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                                        <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">Total Places</p>
                                        <p className="text-2xl font-bold text-slate-900">{stats.total_places}</p>
                                      </div>
                                    </div>
                                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                          <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                              <th className="px-4 py-2 text-left font-medium text-xs text-slate-600">Trip Title</th>
                                              <th className="px-4 py-2 text-left font-medium text-xs text-slate-600">Dates</th>
                                              <th className="px-4 py-2 text-center font-medium text-xs text-slate-600">Days</th>
                                              <th className="px-4 py-2 text-center font-medium text-xs text-slate-600">Places</th>
                                              <th className="px-4 py-2 text-center font-medium text-xs text-slate-600">Actions</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {stats.trips.map((trip: any) => (
                                              <tr key={trip.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-2 font-medium text-slate-900">{trip.title}</td>
                                                <td className="px-4 py-2 text-slate-600 text-xs">
                                                  {trip.start_date && trip.end_date
                                                    ? `${new Date(trip.start_date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: '2-digit' })} - ${new Date(trip.end_date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: '2-digit' })}`
                                                    : trip.start_date
                                                    ? new Date(trip.start_date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: '2-digit' })
                                                    : '—'}
                                                </td>
                                                <td className="px-4 py-2 text-center text-slate-600">{trip.day_count || 0}</td>
                                                <td className="px-4 py-2 text-center text-slate-600">{trip.place_count || 0}</td>
                                                <td className="px-4 py-2 text-center">
                                                  <button
                                                    onClick={() => setTransferring({ tripId: trip.id, tripTitle: trip.title })}
                                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                                                  >
                                                    Transfer
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Invite Links (inside users tab) */}
          {activeTab === 'users' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mt-6">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">{t('admin.invite.title')}</h2>
                  <p className="text-xs text-slate-400 mt-1">{t('admin.invite.subtitle')}</p>
                </div>
                <button
                  onClick={() => setShowCreateInvite(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('admin.invite.create')}
                </button>
              </div>

              {invites.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">{t('admin.invite.empty')}</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {invites.map(inv => {
                    const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date()
                    const isUsedUp = inv.max_uses > 0 && inv.used_count >= inv.max_uses
                    const isActive = !isExpired && !isUsedUp
                    return (
                      <div key={inv.id} className="px-5 py-3 flex items-center gap-4">
                        <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? 'var(--text-primary)' : '#d1d5db' }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono text-slate-600 truncate">{inv.token.slice(0, 12)}...</code>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                              isActive ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-400'
                            }`}>
                              {isUsedUp ? t('admin.invite.usedUp') : isExpired ? t('admin.invite.expired') : t('admin.invite.active')}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {inv.used_count}/{inv.max_uses === 0 ? '∞' : inv.max_uses} {t('admin.invite.uses')}
                            {inv.expires_at && ` · ${t('admin.invite.expiresAt')} ${new Date(inv.expires_at).toLocaleDateString(locale, { timeZone: serverTimezone })}`}
                            {` · ${t('admin.invite.createdBy')} ${inv.created_by_name}`}
                          </div>
                        </div>
                        {isActive && (
                          <button onClick={() => copyInviteLink(inv.token)} title={t('admin.invite.copyLink')}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleDeleteInvite(inv.id)} title={t('common.delete')}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'users' && <div className="mt-6"><PermissionsPanel /></div>}

          {/* Create Invite Modal */}
          <Modal isOpen={showCreateInvite} onClose={() => setShowCreateInvite(false)} title={t('admin.invite.create')} size="sm">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('admin.invite.maxUses')}</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 0].map(n => (
                    <button key={n} type="button" onClick={() => setInviteForm(f => ({ ...f, max_uses: n }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        inviteForm.max_uses === n ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}>
                      {n === 0 ? '∞' : `${n}×`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('admin.invite.expiry')}</label>
                <div className="flex gap-2">
                  {[
                    { value: 1, label: '1d' },
                    { value: 3, label: '3d' },
                    { value: 7, label: '7d' },
                    { value: 14, label: '14d' },
                    { value: '', label: '∞' },
                  ].map(opt => (
                    <button key={String(opt.value)} type="button" onClick={() => setInviteForm(f => ({ ...f, expires_in_days: opt.value as number | '' }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        inviteForm.expires_in_days === opt.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button onClick={() => setShowCreateInvite(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">{t('common.cancel')}</button>
                <button onClick={handleCreateInvite} className="px-4 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-700">{t('admin.invite.createAndCopy')}</button>
              </div>
            </div>
          </Modal>

          {activeTab === 'explore' && (
            <div>
              {/* Explore subtabs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-primary)', paddingBottom: 12 }}>
                <button
                  onClick={() => setExploreSubtab('submissions')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: exploreSubtab === 'submissions' ? 'var(--accent)' : 'transparent',
                    color: exploreSubtab === 'submissions' ? 'var(--accent-text)' : 'var(--text-muted)',
                    fontFamily: 'inherit',
                  }}
                >
                  Trip Submissions
                </button>
                <button
                  onClick={() => setExploreSubtab('creators')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: exploreSubtab === 'creators' ? 'var(--accent)' : 'transparent',
                    color: exploreSubtab === 'creators' ? 'var(--accent-text)' : 'var(--text-muted)',
                    fontFamily: 'inherit',
                  }}
                >
                  Creator Applications
                </button>
              </div>

              {exploreSubtab === 'submissions' && (
              <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{t('admin.explore.title')}</h2>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['pending', 'approved', 'rejected'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setSubmissionFilter(f)}
                      style={{
                        padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        background: submissionFilter === f ? 'var(--accent)' : 'var(--bg-secondary)',
                        color: submissionFilter === f ? 'var(--accent-text)' : 'var(--text-muted)',
                      }}
                    >
                      {f === 'pending' ? t('admin.explore.filterPending') : f === 'approved' ? t('admin.explore.filterApproved') : t('admin.explore.filterRejected')}
                    </button>
                  ))}
                </div>
              </div>

              {submissionsLoading ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-faint)' }}>{t('admin.explore.loading')}</div>
              ) : submissions.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                  {submissionFilter === 'pending' ? t('admin.explore.emptyPending') : submissionFilter === 'approved' ? t('admin.explore.emptyApproved') : t('admin.explore.emptyRejected')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {submissions.map(s => (
                    <div key={s.id} style={{
                      padding: 16, borderRadius: 12,
                      border: '1px solid var(--border-primary)',
                      background: 'var(--bg-card)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{s.title}</span>
                            <span style={{
                              fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                              background: s.status === 'pending' ? 'rgba(245,158,11,0.15)' : s.status === 'approved' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                              color: s.status === 'pending' ? '#d97706' : s.status === 'approved' ? '#059669' : '#dc2626',
                            }}>
                              {s.status === 'pending' ? t('explore.statusPending') : s.status === 'approved' ? t('explore.statusApproved') : t('explore.statusRejected')}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 2 }}>
                            {t('admin.explore.submittedBy')} <strong>{s.submitter_name}</strong> ({s.submitter_email})
                            {s.creator_auto_approved ? <span style={{ marginLeft: 6, fontSize: 10.5, color: '#059669', fontWeight: 600 }}>{t('admin.explore.autoApprovedBadge')}</span> : null}
                          </div>
                          {s.description && (
                            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.description}</p>
                          )}
                          <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 11, color: 'var(--text-faint)' }}>
                            <span>{s.price === 0 ? t('admin.explore.free') : `€${s.price}`}</span>
                            {s.community_enabled ? <span>{t('admin.explore.communityOn')}</span> : null}
                            <span>{s.day_count ?? 0}d · {s.place_count ?? 0}p</span>
                            <span>{t('admin.explore.submittedOn')}: {new Date(s.created_at).toLocaleDateString()}</span>
                          </div>
                          <button
                            onClick={() => setPreviewSubmission(s)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-primary)',
                              background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                            }}
                          >
                            <Eye size={12} /> {t('admin.explore.preview') || 'Preview'}
                          </button>
                        </div>

                        {s.status === 'pending' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <input
                                type="checkbox"
                                checked={autoApproveMap[s.id] ?? false}
                                onChange={e => setAutoApproveMap(m => ({ ...m, [s.id]: e.target.checked }))}
                              />
                              {t('admin.explore.autoApproveToggle')}
                            </label>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => handleApprove(s)}
                                disabled={approvingId === s.id}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none',
                                  background: 'rgba(16,185,129,0.12)', color: '#059669', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                                  opacity: approvingId === s.id ? 0.6 : 1,
                                }}
                              >
                                <CheckCircle size={13} /> {t('admin.explore.approve')}
                              </button>
                              <button
                                onClick={() => handleReject(s)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none',
                                  background: 'rgba(239,68,68,0.1)', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                                }}
                              >
                                <XCircle size={13} /> {t('admin.explore.reject')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
              )}

              {exploreSubtab === 'creators' && (
                <div>
                  <CreatorApplicationQueue />
                </div>
              )}
            </div>
          )}

          {activeTab === 'payouts' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{t('admin.payouts.title') || 'Creator payouts'}</h2>
                <button
                  onClick={loadPayouts}
                  disabled={payoutsLoading}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
                >
                  {payoutsLoading ? t('common.loading') : (t('common.refresh') || 'Ververs')}
                </button>
              </div>

              {/* Register payout form */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, padding: '12px 14px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                <select
                  value={payoutForm.creatorId}
                  onChange={e => setPayoutForm(f => ({ ...f, creatorId: e.target.value ? Number(e.target.value) : '' }))}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}
                >
                  <option value="">{t('admin.payouts.selectCreator') || 'Selecteer creator'}</option>
                  {(payoutData?.creators || []).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.username} ({c.email})</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={t('admin.payouts.amountPlaceholder') || 'Bedrag (€)'}
                  value={payoutForm.amount}
                  onChange={e => setPayoutForm(f => ({ ...f, amount: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}
                />
                <input
                  type="text"
                  placeholder={t('admin.payouts.descriptionPlaceholder') || 'Omschrijving (optioneel)'}
                  value={payoutForm.description}
                  onChange={e => setPayoutForm(f => ({ ...f, description: e.target.value }))}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}
                />
                <button
                  onClick={handleRegisterPayout}
                  disabled={savingPayout || !payoutForm.creatorId || !payoutForm.amount.trim()}
                  style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: savingPayout ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', opacity: savingPayout ? 0.7 : 1 }}
                >
                  {savingPayout ? t('common.saving') : (t('admin.payouts.register') || 'Registreer')}
                </button>
              </div>

              {/* Creators earnings table */}
              <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{t('admin.payouts.creators') || 'Creators'}</h3>
              {payoutsLoading && !payoutData ? (
                <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('common.loading')}</p>
              ) : (payoutData?.creators || []).length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('admin.payouts.noCreators') || 'Geen creators gevonden'}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(payoutData.creators || []).map((c: any) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.username}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{c.email}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('admin.payouts.sales') || 'Verkopen'}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{c.sales_count}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('admin.payouts.earned') || 'Verdiend'}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>€{(c.total_earned / 100).toFixed(2)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('admin.payouts.paid') || 'Uitbetaald'}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>€{(c.total_paid / 100).toFixed(2)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('admin.payouts.balance') || 'Openstaand'}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: ((c.total_earned - c.total_paid) > 0) ? '#d97706' : 'var(--text-faint)' }}>€{((c.total_earned - c.total_paid) / 100).toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Payout history */}
              <h3 style={{ margin: '20px 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{t('admin.payouts.history') || 'Uitbetalingsgeschiedenis'}</h3>
              {(payoutData?.payouts || []).length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('admin.payouts.noPayouts') || 'Nog geen payouts geregistreerd'}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(payoutData.payouts || []).map((p: any) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.creator_name}</span>
                        {p.description && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.description}</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>€{(p.amount_cents / 100).toFixed(2)}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{new Date(p.paid_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'config' && (
            <div className="space-y-6">
              {packingEnabled && <PackingTemplateManager />}
              <CategoryManager />
            </div>
          )}

          {activeTab === 'addons' && (
            <div className="space-y-6">
              <AddonManager bagTrackingEnabled={bagTrackingEnabled} onToggleBagTracking={async () => {
                const next = !bagTrackingEnabled
                setBagTrackingEnabled(next)
                try { await adminApi.updateBagTracking(next) } catch { setBagTrackingEnabled(!next) }
              }} collabFeatures={collabFeatures} onToggleCollabFeature={async (key: string) => {
                const next = { ...collabFeatures, [key]: !collabFeatures[key] }
                setCollabFeatures(next)
                try { await adminApi.updateCollabFeatures({ [key]: next[key] }) } catch { setCollabFeatures(collabFeatures) }
              }} />
            </div>
          )}

          {activeTab === 'groups' && (
            <div className="space-y-6">
              {/* Global group welcome message */}
              <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
                <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
                  <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Group welcome message</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Default message shown when someone joins a group via invite link. Group admins can override this per group.</p>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Title</label>
                    <input
                      type="text"
                      value={groupWelcome.title}
                      onChange={e => setGroupWelcome(g => ({ ...g, title: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                      placeholder="Welcome to the group!"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Body (markdown supported)</label>
                    <textarea
                      rows={4}
                      value={groupWelcome.body}
                      onChange={e => setGroupWelcome(g => ({ ...g, body: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border resize-y"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                      placeholder="You're now a member. Start exploring shared trips and availability together."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Icon (Lucide icon name)</label>
                    <input
                      type="text"
                      value={groupWelcome.icon}
                      onChange={e => setGroupWelcome(g => ({ ...g, icon: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                      placeholder="Users"
                    />
                  </div>
                  <button
                    disabled={savingGroupWelcome || !groupWelcome.title.trim() || !groupWelcome.body.trim()}
                    onClick={async () => {
                      setSavingGroupWelcome(true)
                      try {
                        const updated = await adminApi.updateGroupWelcomeNotice(groupWelcome)
                        setGroupWelcome(updated)
                        toast.success('Saved')
                      } catch {
                        toast.error('Failed to save')
                      } finally {
                        setSavingGroupWelcome(false)
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-opacity"
                    style={{ background: 'var(--accent)' }}
                  >
                    {savingGroupWelcome ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Authentication Methods */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">{t('admin.authMethods')}</h2>
                </div>
                <div className="p-6 space-y-5">
                  {envOverrideOidcOnly && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      {t('admin.envOverrideHint')}
                    </p>
                  )}
                  {/* Password Login */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{t('admin.passwordLogin')}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t('admin.passwordLoginHint')}</p>
                    </div>
                    <button
                      disabled={envOverrideOidcOnly || (!passwordLogin && !oidcLogin)}
                      onClick={() => handleToggleAuthSetting('password_login', !passwordLogin, setPasswordLogin)}
                      title={!passwordLogin && !oidcLogin ? t('admin.lockoutWarning') : undefined}
                      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
                      style={{ background: passwordLogin ? 'var(--text-primary)' : 'var(--border-primary)' }}
                    >
                      <span
                        className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
                        style={{ transform: passwordLogin ? 'translateX(20px)' : 'translateX(0)' }}
                      />
                    </button>
                  </div>
                  {/* Password Registration */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{t('admin.passwordRegistration')}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t('admin.passwordRegistrationHint')}</p>
                    </div>
                    <button
                      disabled={envOverrideOidcOnly}
                      onClick={() => handleToggleAuthSetting('password_registration', !passwordRegistration, setPasswordRegistration)}
                      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
                      style={{ background: passwordRegistration ? 'var(--text-primary)' : 'var(--border-primary)' }}
                    >
                      <span
                        className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
                        style={{ transform: passwordRegistration ? 'translateX(20px)' : 'translateX(0)' }}
                      />
                    </button>
                  </div>
                  {/* SSO Login (only when OIDC configured) */}
                  {oidcConfigured && (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{t('admin.oidcLogin')}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{t('admin.oidcLoginHint')}</p>
                      </div>
                      <button
                        disabled={!passwordLogin && oidcLogin}
                        onClick={() => handleToggleAuthSetting('oidc_login', !oidcLogin, setOidcLogin)}
                        title={!passwordLogin && oidcLogin ? t('admin.lockoutWarning') : undefined}
                        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
                        style={{ background: oidcLogin ? 'var(--text-primary)' : 'var(--border-primary)' }}
                      >
                        <span
                          className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
                          style={{ transform: oidcLogin ? 'translateX(20px)' : 'translateX(0)' }}
                        />
                      </button>
                    </div>
                  )}
                  {/* SSO Registration (only when OIDC configured) */}
                  {oidcConfigured && (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{t('admin.oidcRegistration')}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{t('admin.oidcRegistrationHint')}</p>
                      </div>
                      <button
                        onClick={() => handleToggleAuthSetting('oidc_registration', !oidcRegistration, setOidcRegistration)}
                        className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                        style={{ background: oidcRegistration ? 'var(--text-primary)' : 'var(--border-primary)' }}
                      >
                        <span
                          className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
                          style={{ transform: oidcRegistration ? 'translateX(20px)' : 'translateX(0)' }}
                        />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Require 2FA for all users */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">{t('admin.requireMfa')}</h2>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{t('admin.requireMfa')}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t('admin.requireMfaHint')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleRequireMfa(!requireMfa)}
                      className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                      style={{ background: requireMfa ? 'var(--text-primary)' : 'var(--border-primary)' }}
                    >
                      <span
                        className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
                        style={{ transform: requireMfa ? 'translateX(20px)' : 'translateX(0)' }}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Platform Fee */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">{t('admin.platformFee') || 'Platform fee'}</h2>
                  <p className="text-xs text-slate-400 mt-1">{t('admin.platformFeeHint') || 'Standaard percentage dat het platform inhoudt bij elke verkoop.'}</p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {t('admin.platformFeeLabel') || 'Fee percentage (%)'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={platformFee}
                        onChange={e => setPlatformFee(e.target.value)}
                        placeholder={t('admin.platformFeePlaceholder') || 'Bijv. 10'}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                      />
                    </div>
                    <button
                      onClick={async () => {
                        setSavingPlatformFee(true)
                        try {
                          const val = platformFee.trim() === '' ? null : parseInt(platformFee.trim(), 10)
                          await adminApi.setPlatformFee(val)
                          toast.success(t('common.saved'))
                        } catch {
                          toast.error(t('common.error'))
                        } finally {
                          setSavingPlatformFee(false)
                        }
                      }}
                      disabled={savingPlatformFee}
                      className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50"
                    >
                      {savingPlatformFee ? t('common.saving') : t('common.save')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Mollie Payment Methods */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">{t('admin.molliePaymentMethods') || 'Betalingskosten'}</h2>
                  <p className="text-xs text-slate-400 mt-1">{t('admin.molliePaymentMethodsHint') || 'Mollie transactiekosten per betaalmethode'}</p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="space-y-3">
                    {mollieMethods.length > 0 ? (
                      <>
                        <div className="text-xs font-medium text-slate-600 mb-2 grid grid-cols-12 gap-2">
                          <div className="col-span-4">{t('admin.mollieMethod') || 'Methode'}</div>
                          <div className="col-span-3">{t('admin.mollieFixedFee') || 'Vast bedrag'}</div>
                          <div className="col-span-3">{t('admin.molliePercentage') || 'Percentage'}</div>
                          <div className="col-span-2"></div>
                        </div>
                        {mollieMethods.map((method, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                            <input
                              type="text"
                              value={method.name}
                              onChange={e => {
                                const updated = [...mollieMethods]
                                updated[idx].name = e.target.value
                                setMollieMethods(updated)
                              }}
                              placeholder={t('admin.mollieMethodPlaceholder') || 'bijv. iDEAL'}
                              className="col-span-4 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                            />
                            <div className="col-span-3 flex items-center gap-1">
                              <span className="text-xs text-slate-500">€</span>
                              <input
                                type="number"
                                min="0"
                                value={method.fixed_cents}
                                onChange={e => {
                                  const updated = [...mollieMethods]
                                  updated[idx].fixed_cents = parseInt(e.target.value, 10) || 0
                                  setMollieMethods(updated)
                                }}
                                placeholder="29"
                                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                              />
                              <span className="text-xs text-slate-500">{(method.fixed_cents / 100).toFixed(2)}</span>
                            </div>
                            <div className="col-span-3 flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={method.variable_pct}
                                onChange={e => {
                                  const updated = [...mollieMethods]
                                  updated[idx].variable_pct = parseFloat(e.target.value) || 0
                                  setMollieMethods(updated)
                                }}
                                placeholder="1.8"
                                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                              />
                              <span className="text-xs text-slate-500">%</span>
                            </div>
                            <button
                              onClick={() => {
                                setMollieMethods(mollieMethods.filter((_, i) => i !== idx))
                              }}
                              className="col-span-2 px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium border border-red-200"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">{t('admin.noPaymentMethods') || 'Geen betalingsmethodes geconfigureerd'}</p>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setMollieMethods([...mollieMethods, { name: '', fixed_cents: 29, variable_pct: 1.8 }])
                    }}
                    className="w-full px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {t('admin.mollieAddMethod') || 'Methode toevoegen'}
                  </button>

                  <div className="text-xs text-slate-500 pt-2 border-t">
                    {t('explore.costsVia')} <a href="https://www.mollie.com/nl/pricing" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Mollie ↗</a>
                  </div>

                  <button
                    onClick={async () => {
                      setSavingMollie(true)
                      try {
                        await adminApi.setMollieFees(mollieMethods)
                        toast.success(t('common.saved'))
                      } catch {
                        toast.error(t('common.error'))
                      } finally {
                        setSavingMollie(false)
                      }
                    }}
                    disabled={savingMollie}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {savingMollie ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              </div>

              {/* Allowed File Types */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">{t('admin.fileTypes')}</h2>
                  <p className="text-xs text-slate-400 mt-1">{t('admin.fileTypesHint')}</p>
                </div>
                <div className="p-6">
                  <input
                    type="text"
                    value={allowedFileTypes}
                    onChange={e => setAllowedFileTypes(e.target.value)}
                    placeholder="jpg,png,pdf,doc,docx,xls,xlsx,txt,csv"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-400 mt-2">{t('admin.fileTypesFormat')}</p>
                  <button
                    onClick={async () => {
                      setSavingFileTypes(true)
                      try {
                        await authApi.updateAppSettings({ allowed_file_types: allowedFileTypes })
                        toast.success(t('admin.fileTypesSaved'))
                      } catch { toast.error(t('common.error')) }
                      finally { setSavingFileTypes(false) }
                    }}
                    disabled={savingFileTypes}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-700 disabled:bg-slate-400 mt-3"
                  >
                    {savingFileTypes ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                    {t('common.save')}
                  </button>
                </div>
              </div>

              {/* Affiliate Links */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">{t('admin.affiliateLinks')}</h2>
                  <p className="text-xs text-slate-400 mt-1">{t('admin.affiliateLinksHint')}</p>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('admin.bookingAffiliateId')}</label>
                    <input
                      type="text"
                      value={bookingAffiliateId}
                      onChange={e => setBookingAffiliateId(e.target.value)}
                      placeholder="e.g. 1234567"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                    />
                    <p className="text-xs text-slate-400 mt-1">{t('admin.bookingAffiliateIdHint')}</p>
                  </div>
                  <button
                    onClick={async () => {
                      setSavingBookingAffiliate(true)
                      try {
                        await authApi.updateAppSettings({ booking_affiliate_id: bookingAffiliateId })
                        await loadSettings()
                        toast.success(t('common.saved'))
                      } catch { toast.error(t('common.error')) }
                      finally { setSavingBookingAffiliate(false) }
                    }}
                    disabled={savingBookingAffiliate}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-700 disabled:bg-slate-400"
                  >
                    {savingBookingAffiliate ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                    {t('common.save')}
                  </button>
                </div>
              </div>

              {/* API Keys */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">{t('admin.apiKeys')}</h2>
                  <p className="text-xs text-slate-400 mt-1">{t('admin.apiKeysHint')}</p>
                </div>
                <div className="p-6 space-y-4">
                  {/* Google Maps Key */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                      {t('admin.mapsKey')}
                      <span className="text-[9px] font-medium px-1.5 py-px rounded-full bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200">{t('admin.recommended')}</span>
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKeys.maps ? 'text' : 'password'}
                          value={mapsKey}
                          onChange={e => setMapsKey(e.target.value)}
                          placeholder={t('settings.keyPlaceholder')}
                          className="w-full pr-10 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => toggleKey('maps')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showKeys.maps ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        onClick={() => handleValidateKey('maps')}
                        disabled={!mapsKey || validating.maps}
                        className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        {validating.maps ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : validation.maps === true ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                        ) : validation.maps === false ? (
                          <XCircle className="w-4 h-4 text-red-500" />
                        ) : null}
                        {t('admin.validateKey')}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{t('admin.mapsKeyHintLong')}</p>
                    {validation.maps === true && (
                      <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block"></span>
                        {t('admin.keyValid')}
                      </p>
                    )}
                    {validation.maps === false && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <span className="w-2 h-2 bg-red-500 rounded-full inline-block"></span>
                        {t('admin.keyInvalid')}
                      </p>
                    )}
                  </div>

                  {/* Unsplash API Key */}
                  <div className="pt-2 border-t border-slate-100">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                      Unsplash API Key
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKeys.unsplash ? 'text' : 'password'}
                          value={unsplashKey}
                          onChange={e => setUnsplashKey(e.target.value)}
                          placeholder={t('settings.keyPlaceholder')}
                          className="w-full pr-10 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => toggleKey('unsplash')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showKeys.unsplash ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        onClick={handleSaveUnsplashKey}
                        disabled={savingUnsplashKey}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-700 disabled:bg-slate-400"
                      >
                        {savingUnsplashKey ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                        {t('common.save')}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Used for automatic cover photo suggestions when creating a trip. Get a free key at unsplash.com/developers.</p>
                  </div>

                  {/* Place Photos Toggle */}
                  <div className="flex items-center justify-between gap-4 py-3 border-t border-slate-100">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{t('admin.placesPhotos.title')}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t('admin.placesPhotos.subtitle')}</p>
                    </div>
                    <button
                      onClick={async () => {
                        const next = !placesPhotosEnabled
                        setPlacesPhotosEnabledState(next)
                        setPlacesPhotosEnabled(next)
                        try { await adminApi.updatePlacesPhotos(next) } catch { setPlacesPhotosEnabledState(!next); setPlacesPhotosEnabled(!next) }
                      }}
                      className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                      style={{ background: placesPhotosEnabled ? 'var(--text-primary)' : 'var(--border-primary)' }}
                    >
                      <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200" style={{ transform: placesPhotosEnabled ? 'translateX(20px)' : 'translateX(0)' }} />
                    </button>
                  </div>

                  {/* Place Autocomplete Toggle */}
                  <div className="flex items-center justify-between gap-4 py-3 border-t border-slate-100">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{t('admin.placesAutocomplete.title')}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t('admin.placesAutocomplete.subtitle')}</p>
                    </div>
                    <button
                      onClick={async () => {
                        const next = !placesAutocompleteEnabled
                        setPlacesAutocompleteEnabledState(next)
                        setPlacesAutocompleteEnabled(next)
                        try { await adminApi.updatePlacesAutocomplete(next) } catch { setPlacesAutocompleteEnabledState(!next); setPlacesAutocompleteEnabled(!next) }
                      }}
                      className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                      style={{ background: placesAutocompleteEnabled ? 'var(--text-primary)' : 'var(--border-primary)' }}
                    >
                      <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200" style={{ transform: placesAutocompleteEnabled ? 'translateX(20px)' : 'translateX(0)' }} />
                    </button>
                  </div>

                  {/* Place Details Toggle */}
                  <div className="flex items-center justify-between gap-4 py-3 border-t border-slate-100">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{t('admin.placesDetails.title')}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t('admin.placesDetails.subtitle')}</p>
                    </div>
                    <button
                      onClick={async () => {
                        const next = !placesDetailsEnabled
                        setPlacesDetailsEnabledState(next)
                        setPlacesDetailsEnabled(next)
                        try { await adminApi.updatePlacesDetails(next) } catch { setPlacesDetailsEnabledState(!next); setPlacesDetailsEnabled(!next) }
                      }}
                      className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                      style={{ background: placesDetailsEnabled ? 'var(--text-primary)' : 'var(--border-primary)' }}
                    >
                      <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200" style={{ transform: placesDetailsEnabled ? 'translateX(20px)' : 'translateX(0)' }} />
                    </button>
                  </div>

                  {/* Open-Meteo Weather Info */}
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
                          <Sun className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">{t('admin.weather.title')}</span>
                      </div>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200">{t('admin.weather.badge')}</span>
                    </div>
                    <div className="px-4 pb-3">
                      <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">{t('admin.weather.description')}</p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5 leading-relaxed">{t('admin.weather.locationHint')}</p>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="rounded-md bg-white dark:bg-emerald-900/40 px-3 py-2 border border-emerald-100 dark:border-emerald-800">
                          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">{t('admin.weather.forecast')}</p>
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">{t('admin.weather.forecastDesc')}</p>
                        </div>
                        <div className="rounded-md bg-white dark:bg-emerald-900/40 px-3 py-2 border border-emerald-100 dark:border-emerald-800">
                          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">{t('admin.weather.climate')}</p>
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">{t('admin.weather.climateDesc')}</p>
                        </div>
                        <div className="rounded-md bg-white dark:bg-emerald-900/40 px-3 py-2 border border-emerald-100 dark:border-emerald-800">
                          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">{t('admin.weather.requests')}</p>
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">{t('admin.weather.requestsDesc')}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveApiKeys}
                    disabled={savingKeys}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-700 disabled:bg-slate-400"
                  >
                    {savingKeys ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                    {t('common.save')}
                  </button>
                </div>
              </div>

              {/* OIDC / SSO Configuration */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">{t('admin.oidcTitle')}</h2>
                  <p className="text-xs text-slate-400 mt-1">{t('admin.oidcSubtitle')}</p>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('admin.oidcDisplayName')}</label>
                    <input
                      type="text"
                      value={oidcConfig.display_name}
                      onChange={e => setOidcConfig(c => ({ ...c, display_name: e.target.value }))}
                      placeholder='z.B. Google, Authentik, Keycloak'
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('admin.oidcIssuer')}</label>
                    <input
                      type="url"
                      value={oidcConfig.issuer}
                      onChange={e => setOidcConfig(c => ({ ...c, issuer: e.target.value }))}
                      placeholder='https://accounts.google.com'
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                    />
                    <p className="text-xs text-slate-400 mt-1">{t('admin.oidcIssuerHint')}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Discovery URL <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input
                      type="url"
                      value={oidcConfig.discovery_url}
                      onChange={e => setOidcConfig(c => ({ ...c, discovery_url: e.target.value }))}
                      placeholder='https://auth.example.com/application/o/trek/.well-known/openid-configuration'
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                    />
                    <p className="text-xs text-slate-400 mt-1">Override the auto-constructed discovery URL. Required for providers like Authentik where the endpoint is not at <code className="bg-slate-100 px-1 rounded">{'<issuer>/.well-known/openid-configuration'}</code>.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Client ID</label>
                    <input
                      type="text"
                      value={oidcConfig.client_id}
                      onChange={e => setOidcConfig(c => ({ ...c, client_id: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Client Secret</label>
                    <input
                      type="password"
                      value={oidcConfig.client_secret}
                      onChange={e => setOidcConfig(c => ({ ...c, client_secret: e.target.value }))}
                      placeholder={oidcConfig.client_secret_set ? '••••••••' : ''}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      setSavingOidc(true)
                      try {
                        const payload: Record<string, unknown> = { issuer: oidcConfig.issuer, client_id: oidcConfig.client_id, display_name: oidcConfig.display_name, discovery_url: oidcConfig.discovery_url }
                        if (oidcConfig.client_secret) payload.client_secret = oidcConfig.client_secret
                        await adminApi.updateOidc(payload)
                        toast.success(t('admin.oidcSaved'))
                      } catch (err: unknown) {
                        toast.error(getApiErrorMessage(err, t('common.error')))
                      } finally {
                        setSavingOidc(false)
                      }
                    }}
                    disabled={savingOidc}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-700 disabled:bg-slate-400"
                  >
                    {savingOidc ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                    {t('common.save')}
                  </button>
                </div>
              </div>
              {/* Danger Zone */}
              <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-red-100 bg-red-50">
                  <h2 className="font-semibold text-red-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Danger Zone
                  </h2>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Rotate JWT Secret</p>
                      <p className="text-xs text-slate-400 mt-0.5">Generate a new JWT signing secret. All active sessions will be invalidated immediately.</p>
                    </div>
                    <button
                      onClick={() => setShowRotateJwtModal(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Rotate
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (() => {
            // Derive active channels from smtpValues.notification_channels (plural)
            // with fallback to notification_channel (singular) for existing installs
            const rawChannels = smtpValues.notification_channels ?? smtpValues.notification_channel ?? 'none'
            const activeChans = rawChannels === 'none' ? [] : rawChannels.split(',').map((c: string) => c.trim())
            const emailActive = activeChans.includes('email')
            const webhookActive = activeChans.includes('webhook')
            const ntfyActive = activeChans.includes('ntfy')
            const tripRemindersActive = smtpValues.notify_trip_reminder !== 'false'

            const setChannels = async (email: boolean, webhook: boolean, ntfy: boolean) => {
              const chans = [email && 'email', webhook && 'webhook', ntfy && 'ntfy'].filter(Boolean).join(',') || 'none'
              setSmtpValues(prev => ({ ...prev, notification_channels: chans }))
              try {
                await authApi.updateAppSettings({ notification_channels: chans })
              } catch {
                // Revert state on failure
                const reverted = [emailActive && 'email', webhookActive && 'webhook', ntfyActive && 'ntfy'].filter(Boolean).join(',') || 'none'
                setSmtpValues(prev => ({ ...prev, notification_channels: reverted }))
                toast.error(t('common.error'))
              }
            }

            const smtpConfigured = !!(smtpValues.smtp_host?.trim())
            const saveNotifications = async () => {
              // Saves credentials only — channel activation is auto-saved by the toggle
              const notifKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_skip_tls_verify']
              const payload: Record<string, string> = {}
              for (const k of notifKeys) { if (smtpValues[k] !== undefined) payload[k] = smtpValues[k] }
              try {
                await authApi.updateAppSettings(payload)
                toast.success(t('admin.notifications.saved'))
                authApi.getAppConfig().then((c: { trip_reminders_enabled?: boolean }) => {
                  if (c?.trip_reminders_enabled !== undefined) setTripRemindersEnabled(c.trip_reminders_enabled)
                }).catch(() => {})
              } catch { toast.error(t('common.error')) }
            }

            return (<>
              <div className="space-y-4">
                {/* Email Panel */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-900">{t('admin.notifications.emailPanel.title')}</h2>
                      <p className="text-xs text-slate-400 mt-1">{t('admin.smtp.hint')}</p>
                    </div>
                    <button
                      onClick={() => setChannels(!emailActive, webhookActive, ntfyActive)}
                      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
                      style={{ background: emailActive ? 'var(--text-primary)' : 'var(--border-primary)' }}
                    >
                      <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
                        style={{ transform: emailActive ? 'translateX(20px)' : 'translateX(0)' }} />
                    </button>
                  </div>
                  <div className={`p-6 space-y-3 ${!emailActive ? 'opacity-50 pointer-events-none' : ''}`}>
                    {smtpLoaded && [
                      { key: 'smtp_host', label: 'SMTP Host', placeholder: 'mail.example.com' },
                      { key: 'smtp_port', label: 'SMTP Port', placeholder: '587' },
                      { key: 'smtp_user', label: 'SMTP User', placeholder: 'trek@example.com' },
                      { key: 'smtp_pass', label: 'SMTP Password', placeholder: '••••••••', type: 'password' },
                      { key: 'smtp_from', label: 'From Address', placeholder: 'trek@example.com' },
                    ].map(field => (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-500 mb-1">{field.label}</label>
                        <input
                          type={field.type || 'text'}
                          value={smtpValues[field.key] || ''}
                          onChange={e => setSmtpValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                        />
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                      <div>
                        <span className="text-xs font-medium text-slate-500">Skip TLS certificate check</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">Enable for self-signed certificates on local mail servers</p>
                      </div>
                      <button onClick={() => {
                        const newVal = smtpValues.smtp_skip_tls_verify === 'true' ? 'false' : 'true'
                        setSmtpValues(prev => ({ ...prev, smtp_skip_tls_verify: newVal }))
                      }}
                        className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                        style={{ background: smtpValues.smtp_skip_tls_verify === 'true' ? 'var(--text-primary)' : 'var(--border-primary)' }}>
                        <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
                          style={{ transform: smtpValues.smtp_skip_tls_verify === 'true' ? 'translateX(20px)' : 'translateX(0)' }} />
                      </button>
                    </div>
                  </div>
                  <div className="px-6 pb-4 flex items-center gap-2 border-t border-slate-100 pt-4">
                    <button onClick={saveNotifications}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
                      <Save className="w-4 h-4" />{t('common.save')}
                    </button>
                    <button
                      onClick={async () => {
                        const smtpKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_skip_tls_verify']
                        const payload: Record<string, string> = {}
                        for (const k of smtpKeys) { if (smtpValues[k] !== undefined) payload[k] = smtpValues[k] }
                        await authApi.updateAppSettings(payload).catch(() => {})
                        try {
                          const result = await notificationsApi.testSmtp()
                          if (result.success) toast.success(t('admin.smtp.testSuccess'))
                          else toast.error(result.error || t('admin.smtp.testFailed'))
                        } catch { toast.error(t('admin.smtp.testFailed')) }
                      }}
                      disabled={!smtpConfigured}
                      className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-40"
                    >
                      {t('admin.smtp.testButton')}
                    </button>
                  </div>
                </div>

                {/* Webhook Panel */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-900">{t('admin.notifications.webhookPanel.title')}</h2>
                      <p className="text-xs text-slate-400 mt-1">{t('admin.webhook.hint')}</p>
                    </div>
                    <button
                      onClick={() => setChannels(emailActive, !webhookActive, ntfyActive)}
                      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
                      style={{ background: webhookActive ? 'var(--text-primary)' : 'var(--border-primary)' }}
                    >
                      <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
                        style={{ transform: webhookActive ? 'translateX(20px)' : 'translateX(0)' }} />
                    </button>
                  </div>
                </div>

                {/* Ntfy Panel */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-900">{t('admin.notifications.ntfy')}</h2>
                      <p className="text-xs text-slate-400 mt-1">{t('admin.ntfy.hint') || 'Allow users to configure their own ntfy topics for push notifications.'}</p>
                    </div>
                    <button
                      onClick={() => setChannels(emailActive, webhookActive, !ntfyActive)}
                      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
                      style={{ background: ntfyActive ? 'var(--text-primary)' : 'var(--border-primary)' }}
                    >
                      <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
                        style={{ transform: ntfyActive ? 'translateX(20px)' : 'translateX(0)' }} />
                    </button>
                  </div>
                </div>

                {/* In-App Panel */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-900">{t('admin.notifications.inappPanel.title')}</h2>
                      <p className="text-xs text-slate-400 mt-1">{t('admin.notifications.inappPanel.hint')}</p>
                    </div>
                    <div className="relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0"
                      style={{ background: 'var(--text-primary)', opacity: 0.5, cursor: 'not-allowed' }}>
                      <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
                        style={{ transform: 'translateX(20px)' }} />
                    </div>
                  </div>
                </div>

                {/* Trip Reminders Toggle */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-900">{t('admin.notifications.tripReminders.title')}</h2>
                      <p className="text-xs text-slate-400 mt-1">{t('admin.notifications.tripReminders.hint')}</p>
                    </div>
                    <button
                      onClick={async () => {
                        const next = !tripRemindersActive
                        setSmtpValues(prev => ({ ...prev, notify_trip_reminder: next ? 'true' : 'false' }))
                        try {
                          await authApi.updateAppSettings({ notify_trip_reminder: next ? 'true' : 'false' })
                          toast.success(next ? t('admin.notifications.tripReminders.enabled') : t('admin.notifications.tripReminders.disabled'))
                          authApi.getAppConfig().then((c: { trip_reminders_enabled?: boolean }) => {
                            if (c?.trip_reminders_enabled !== undefined) setTripRemindersEnabled(c.trip_reminders_enabled)
                          }).catch(() => {})
                        } catch {
                          setSmtpValues(prev => ({ ...prev, notify_trip_reminder: tripRemindersActive ? 'true' : 'false' }))
                          toast.error(t('common.error'))
                        }
                      }}
                      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
                      style={{ background: tripRemindersActive ? 'var(--text-primary)' : 'var(--border-primary)' }}
                    >
                      <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
                        style={{ transform: tripRemindersActive ? 'translateX(20px)' : 'translateX(0)' }} />
                    </button>
                  </div>
                </div>

                {/* Admin Webhook Panel */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-900">{t('admin.notifications.adminWebhookPanel.title')}</h2>
                    <p className="text-xs text-slate-400 mt-1">{t('admin.notifications.adminWebhookPanel.hint')}</p>
                  </div>
                  <div className="p-6 space-y-3">
                    {smtpLoaded && (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">{t('admin.notifications.adminWebhookPanel.title')}</label>
                        <input
                          type="text"
                          value={smtpValues.admin_webhook_url === '••••••••' ? '' : smtpValues.admin_webhook_url || ''}
                          onChange={e => setSmtpValues(prev => ({ ...prev, admin_webhook_url: e.target.value }))}
                          placeholder={smtpValues.admin_webhook_url === '••••••••' ? '••••••••' : 'https://discord.com/api/webhooks/...'}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                        />
                      </div>
                    )}
                  </div>
                  <div className="px-6 pb-4 flex items-center gap-2 border-t border-slate-100 pt-4">
                    <button
                      onClick={async () => {
                        try {
                          await authApi.updateAppSettings({ admin_webhook_url: smtpValues.admin_webhook_url || '' })
                          toast.success(t('admin.notifications.adminWebhookPanel.saved'))
                        } catch { toast.error(t('common.error')) }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
                      <Save className="w-4 h-4" />{t('common.save')}
                    </button>
                    <button
                      onClick={async () => {
                        const url = smtpValues.admin_webhook_url === '••••••••' ? undefined : smtpValues.admin_webhook_url
                        if (!url && smtpValues.admin_webhook_url !== '••••••••') return
                        try {
                          if (url) await authApi.updateAppSettings({ admin_webhook_url: url }).catch(() => {})
                          const result = await notificationsApi.testWebhook(url)
                          if (result.success) toast.success(t('admin.notifications.adminWebhookPanel.testSuccess'))
                          else toast.error(result.error || t('admin.notifications.adminWebhookPanel.testFailed'))
                        } catch { toast.error(t('admin.notifications.adminWebhookPanel.testFailed')) }
                      }}
                      disabled={!smtpValues.admin_webhook_url?.trim()}
                      className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-40"
                    >
                      {t('admin.notifications.testWebhook')}
                    </button>
                  </div>
                </div>

                {/* Admin Ntfy Panel */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-900">{t('admin.notifications.adminNtfyPanel.title')}</h2>
                    <p className="text-xs text-slate-400 mt-1">{t('admin.notifications.adminNtfyPanel.hint')}</p>
                  </div>
                  <div className="p-6 space-y-3">
                    {smtpLoaded && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">{t('admin.notifications.adminNtfyPanel.serverLabel')}</label>
                          <input
                            type="text"
                            value={smtpValues.admin_ntfy_server || ''}
                            onChange={e => setSmtpValues(prev => ({ ...prev, admin_ntfy_server: e.target.value }))}
                            placeholder={t('admin.notifications.adminNtfyPanel.serverPlaceholder')}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                          />
                          <p className="text-xs text-slate-400 mt-1">{t('admin.notifications.adminNtfyPanel.serverHint')}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">{t('admin.notifications.adminNtfyPanel.topicLabel')}</label>
                          <input
                            type="text"
                            value={smtpValues.admin_ntfy_topic || ''}
                            onChange={e => setSmtpValues(prev => ({ ...prev, admin_ntfy_topic: e.target.value }))}
                            placeholder={t('admin.notifications.adminNtfyPanel.topicPlaceholder')}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">{t('admin.notifications.adminNtfyPanel.tokenLabel')}</label>
                          <div className="flex gap-2">
                            <input
                              type="password"
                              value={smtpValues.admin_ntfy_token === '••••••••' ? '' : smtpValues.admin_ntfy_token || ''}
                              onChange={e => setSmtpValues(prev => ({ ...prev, admin_ntfy_token: e.target.value }))}
                              placeholder={smtpValues.admin_ntfy_token === '••••••••' ? '••••••••' : ''}
                              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                            />
                            {smtpValues.admin_ntfy_token === '••••••••' && (
                              <button
                                onClick={async () => {
                                  try {
                                    await authApi.updateAppSettings({ admin_ntfy_token: '' })
                                    setSmtpValues(prev => ({ ...prev, admin_ntfy_token: '' }))
                                    toast.success(t('admin.notifications.adminNtfyPanel.tokenCleared'))
                                  } catch { toast.error(t('common.error')) }
                                }}
                                className="px-3 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
                              >
                                {t('common.clear')}
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="px-6 pb-4 flex items-center gap-2 border-t border-slate-100 pt-4">
                    <button
                      onClick={async () => {
                        try {
                          await authApi.updateAppSettings({
                            admin_ntfy_server: smtpValues.admin_ntfy_server || '',
                            admin_ntfy_topic: smtpValues.admin_ntfy_topic || '',
                            ...(smtpValues.admin_ntfy_token && smtpValues.admin_ntfy_token !== '••••••••'
                              ? { admin_ntfy_token: smtpValues.admin_ntfy_token }
                              : {}),
                          })
                          toast.success(t('admin.notifications.adminNtfyPanel.saved'))
                        } catch { toast.error(t('common.error')) }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
                      <Save className="w-4 h-4" />{t('common.save')}
                    </button>
                    <button
                      onClick={async () => {
                        const topic = smtpValues.admin_ntfy_topic?.trim()
                        if (!topic) return
                        try {
                          const token = smtpValues.admin_ntfy_token && smtpValues.admin_ntfy_token !== '••••••••'
                            ? smtpValues.admin_ntfy_token : null
                          const result = await notificationsApi.testNtfy({
                            topic,
                            server: smtpValues.admin_ntfy_server || null,
                            token,
                          })
                          if (result.success) toast.success(t('admin.notifications.adminNtfyPanel.testSuccess'))
                          else toast.error(result.error || t('admin.notifications.adminNtfyPanel.testFailed'))
                        } catch { toast.error(t('admin.notifications.adminNtfyPanel.testFailed')) }
                      }}
                      disabled={!smtpValues.admin_ntfy_topic?.trim()}
                      className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-40"
                    >
                      {t('admin.notifications.adminNtfyPanel.test')}
                    </button>
                  </div>
                </div>

              </div>
              <div className="mt-6">
                <AdminNotificationsPanel t={t} toast={toast} />
              </div>
            </>)
          })()}

          {activeTab === 'branding' && <BrandingPanel />}

          {activeTab === 'backup' && <BackupPanel />}

          {activeTab === 'audit' && <AuditLogPanel serverTimezone={serverTimezone} />}

          {activeTab === 'gdpr' && <GdprAdminPanel />}

          {activeTab === 'mcp-tokens' && <AdminMcpTokensPanel />}

          {activeTab === 'github' && <GitHubPanel isPrerelease={updateInfo?.is_prerelease ?? false} />}

          {activeTab === 'defaults' && <DefaultUserSettingsTab />}

          {activeTab === 'dev-notifications' && <DevNotificationsPanel />}
          </PageSidebar>
        </div>
      </div>

      {/* Create user modal */}
      <Modal
        isOpen={showCreateUser}
        onClose={() => setShowCreateUser(false)}
        title={t('admin.createUser')}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowCreateUser(false)}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleCreateUser}
              className="px-4 py-2 text-sm bg-slate-900 hover:bg-slate-700 text-white rounded-lg"
            >
              {t('admin.createUser')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.username')} *</label>
            <input
              type="text"
              value={createForm.username}
              onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))}
              placeholder={t('settings.username')}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-slate-400 focus:border-transparent text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('common.email')} *</label>
            <input
              type="email"
              value={createForm.email}
              onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
              placeholder={t('common.email')}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-slate-400 focus:border-transparent text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={createForm.send_welcome_email}
                onChange={e => setCreateForm(f => ({ ...f, send_welcome_email: e.target.checked, password: '' }))}
                className="w-4 h-4 rounded border-slate-300 text-slate-900"
              />
              <span className="text-sm font-medium text-slate-700">{t('admin.sendWelcomeEmail')}</span>
            </label>
            {createForm.send_welcome_email && (
              <p className="mt-1.5 text-xs text-slate-500">{t('admin.sendWelcomeEmailHint')}</p>
            )}
          </div>
          {!createForm.send_welcome_email && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('common.password')} *</label>
              <input
                type="password"
                value={createForm.password}
                onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                placeholder={t('common.password')}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-slate-400 focus:border-transparent text-sm"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.role')}</label>
            <CustomSelect
              value={createForm.role}
              onChange={value => setCreateForm(f => ({ ...f, role: value }))}
              options={[
                { value: 'user', label: t('settings.roleUser') },
                { value: 'creator', label: t('settings.roleCreator') },
                { value: 'admin', label: t('settings.roleAdmin') },
              ]}
            />
          </div>
        </div>
      </Modal>

      {/* Edit user modal */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={t('admin.editUser')}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setEditingUser(null)}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSaveUser}
              className="px-4 py-2 text-sm bg-slate-900 hover:bg-slate-700 text-white rounded-lg"
            >
              {t('common.save')}
            </button>
          </div>
        }
      >
        {editingUser && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.username')}</label>
              <input
                type="text"
                value={editForm.username}
                onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-slate-400 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('common.email')}</label>
              <input
                type="email"
                value={editForm.email}
                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-slate-400 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('admin.newPassword')} <span className="text-slate-400 font-normal">({t('admin.newPasswordHint')})</span></label>
              <input
                type="password"
                value={editForm.password}
                onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                placeholder={t('admin.newPasswordPlaceholder')}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-slate-400 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.role')}</label>
              <CustomSelect
                value={editForm.role}
                onChange={value => setEditForm(f => ({ ...f, role: value }))}
                options={[
                  { value: 'user', label: t('settings.roleUser') },
                  { value: 'creator', label: t('settings.roleCreator') },
                  { value: 'admin', label: t('settings.roleAdmin') },
                ]}
              />
            </div>
            {editForm.role === 'creator' && (
              <>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editForm.creator_auto_approved}
                      onChange={e => setEditForm(f => ({ ...f, creator_auto_approved: e.target.checked }))}
                    />
                    {t('admin.creatorAutoApprove')}
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('admin.creatorFeePercent') || 'Platform fee (%)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder={t('admin.creatorFeePercentPlaceholder') || 'Leeg = standaard fee'}
                    value={editForm.creator_fee_percent}
                    onChange={e => setEditForm(f => ({ ...f, creator_fee_percent: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-400 mt-1">{t('admin.creatorFeePercentHint') || 'Percentage dat het platform inhoudt per verkoop. Leeg = gebruik standaard fee.'}</p>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Update instructions popup */}
      {showUpdateModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowUpdateModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 440, borderRadius: 16, overflow: 'hidden' }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
          >
            <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ArrowUpCircle size={20} style={{ color: 'white' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'white' }}>{t('admin.update.howTo')}</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                  v{updateInfo?.current} → v{updateInfo?.latest}
                </p>
              </div>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <p className="text-gray-700 dark:text-gray-300" style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                {t('admin.update.dockerText').replace('{version}', `v${updateInfo?.latest ?? ''}`)}
              </p>

              <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.8, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                className="bg-gray-900 dark:bg-gray-950 text-gray-100 border border-gray-700"
              >
{`docker pull mauriceboe/trek:latest
docker stop trek && docker rm trek
docker run -d --name trek \\
  -p 3000:3000 \\
  -v /opt/trek/data:/app/data \\
  -v /opt/trek/uploads:/app/uploads \\
  --restart unless-stopped \\
  mauriceboe/trek:latest`}
              </div>

              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, fontSize: 12, lineHeight: 1.5 }}
                className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
              >
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{t('admin.update.dataInfo')}</span>
                </div>
              </div>

              {updateInfo?.release_url && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, fontSize: 12, lineHeight: 1.5 }}
                  className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                >
                  <div className="flex items-start gap-2">
                    <ExternalLink className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>
                      <a href={updateInfo.release_url} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                        {t('admin.update.button')}
                      </a>
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '0 24px 20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowUpdateModal(false)}
                className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-gray-200"
                style={{ padding: '9px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rotate JWT Secret confirmation modal */}
      <Modal
        isOpen={showRotateJwtModal}
        onClose={() => setShowRotateJwtModal(false)}
        title="Rotate JWT Secret"
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowRotateJwtModal(false)}
              disabled={rotatingJwt}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={async () => {
                setRotatingJwt(true)
                try {
                  await adminApi.rotateJwtSecret()
                  setShowRotateJwtModal(false)
                  logout()
                  navigate('/login', { state: { noRedirect: true } })
                } catch {
                  toast.error(t('common.error'))
                  setRotatingJwt(false)
                }
              }}
              disabled={rotatingJwt}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg font-medium"
            >
              {rotatingJwt ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Rotate &amp; Log out
            </button>
          </div>
        }
      >
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900 mb-1">Warning, this will invalidate all sessions and log you out.</p>
            <p className="text-xs text-slate-500">A new JWT secret will be generated immediately. Every logged-in user — including you — will be signed out and will need to log in again.</p>
          </div>
        </div>
      </Modal>

      {/* Explore Submission Preview Modal */}
      {previewSubmission && (
        <div onClick={() => setPreviewSubmission(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-primary)', borderRadius: 16, overflow: 'hidden', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            {previewSubmission.cover_image && (
              <div style={{ width: '100%', height: 200, background: '#f3f4f6', backgroundImage: `url(${previewSubmission.cover_image})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            )}
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{previewSubmission.title}</h2>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>
                    {t('admin.explore.submittedBy')} <strong>{previewSubmission.submitter_name}</strong> ({previewSubmission.submitter_email})
                  </div>
                </div>
                <button onClick={() => setPreviewSubmission(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-faint)', padding: 0 }}>×</button>
              </div>

              {previewSubmission.description && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 12px' }}>{previewSubmission.description}</p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('admin.explore.price') || 'Price'}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{previewSubmission.price === 0 ? t('admin.explore.free') : `€${previewSubmission.price}`}</div>
                </div>
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('admin.explore.community') || 'Community'}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{previewSubmission.community_enabled ? 'Enabled' : 'Disabled'}</div>
                </div>
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('dashboard.days') || 'Days'}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{previewSubmission.day_count ?? 0}</div>
                </div>
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('dashboard.places') || 'Places'}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{previewSubmission.place_count ?? 0}</div>
                </div>
              </div>

              {(previewSubmission.start_date || previewSubmission.end_date) && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  {previewSubmission.start_date && new Date(previewSubmission.start_date).toLocaleDateString()} {previewSubmission.end_date ? '— ' + new Date(previewSubmission.end_date).toLocaleDateString() : ''}
                </div>
              )}

              {previewSubmission.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setPreviewSubmission(null); handleReject(previewSubmission) }}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
                  >
                    {t('admin.explore.reject')}
                  </button>
                  <button
                    onClick={() => { setPreviewSubmission(null); handleApprove(previewSubmission) }}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,0.12)', color: '#059669', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
                  >
                    {t('admin.explore.approve')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transfer Trip Modal */}
      {transferring && (
        <Modal
          isOpen={true}
          onClose={() => { setTransferring(null); setSelectedNewOwner(null) }}
          title={`Transfer Trip: ${transferring.tripTitle}`}
          size="sm"
          footer={
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setTransferring(null); setSelectedNewOwner(null) }}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleTransferTrip}
                disabled={!selectedNewOwner}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {t('common.transfer')}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Select the user who will become the new owner of this trip.
            </p>
            <select
              value={selectedNewOwner || ''}
              onChange={e => setSelectedNewOwner(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            >
              <option value="">Choose new owner...</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.email})
                </option>
              ))}
            </select>
          </div>
        </Modal>
      )}
    </div>
  )
}
