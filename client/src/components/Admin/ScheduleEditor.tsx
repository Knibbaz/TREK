import React, { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Play, Calendar, Clock, AlertCircle, Check, X } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { backupScheduleApi } from '../../api/client'
import { useToast } from '../shared/Toast'
import { getApiErrorMessage } from '../../types'

interface Schedule {
  id: string
  name: string
  cron_expression: string
  timezone: string
  is_enabled: number
  scope: string
  include_uploads: number
  retention_days: number
  max_backups: number
  last_run_at: string | null
  last_status: string | null
  next_run_at: string | null
}

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily', cron: '0 3 * * *' },
  { value: 'weekly', label: 'Weekly (Monday)', cron: '0 3 * * 1' },
  { value: 'monthly', label: 'Monthly (1st)', cron: '0 3 1 * *' },
]

export default function ScheduleEditor() {
  const { t } = useTranslation()
  const toast = useToast()

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formFrequency, setFormFrequency] = useState('daily')
  const [formCron, setFormCron] = useState('0 3 * * *')
  const [formRetentionDays, setFormRetentionDays] = useState(30)
  const [formMaxBackups, setFormMaxBackups] = useState(10)
  const [formIncludeUploads, setFormIncludeUploads] = useState(true)
  const [formSaving, setFormSaving] = useState(false)

  const loadSchedules = async () => {
    setLoading(true)
    try {
      const data = await backupScheduleApi.list()
      setSchedules(data.schedules || [])
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to load schedules'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSchedules()
  }, [])

  const resetForm = () => {
    setFormName('')
    setFormFrequency('daily')
    setFormCron('0 3 * * *')
    setFormRetentionDays(30)
    setFormMaxBackups(10)
    setFormIncludeUploads(true)
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (schedule: Schedule) => {
    setEditingId(schedule.id)
    setFormName(schedule.name)
    setFormCron(schedule.cron_expression)
    setFormRetentionDays(schedule.retention_days)
    setFormMaxBackups(schedule.max_backups)
    setFormIncludeUploads(schedule.include_uploads === 1)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Schedule name is required')
      return
    }

    setFormSaving(true)
    try {
      const data = {
        name: formName,
        cron_expression: formCron,
        timezone: 'Europe/Amsterdam',
        scope: { trips: true, settings: false, uploads: formIncludeUploads },
        include_uploads: formIncludeUploads,
        retention_days: formRetentionDays,
        max_backups: formMaxBackups,
        is_enabled: 1,
      }

      if (editingId) {
        await backupScheduleApi.update(editingId, data)
        toast.success('Schedule updated')
      } else {
        await backupScheduleApi.create(data)
        toast.success('Schedule created')
      }
      await loadSchedules()
      resetForm()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to save schedule'))
    } finally {
      setFormSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return
    try {
      await backupScheduleApi.delete(id)
      toast.success('Schedule deleted')
      await loadSchedules()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to delete schedule'))
    }
  }

  const handleRun = async (id: string) => {
    try {
      await backupScheduleApi.run(id)
      toast.success('Backup started')
      await loadSchedules()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to start backup'))
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="space-y-4">
      {/* Header with Create button */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{t('backup.v2.schedules.title')}</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-medium"
        >
          <Plus size={16} />
          {showForm ? 'Cancel' : t('backup.v2.schedules.new')}
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="e.g., Daily backup"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Frequency</label>
            <div className="flex gap-2">
              {FREQUENCY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setFormFrequency(opt.value)
                    setFormCron(opt.cron)
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    formFrequency === opt.value
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Retention (days)</label>
            <input
              type="number"
              value={formRetentionDays}
              onChange={e => setFormRetentionDays(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              max="365"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Max backups to keep</label>
            <input
              type="number"
              value={formMaxBackups}
              onChange={e => setFormMaxBackups(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              max="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formIncludeUploads}
              onChange={e => setFormIncludeUploads(e.target.checked)}
              className="cursor-pointer"
            />
            <span className="text-sm text-gray-700">Include uploaded files</span>
          </label>

          <div className="flex gap-2 justify-end pt-2 border-t border-gray-200">
            <button
              onClick={resetForm}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 text-sm font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={formSaving}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-60 text-sm font-medium flex items-center gap-2"
            >
              {formSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
              {editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Schedules List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-slate-700 rounded-full animate-spin" />
        </div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Calendar size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No schedules yet</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-slate-700 text-sm hover:underline">
            Create your first schedule
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          <div className="hidden md:grid md:grid-cols-6 gap-4 px-4 py-3 bg-gray-50 font-medium text-xs text-gray-700">
            <div>Name</div>
            <div>Frequency</div>
            <div>Last run</div>
            <div>Next run</div>
            <div>Status</div>
            <div>Actions</div>
          </div>
          {schedules.map(schedule => (
            <div key={schedule.id} className="p-4 hover:bg-gray-50 space-y-2 md:space-y-0 md:grid md:grid-cols-6 md:gap-4 items-center">
              <div>
                <p className="font-medium text-sm text-gray-900">{schedule.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">{schedule.cron_expression}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{formatDate(schedule.last_run_at)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{formatDate(schedule.next_run_at)}</p>
              </div>
              <div>
                <span className={`inline-flex text-xs px-2 py-1 rounded-full ${
                  schedule.last_status === 'success'
                    ? 'bg-green-100 text-green-700'
                    : schedule.last_status === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {schedule.last_status || '—'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleRun(schedule.id)}
                  title="Run now"
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Play size={16} />
                </button>
                <button
                  onClick={() => handleEdit(schedule)}
                  title="Edit"
                  className="p-1.5 text-gray-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(schedule.id)}
                  title="Delete"
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
