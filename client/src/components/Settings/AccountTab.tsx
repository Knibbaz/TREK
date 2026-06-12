import React, { useState, useEffect } from 'react'
import { User, Save, Lock, KeyRound, AlertTriangle, Shield, Camera, Trash2, Copy, Download, Printer, Upload, FileDown, AlertCircle } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation, getLocaleForLanguage } from '../../i18n'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../shared/Toast'
import { authApi, adminApi, userExportApi, gdprApi } from '../../api/client'
import { useSettingsStore } from '../../store/settingsStore'
import { getAllCountries } from '../../i18n/countryNames'
import { getApiErrorMessage } from '../../types'
import type { UserWithOidc } from '../../types'
import Section from './Section'
import PasskeysSection from './PasskeysSection'

const MFA_BACKUP_SESSION_KEY = 'trek_mfa_backup_codes_pending'

export default function AccountTab(): React.ReactElement {
  const { user, updateProfile, uploadAvatar, deleteAvatar, logout, loadUser, demoMode, appRequireMfa } = useAuthStore()
  const { settings, updateSetting, loadSettings } = useSettingsStore()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { t, language } = useTranslation()
  const toast = useToast()
  const avatarInputRef = React.useRef<HTMLInputElement>(null)

  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean | 'blocked'>(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Profile
  const [username, setUsername] = useState<string>(user?.username || '')
  const [email, setEmail] = useState<string>(user?.email || '')
  const countries = getAllCountries(getLocaleForLanguage(language))

  useEffect(() => {
    setUsername(user?.username || '')
    setEmail(user?.email || '')
  }, [user])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Load export preview + existing export status on mount
  useEffect(() => {
    userExportApi.preview()
      .then(data => {
        setExportStats({ trips: data.trips || 0, places: data.places || 0, files_mb: data.files_mb || 0 })
      })
      .catch(() => {
        setExportStats({ trips: 0, places: 0, files_mb: 0 })
      })
    userExportApi.status()
      .then(data => {
        if (data.status === 'ready' && data.canDownload && data.token) {
          setExportStatus('ready')
          setExportToken(data.token)
          setExportExpiresAt(data.expiresAt)
          setExportDownloadsLeft(data.downloads_left)
        } else if (data.status === 'processing') {
          setExportStatus('processing')
        }
      })
      .catch(() => {})
  }, [])

  // Password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [oidcOnlyMode, setOidcOnlyMode] = useState(false)

  useEffect(() => {
    authApi.getAppConfig?.().then(config => {
      if (config?.oidc_only_mode) setOidcOnlyMode(true)
    }).catch(() => {})
  }, [])

  // MFA
  const [mfaQr, setMfaQr] = useState<string | null>(null)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [mfaSetupCode, setMfaSetupCode] = useState('')
  const [mfaDisablePwd, setMfaDisablePwd] = useState('')
  const [mfaDisableCode, setMfaDisableCode] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)

  // Export
  const [exportStats, setExportStats] = useState<{ trips: number; places: number; files_mb: number } | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null) // 'processing' | 'ready'
  const [exportToken, setExportToken] = useState<string | null>(null)
  const [exportExpiresAt, setExportExpiresAt] = useState<string | null>(null)
  const [exportDownloadsLeft, setExportDownloadsLeft] = useState<number | null>(null)
  const exportStatusPollRef = React.useRef<NodeJS.Timeout | null>(null)

  // Import
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const importInputRef = React.useRef<HTMLInputElement>(null)

  const mfaRequiredByPolicy =
    !demoMode &&
    !user?.mfa_enabled &&
    (searchParams.get('mfa') === 'required' || appRequireMfa)

  const backupCodesText = backupCodes?.join('\n') || ''

  useEffect(() => {
    if (!user?.mfa_enabled || backupCodes) return
    try {
      const raw = sessionStorage.getItem(MFA_BACKUP_SESSION_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(x => typeof x === 'string')) {
        setBackupCodes(parsed)
      }
    } catch {
      sessionStorage.removeItem(MFA_BACKUP_SESSION_KEY)
    }
  }, [user?.mfa_enabled, backupCodes])

  // Poll export status while processing
  useEffect(() => {
    if (exportStatus !== 'processing') {
      if (exportStatusPollRef.current) clearInterval(exportStatusPollRef.current)
      return
    }
    exportStatusPollRef.current = setInterval(() => {
      userExportApi.status()
        .then(data => {
          setExportStatus(data.status)
          if (data.status === 'ready') {
            setExportToken(data.token)
            setExportExpiresAt(data.expires_at)
            setExportDownloadsLeft(data.downloads_left)
          }
        })
        .catch(() => {})
    }, 3000)
    return () => {
      if (exportStatusPollRef.current) clearInterval(exportStatusPollRef.current)
    }
  }, [exportStatus])

  const dismissBackupCodes = () => {
    sessionStorage.removeItem(MFA_BACKUP_SESSION_KEY)
    setBackupCodes(null)
  }

  const copyBackupCodes = async () => {
    if (!backupCodesText) return
    try {
      await navigator.clipboard.writeText(backupCodesText)
      toast.success(t('settings.mfa.backupCopied'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const downloadBackupCodes = () => {
    if (!backupCodesText) return
    const blob = new Blob([backupCodesText + '\n'], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'trek-mfa-backup-codes.txt'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const printBackupCodes = () => {
    if (!backupCodesText) return
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>ROUTD MFA Backup Codes</title>
      <style>body{font-family:Arial,sans-serif;padding:32px}h1{font-size:20px}pre{font-size:16px;line-height:1.6}</style>
      </head><body><h1>ROUTD MFA Backup Codes</h1><p>${new Date().toLocaleString()}</p><pre>${backupCodesText}</pre></body></html>`
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadAvatar(file)
      toast.success(t('settings.avatarUploaded'))
    } catch {
      toast.error(t('settings.avatarError'))
    }
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  const handleAvatarRemove = async () => {
    try {
      await deleteAvatar()
      toast.success(t('settings.avatarRemoved'))
    } catch {
      toast.error(t('settings.avatarError'))
    }
  }

  const saveProfile = async () => {
    setSaving(true)
    try {
      await updateProfile({ username, email })
      toast.success(t('settings.toast.profileSaved'))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const startExport = async () => {
    setExportLoading(true)
    try {
      const data = await userExportApi.start()
      setExportStatus(data.status)
      if (data.status === 'ready') {
        setExportToken(data.token)
        setExportExpiresAt(data.expires_at)
        setExportDownloadsLeft(data.downloads_left)
      }
      toast.success(t('backup.v2.export.success'))
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('common.error')))
    } finally {
      setExportLoading(false)
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)
    setImportLoading(true)
    try {
      const result = await userExportApi.import(file)
      setImportResult({ imported: result.imported, skipped: result.skipped, errors: result.errors || [] })
      toast.success(t('backup.v2.import.success'))
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('common.error')))
    } finally {
      setImportLoading(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <>
      <Section title={t('settings.account')} icon={User}>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.username')}</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.email')}</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
          />
        </div>

        {/* Home Country */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('account.homeCountry')}</label>
          <select
            value={settings.home_country || ''}
            onChange={e => updateSetting('home_country', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          >
            <option value="">{t('dateAvail.selectCountry') || 'Select country'}</option>
            {countries.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>{t('account.homeCountryHelp')}</p>
        </div>

        {/* Change Password */}
        {!oidcOnlyMode && (
          <div className="pt-4 mt-4 border-t border-edge-secondary">
            <label className="block text-sm font-medium text-slate-700 mb-3">{t('settings.changePassword')}</label>
            <div className="space-y-3">
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder={t('settings.currentPassword')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
              />
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder={t('settings.newPassword')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder={t('settings.confirmPassword')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
              />
              <button
                onClick={async () => {
                  if (!currentPassword) return toast.error(t('settings.currentPasswordRequired'))
                  if (!newPassword) return toast.error(t('settings.passwordRequired'))
                  if (newPassword.length < 8) return toast.error(t('settings.passwordTooShort'))
                  if (newPassword !== confirmPassword) return toast.error(t('settings.passwordMismatch'))
                  try {
                    await authApi.changePassword({ current_password: currentPassword, new_password: newPassword })
                    toast.success(t('settings.passwordChanged'))
                    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
                    await loadUser({ silent: true })
                  } catch (err: unknown) {
                    toast.error(getApiErrorMessage(err, t('common.error')))
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-edge bg-surface-card text-content-secondary"
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
              >
                <Lock size={14} />
                {t('settings.updatePassword')}
              </button>
            </div>
          </div>
        )}

        {/* MFA */}
        <div className="pt-4 mt-4 border-t border-edge-secondary">
          <div className="flex items-center gap-2 mb-3">
            <KeyRound className="w-5 h-5 text-content-secondary" />
            <h3 className="font-semibold text-base m-0 text-content">{t('settings.mfa.title')}</h3>
          </div>
          <div className="space-y-3">
            {mfaRequiredByPolicy && (
              <div className="flex gap-3 p-3 rounded-lg border text-sm bg-surface-secondary border-edge text-content">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600" />
                <p className="m-0 leading-relaxed">{t('settings.mfa.requiredByPolicy')}</p>
              </div>
            )}
            <p className="text-sm m-0 text-content-muted" style={{ lineHeight: 1.5 }}>{t('settings.mfa.description')}</p>
            {demoMode ? (
              <p className="text-sm text-amber-700 m-0">{t('settings.mfa.demoBlocked')}</p>
            ) : (
              <>
                <p className="text-sm font-medium m-0 text-content-secondary">
                  {user?.mfa_enabled ? t('settings.mfa.enabled') : t('settings.mfa.disabled')}
                </p>

                {!user?.mfa_enabled && !mfaQr && (
                  <button
                    type="button"
                    disabled={mfaLoading}
                    onClick={async () => {
                      setMfaLoading(true)
                      try {
                        const data = await authApi.mfaSetup() as { qr_svg: string; secret: string }
                        setMfaQr(data.qr_svg)
                        setMfaSecret(data.secret)
                        setMfaSetupCode('')
                      } catch (err: unknown) {
                        toast.error(getApiErrorMessage(err, t('common.error')))
                      } finally {
                        setMfaLoading(false)
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-edge bg-surface-card text-content"
                  >
                    {mfaLoading ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" /> : <KeyRound size={14} />}
                    {t('settings.mfa.setup')}
                  </button>
                )}

                {!user?.mfa_enabled && mfaQr && (
                  <div className="space-y-3">
                    <p className="text-sm text-content-muted">{t('settings.mfa.scanQr')}</p>
                    <div className="rounded-lg border mx-auto block overflow-hidden border-edge" style={{ width: 'fit-content' }} dangerouslySetInnerHTML={{ __html: mfaQr! }} />
                    <div>
                      <label className="block text-xs font-medium mb-1 text-content-secondary">{t('settings.mfa.secretLabel')}</label>
                      <code className="block text-xs p-2 rounded break-all bg-surface-hover text-content">{mfaSecret}</code>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={mfaSetupCode}
                      onChange={e => setMfaSetupCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder={t('settings.mfa.codePlaceholder')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={mfaLoading || mfaSetupCode.length < 6}
                        onClick={async () => {
                          setMfaLoading(true)
                          try {
                            const resp = await authApi.mfaEnable({ code: mfaSetupCode }) as { backup_codes?: string[] }
                            toast.success(t('settings.mfa.toastEnabled'))
                            setMfaQr(null)
                            setMfaSecret(null)
                            setMfaSetupCode('')
                            const codes = resp.backup_codes || null
                            if (codes?.length) {
                              try { sessionStorage.setItem(MFA_BACKUP_SESSION_KEY, JSON.stringify(codes)) } catch { /* ignore */ }
                            }
                            setBackupCodes(codes)
                            await loadUser({ silent: true })
                          } catch (err: unknown) {
                            toast.error(getApiErrorMessage(err, t('common.error')))
                          } finally {
                            setMfaLoading(false)
                          }
                        }}
                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50"
                      >
                        {t('settings.mfa.enable')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setMfaQr(null); setMfaSecret(null); setMfaSetupCode('') }}
                        className="px-4 py-2 rounded-lg text-sm border border-edge text-content-secondary"
                      >
                        {t('settings.mfa.cancelSetup')}
                      </button>
                    </div>
                  </div>
                )}

                {user?.mfa_enabled && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-content-secondary">{t('settings.mfa.disableTitle')}</p>
                    <p className="text-xs text-content-muted">{t('settings.mfa.disableHint')}</p>
                    <input
                      type="password"
                      value={mfaDisablePwd}
                      onChange={e => setMfaDisablePwd(e.target.value)}
                      placeholder={t('settings.currentPassword')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={mfaDisableCode}
                      onChange={e => setMfaDisableCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder={t('settings.mfa.codePlaceholder')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      disabled={mfaLoading || !mfaDisablePwd || mfaDisableCode.length < 6}
                      onClick={async () => {
                        setMfaLoading(true)
                        try {
                          await authApi.mfaDisable({ password: mfaDisablePwd, code: mfaDisableCode })
                          toast.success(t('settings.mfa.toastDisabled'))
                          setMfaDisablePwd('')
                          setMfaDisableCode('')
                          sessionStorage.removeItem(MFA_BACKUP_SESSION_KEY)
                          setBackupCodes(null)
                          await loadUser({ silent: true })
                        } catch (err: unknown) {
                          toast.error(getApiErrorMessage(err, t('common.error')))
                        } finally {
                          setMfaLoading(false)
                        }
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50"
                    >
                      {t('settings.mfa.disable')}
                    </button>
                  </div>
                )}

                {backupCodes && backupCodes.length > 0 && (
                  <div className="space-y-3 p-3 rounded-lg border border-edge bg-surface-hover">
                    <p className="text-sm font-semibold m-0 text-content">{t('settings.mfa.backupTitle')}</p>
                    <p className="text-xs m-0 text-content-muted">{t('settings.mfa.backupDescription')}</p>
                    <pre className="text-xs m-0 p-2 rounded border overflow-auto border-edge bg-surface-card text-content" style={{ maxHeight: 220 }}>{backupCodesText}</pre>
                    <p className="text-xs m-0 text-[#b45309]">{t('settings.mfa.backupWarning')}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={copyBackupCodes} className="px-3 py-2 rounded-lg text-xs border flex items-center gap-1.5 border-edge text-content-secondary">
                        <Copy size={13} /> {t('settings.mfa.backupCopy')}
                      </button>
                      <button type="button" onClick={downloadBackupCodes} className="px-3 py-2 rounded-lg text-xs border flex items-center gap-1.5 border-edge text-content-secondary">
                        <Download size={13} /> {t('settings.mfa.backupDownload')}
                      </button>
                      <button type="button" onClick={printBackupCodes} className="px-3 py-2 rounded-lg text-xs border flex items-center gap-1.5 border-edge text-content-secondary">
                        <Printer size={13} /> {t('settings.mfa.backupPrint')}
                      </button>
                      <button type="button" onClick={dismissBackupCodes} className="px-3 py-2 rounded-lg text-xs border border-edge text-content-secondary">
                        {t('common.ok')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Passkeys */}
        <PasskeysSection demoMode={demoMode} />

        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div className="bg-surface-hover text-content-secondary" style={{
                width: 64, height: 64, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 700,
              }}>
                {user?.username?.charAt(0).toUpperCase()}
              </div>
            )}
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
            <button
              onClick={() => avatarInputRef.current?.click()}
              style={{
                position: 'absolute', bottom: -3, right: -3,
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--text-primary)', color: 'var(--bg-card)',
                border: '2px solid var(--bg-card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', padding: 0, transition: 'transform 0.15s, opacity 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1' }}
            >
              <Camera size={14} />
            </button>
            {user?.avatar_url && (
              <button
                onClick={handleAvatarRemove}
                className="bg-[#ef4444] text-white"
                style={{
                  position: 'absolute', top: -2, right: -2,
                  width: 20, height: 20, borderRadius: '50%',
                  border: '2px solid var(--bg-card)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', padding: 0,
                }}
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-sm text-content-muted">
              <span className="font-medium text-content-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {user?.role === 'admin' ? <><Shield size={13} /> {t('settings.roleAdmin')}</> : t('settings.roleUser')}
              </span>
              {(user as UserWithOidc)?.oidc_issuer && (
                <span className="bg-[#dbeafe] text-[#1d4ed8]" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 10, fontWeight: 500, padding: '1px 8px', borderRadius: 99,
                  marginLeft: 6,
                }}>
                  SSO
                </span>
              )}
            </div>
            {(user as UserWithOidc)?.oidc_issuer && (
              <p className="text-content-faint" style={{ fontSize: 11, marginTop: -2 }}>
                {t('settings.oidcLinked')} {(user as UserWithOidc).oidc_issuer!.replace('https://', '').replace(/\/+$/, '')}
              </p>
            )}
          </div>
        </div>

        {user?.pending_deletion ? (
          <div className="p-3 rounded-lg border" style={{ background: '#fef2f2', borderColor: '#fecaca', marginTop: 16, marginBottom: 12 }}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} style={{ color: '#ef4444', marginTop: 1, flexShrink: 0 }} />
              <div>
                <p className="text-sm font-medium m-0 mb-1" style={{ color: '#ef4444' }}>
                  {t('gdpr.account.pendingBanner') || 'Account scheduled for deletion'}
                </p>
                <p className="text-xs m-0" style={{ color: '#dc2626' }}>
                  {user.deletion_requested_at ? new Date(new Date(user.deletion_requested_at).getTime() + 14 * 24 * 60 * 60 * 1000).toLocaleString(language) : '—'}
                </p>
              </div>
            </div>
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <button
            onClick={saveProfile}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-700 disabled:bg-slate-400"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="hidden sm:inline">{t('settings.saveProfile')}</span>
            <span className="sm:hidden">{t('common.save')}</span>
          </button>
          {user?.pending_deletion ? (
            <button
              onClick={async () => {
                setDeleteLoading(true)
                try {
                  await gdprApi.cancelDeletion()
                  toast.success(t('gdpr.account.cancelSuccess') || 'Deletion cancelled')
                  await loadUser({ silent: true })
                } catch (err: unknown) {
                  toast.error(getApiErrorMessage(err, t('common.error')))
                } finally {
                  setDeleteLoading(false)
                }
              }}
              disabled={deleteLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444' }}
            >
              {deleteLoading ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" /> : <AlertTriangle size={14} />}
              <span className="hidden sm:inline">{t('gdpr.account.cancelDeletion') || 'Cancel deletion'}</span>
              <span className="sm:hidden">{t('common.cancel')}</span>
            </button>
          ) : (
            <button
              onClick={async () => {
                if (user?.role === 'admin') {
                  try {
                    await adminApi.stats()
                    const adminUsers = (await adminApi.users()).users.filter((u: { role: string }) => u.role === 'admin')
                    if (adminUsers.length <= 1) {
                      setShowDeleteConfirm('blocked')
                      return
                    }
                  } catch {}
                }
                setShowDeleteConfirm(true)
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-red-500 hover:bg-red-50"
              style={{ border: '1px solid #fecaca' }}
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">{t('settings.deleteAccount')}</span>
              <span className="sm:hidden">{t('common.delete')}</span>
            </button>
          )}
        </div>
      </Section>

      {/* Delete Account Blocked */}
      {showDeleteConfirm === 'blocked' && (
        <div className="bg-[rgba(0,0,0,0.5)]" style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-surface-card" style={{
            borderRadius: 16, padding: '28px 24px',
            maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div className="bg-[#fef3c7]" style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={18} className="text-[#d97706]" />
              </div>
              <h3 className="text-content" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t('settings.deleteBlockedTitle')}</h3>
            </div>
            <p className="text-content-muted" style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
              {t('settings.deleteBlockedMessage')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="border border-edge bg-surface-card text-content-secondary"
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('common.ok') || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirm */}
      {showDeleteConfirm === true && (
        <div className="bg-[rgba(0,0,0,0.5)]" style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-surface-card" style={{
            borderRadius: 16, padding: '28px 24px',
            maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div className="bg-[#fef2f2]" style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={18} className="text-[#ef4444]" />
              </div>
              <h3 className="text-content" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t('settings.deleteAccountTitle')}</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 12px' }}>
              {t('gdpr.account.gracePeriod') || 'Your account will be deleted in 14 days. You can cancel the deletion at any time during this period.'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
              {t('gdpr.account.downloadFirst') || 'Consider downloading your data first before requesting deletion.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="border border-edge bg-surface-card text-content-secondary"
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={async () => {
                  setDeleteLoading(true)
                  try {
                    await gdprApi.requestDeletion()
                    toast.success(t('gdpr.account.requestSuccess') || 'Deletion requested. You have 14 days to cancel.')
                    await loadUser({ silent: true })
                    setShowDeleteConfirm(false)
                  } catch (err: unknown) {
                    toast.error(getApiErrorMessage(err, t('common.error')))
                  } finally {
                    setDeleteLoading(false)
                  }
                }}
                disabled={deleteLoading}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: 'none', background: '#ef4444', color: 'white',
                  cursor: deleteLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  opacity: deleteLoading ? 0.6 : 1,
                }}
              >
                {deleteLoading ? 'Processing...' : t('settings.deleteAccountConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Export Section */}
      <Section title={t('backup.v2.export.title')} icon={FileDown}>
        <p className="text-sm m-0" style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
          {t('backup.v2.export.preview')}
        </p>
        {exportStats && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <p className="text-xs m-0" style={{ color: 'var(--text-muted)' }}>Trips</p>
              <p className="text-lg font-semibold m-0" style={{ color: 'var(--text-primary)' }}>{exportStats.trips}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <p className="text-xs m-0" style={{ color: 'var(--text-muted)' }}>Places</p>
              <p className="text-lg font-semibold m-0" style={{ color: 'var(--text-primary)' }}>{exportStats.places}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <p className="text-xs m-0" style={{ color: 'var(--text-muted)' }}>Files</p>
              <p className="text-lg font-semibold m-0" style={{ color: 'var(--text-primary)' }}>{exportStats.files_mb} MB</p>
            </div>
          </div>
        )}
        {!exportStatus && (
          <button
            onClick={startExport}
            disabled={exportLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors mb-3"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
          >
            {exportLoading ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" /> : <Download size={14} />}
            {t('backup.v2.export.start')}
          </button>
        )}
        {exportStatus === 'processing' && (
          <div className="p-3 rounded-lg mb-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
            <p className="text-sm m-0 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
              {t('backup.v2.export.downloading')}
            </p>
          </div>
        )}
        {exportStatus === 'ready' && exportToken && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
              <p className="text-xs m-0" style={{ color: 'var(--text-muted)' }}>{t('backup.v2.export.expiresAt')}</p>
              <p className="text-sm font-medium m-0" style={{ color: 'var(--text-primary)' }}>
                {exportExpiresAt ? new Date(exportExpiresAt).toLocaleString(language) : '—'}
              </p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
              <p className="text-xs m-0" style={{ color: 'var(--text-muted)' }}>{t('backup.v2.export.downloadsLeft')}</p>
              <p className="text-sm font-medium m-0" style={{ color: 'var(--text-primary)' }}>{exportDownloadsLeft}</p>
            </div>
            <a
              href={userExportApi.downloadUrl(exportToken)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: 'var(--bg-primary)', color: 'white', textDecoration: 'none' }}
            >
              <Download size={14} />
              {t('backup.v2.export.ready')}
            </a>
          </div>
        )}
      </Section>

      {/* Data Import Section */}
      <Section title={t('backup.v2.import.title')} icon={Upload}>
        <div className="space-y-3">
          <div className="p-3 rounded-lg border flex gap-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
            <AlertCircle size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
            <p className="text-xs m-0" style={{ color: 'var(--text-muted)' }}>
              {t('backup.v2.import.warning')}
            </p>
          </div>
          <div>
            <input
              ref={importInputRef}
              type="file"
              accept=".routd"
              onChange={handleImportFile}
              disabled={importLoading}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
            >
              {importLoading ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" /> : <Upload size={14} />}
              {t('backup.v2.import.start')}
            </button>
          </div>
          {importResult && (
            <div className="p-3 rounded-lg border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
              <p className="text-sm font-medium m-0 mb-2" style={{ color: 'var(--text-primary)' }}>
                {t('backup.v2.import.success')}
              </p>
              <div className="space-y-1">
                <p className="text-xs m-0" style={{ color: 'var(--text-muted)' }}>Imported: {importResult.imported}</p>
                <p className="text-xs m-0" style={{ color: 'var(--text-muted)' }}>Skipped: {importResult.skipped}</p>
                {importResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs m-0 font-medium" style={{ color: '#ef4444' }}>Errors:</p>
                    <ul className="text-xs m-0 mt-1 pl-4" style={{ color: '#ef4444' }}>
                      {importResult.errors.slice(0, 3).map((err, i) => <li key={i}>{err}</li>)}
                      {importResult.errors.length > 3 && <li>...and {importResult.errors.length - 3} more</li>}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Section>
    </>
  )
}
