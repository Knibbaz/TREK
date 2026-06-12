import React, { useState, useEffect } from 'react'
import { FileDown, Trash2, AlertTriangle } from 'lucide-react'
import { gdprApi } from '../../api/client'
import { useTranslation } from '../../i18n'
import { useToast } from '../shared/Toast'
import { getApiErrorMessage } from '../../types'

interface ExportRequest {
  id: number
  user_id: number
  username: string
  email: string
  status: string
  download_count: number
  max_downloads: number
  requested_at: string
  ready_at: string | null
  expires_at: string | null
  file_size_bytes: number
}

interface PendingDeletion {
  id: number
  username: string
  email: string
  deletion_requested_at: string
  pending_deletion: number
  delete_at: string
}

export default function GdprAdminPanel(): React.ReactElement {
  const { t, language } = useTranslation()
  const toast = useToast()
  const [exports, setExports] = useState<ExportRequest[]>([])
  const [deletions, setPendingDeletions] = useState<PendingDeletion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadGdprData()
  }, [])

  const loadGdprData = async () => {
    setLoading(true)
    try {
      const [exportsData, deletionsData] = await Promise.all([
        gdprApi.exports(),
        gdprApi.deletions(),
      ])
      setExports(exportsData.exports || [])
      setPendingDeletions(deletionsData.deletions || [])
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('common.error')))
    } finally {
      setLoading(false)
    }
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
  }

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString(language)
  }

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'ready': return '#10b981'
      case 'processing': return '#f59e0b'
      case 'expired': return '#ef4444'
      default: return 'var(--text-secondary)'
    }
  }

  return (
    <div className="space-y-6">
      {/* Exports Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FileDown size={20} style={{ color: 'var(--text-secondary)' }} />
          <h3 className="text-lg font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
            {t('gdpr.exports.title') || 'Export Requests'}
          </h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
          </div>
        ) : exports.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }} className="text-sm m-0">{t('common.noData') || 'No exports'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>User</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Email</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Size</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Downloads</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Requested</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Expires</th>
                </tr>
              </thead>
              <tbody>
                {exports.map(exp => (
                  <tr key={exp.id} style={{ borderBottom: '1px solid var(--border-secondary)', background: 'var(--bg-secondary)' }}>
                    <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-primary)' }}>{exp.username}</td>
                    <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-muted)' }}>{exp.email}</td>
                    <td style={{ padding: '12px 8px', fontSize: 13 }}>
                      <span style={{
                        display: 'inline-block', padding: '4px 8px', borderRadius: 4,
                        background: getStatusColor(exp.status), color: 'white', fontSize: 11, fontWeight: 600, textTransform: 'capitalize'
                      }}>
                        {exp.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>{formatBytes(exp.file_size_bytes)}</td>
                    <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>{exp.download_count}/{exp.max_downloads}</td>
                    <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-muted)' }}>{formatDate(exp.requested_at)}</td>
                    <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-muted)' }}>{formatDate(exp.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deletions Section */}
      <div style={{ paddingTop: 24, marginTop: 24, borderTop: '1px solid var(--border-secondary)' }}>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} style={{ color: '#ef4444' }} />
          <h3 className="text-lg font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
            {t('gdpr.deletions.title') || 'Pending Deletions'}
          </h3>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: '50%', background: '#fef3c7', color: '#92400e',
            fontSize: 12, fontWeight: 600
          }}>
            {deletions.length}
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
          </div>
        ) : deletions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }} className="text-sm m-0">{t('common.noData') || 'No pending deletions'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>User</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Email</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Requested</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Delete At</th>
                </tr>
              </thead>
              <tbody>
                {deletions.map(del => {
                  const deleteDate = new Date(del.delete_at)
                  const now = new Date()
                  const isOverdue = deleteDate <= now
                  return (
                    <tr key={del.id} style={{
                      borderBottom: '1px solid var(--border-secondary)',
                      background: isOverdue ? 'rgba(239, 68, 68, 0.05)' : 'var(--bg-secondary)'
                    }}>
                      <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-primary)' }}>
                        <div className="flex items-center gap-2">
                          {isOverdue && <AlertTriangle size={14} style={{ color: '#ef4444' }} />}
                          <span>{del.username}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-muted)' }}>{del.email}</td>
                      <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-muted)' }}>{formatDate(del.deletion_requested_at)}</td>
                      <td style={{ padding: '12px 8px', fontSize: 13, color: isOverdue ? '#ef4444' : 'var(--text-secondary)' }}>
                        {formatDate(del.delete_at)}
                        {isOverdue && <span style={{ marginLeft: 8, fontSize: 11, color: '#ef4444', fontWeight: 600 }}>OVERDUE</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
