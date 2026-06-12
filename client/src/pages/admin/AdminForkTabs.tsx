import { useState, useEffect } from 'react'
import { exploreApi, adminApi } from '../../api/client'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import { CreatorApplicationQueue } from '../../components/Admin/CreatorApplicationQueue'
import CustomSelect from '../../components/shared/CustomSelect'
import { Eye, CheckCircle, XCircle } from 'lucide-react'

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

// Explore moderation tab (ROUTD fork) — extracted from the pre-port AdminPage.
export function AdminExploreTab() {
  const { t } = useTranslation()
  const toast = useToast()
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

  useEffect(() => { loadSubmissions() }, [submissionFilter])

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

  return (
    <>
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
      {/* Submission preview modal */}
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
    </>
  )
}

// Creator payouts tab (ROUTD fork)
export function AdminPayoutsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const [payoutData, setPayoutData] = useState<any>(null)
  const [payoutsLoading, setPayoutsLoading] = useState(false)
  const [payoutForm, setPayoutForm] = useState<{ creatorId: number | ''; amount: string; description: string }>({ creatorId: '', amount: '', description: '' })
  const [savingPayout, setSavingPayout] = useState(false)

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

  useEffect(() => { loadPayouts() }, [])

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
    <>
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
    </>
  )
}
