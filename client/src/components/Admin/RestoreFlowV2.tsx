import React, { useState, useRef } from 'react'
import { Upload, ArrowRight, AlertTriangle, CheckCircle, ChevronDown } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { adminRestoreApi } from '../../api/client'
import { useToast } from '../shared/Toast'
import { getApiErrorMessage } from '../../types'

type Step = 'upload' | 'preview' | 'strategy' | 'result'
type ConflictStrategy = 'skip' | 'overwrite' | 'duplicate' | 'merge'

interface ManifestData {
  date: string
  version: string
  scope: Record<string, unknown>
  [key: string]: unknown
}

export default function RestoreFlowV2() {
  const { t } = useTranslation()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Multi-step state
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [uploadId, setUploadId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Preview state
  const [manifest, setManifest] = useState<ManifestData | null>(null)
  const [preview, setPreview] = useState<any>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Strategy state
  const [strategy, setStrategy] = useState<ConflictStrategy>('duplicate')
  const [scopes, setScopes] = useState<string[]>([])
  const [dryRun, setDryRun] = useState(true)
  const [importing, setImporting] = useState(false)

  // Result state
  const [result, setResult] = useState<any>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.endsWith('.trek')) {
      toast.error('Only .trek files allowed')
      return
    }

    setFile(selectedFile)
    setUploadError(null)
    setUploading(true)

    try {
      const data = await adminRestoreApi.upload(selectedFile)
      setUploadId(data.uploadId)
      setManifest(data.manifest)
      setStep('preview')
      toast.success('File uploaded')
    } catch (err: unknown) {
      setUploadError(getApiErrorMessage(err, 'Upload failed'))
      toast.error(getApiErrorMessage(err, 'Upload failed'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const loadPreview = async () => {
    if (!uploadId) return
    setLoadingPreview(true)
    try {
      const data = await adminRestoreApi.preview(uploadId)
      setPreview(data)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Preview failed'))
    } finally {
      setLoadingPreview(false)
    }
  }

  React.useEffect(() => {
    if (step === 'preview' && uploadId && !preview) {
      loadPreview()
    }
  }, [step, uploadId, preview])

  const handleStrategySelect = (s: ConflictStrategy) => {
    setStrategy(s)
    setStep('strategy')
  }

  const handleRestore = async (dryRunMode: boolean) => {
    if (!uploadId) return
    setImporting(true)
    try {
      const data = await adminRestoreApi.restore(uploadId, strategy, scopes, dryRunMode)
      setResult(data)
      setDryRun(dryRunMode)
      setStep('result')
      if (!dryRunMode) {
        toast.success('Data imported successfully')
      }
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Import failed'))
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setStep('upload')
    setFile(null)
    setUploadId(null)
    setManifest(null)
    setPreview(null)
    setStrategy('duplicate')
    setScopes([])
    setDryRun(true)
    setResult(null)
    setUploadError(null)
  }

  return (
    <div className="space-y-4">
      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="p-6 rounded-xl border border-gray-200 bg-white">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-bold">1</span>
            {t('backup.v2.restore.upload')}
          </h3>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".trek"
              onChange={handleFileSelect}
              disabled={uploading}
              style={{ display: 'none' }}
            />
            <Upload size={32} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">Drop .trek file or click to select</p>
            <p className="text-xs text-gray-500 mt-1">Max 500 MB</p>
            {uploading && <p className="text-xs text-blue-600 mt-3">Uploading…</p>}
            {uploadError && <p className="text-xs text-red-600 mt-3">{uploadError}</p>}
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && uploadId && (
        <div className="p-6 rounded-xl border border-gray-200 bg-white space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-bold">2</span>
            {t('backup.v2.restore.preview')}
          </h3>

          {manifest && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-xs text-gray-600">Date</p>
                <p className="text-sm font-medium text-gray-900">{new Date(manifest.date).toLocaleDateString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-xs text-gray-600">Version</p>
                <p className="text-sm font-medium text-gray-900">{manifest.version || '—'}</p>
              </div>
            </div>
          )}

          {loadingPreview ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : preview && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Items to import:</p>
              <div className="grid grid-cols-2 gap-3">
                {preview.trips && <div className="p-2 bg-blue-50 rounded text-sm"><span className="font-medium text-blue-900">{preview.trips}</span> <span className="text-blue-700">trips</span></div>}
                {preview.places && <div className="p-2 bg-green-50 rounded text-sm"><span className="font-medium text-green-900">{preview.places}</span> <span className="text-green-700">places</span></div>}
                {preview.files && <div className="p-2 bg-purple-50 rounded text-sm"><span className="font-medium text-purple-900">{preview.files}</span> <span className="text-purple-700">files</span></div>}
              </div>
            </div>
          )}

          <button
            onClick={() => setStep('strategy')}
            className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 flex items-center justify-center gap-2 text-sm font-medium"
          >
            {t('common.next')} <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Step 3: Strategy */}
      {step === 'strategy' && uploadId && (
        <div className="p-6 rounded-xl border border-gray-200 bg-white space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-bold">3</span>
            {t('backup.v2.restore.strategy')}
          </h3>

          <div className="space-y-2">
            {(['skip', 'overwrite', 'duplicate', 'merge'] as ConflictStrategy[]).map(s => (
              <label key={s} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50" style={{ borderColor: strategy === s ? '#1e293b' : '#e5e7eb' }}>
                <input
                  type="radio"
                  name="strategy"
                  value={s}
                  checked={strategy === s}
                  onChange={() => setStrategy(s)}
                  className="cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 capitalize">{s}</p>
                  <p className="text-xs text-gray-600">
                    {s === 'skip' && 'Skip items that already exist'}
                    {s === 'overwrite' && 'Replace existing items'}
                    {s === 'duplicate' && 'Create copies of all items'}
                    {s === 'merge' && 'Intelligently merge data'}
                  </p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <input
              type="checkbox"
              id="dryrun"
              checked={dryRun}
              onChange={e => setDryRun(e.target.checked)}
              className="cursor-pointer"
            />
            <label htmlFor="dryrun" className="flex-1 cursor-pointer">
              <p className="text-sm font-medium text-blue-900">{t('backup.v2.restore.dryRun')}</p>
              <p className="text-xs text-blue-700">Preview changes without importing</p>
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep('preview')}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              {t('common.back')}
            </button>
            <button
              onClick={() => handleRestore(dryRun)}
              disabled={importing}
              className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-60 text-sm font-medium"
            >
              {importing ? 'Processing…' : (dryRun ? 'Preview' : 'Confirm Import')}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step === 'result' && result && (
        <div className="p-6 rounded-xl border border-gray-200 bg-white space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle size={24} className="text-green-600" />
            <h3 className="font-semibold">{dryRun ? 'Preview Result' : 'Import Complete'}</h3>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <p className="text-lg font-bold text-green-900">{result.imported || 0}</p>
              <p className="text-xs text-green-700">Imported</p>
            </div>
            <div className="p-3 bg-yellow-50 rounded-lg text-center">
              <p className="text-lg font-bold text-yellow-900">{result.skipped || 0}</p>
              <p className="text-xs text-yellow-700">Skipped</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg text-center">
              <p className="text-lg font-bold text-red-900">{result.errors?.length || 0}</p>
              <p className="text-xs text-red-700">Errors</p>
            </div>
          </div>

          {result.errors && result.errors.length > 0 && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm font-medium text-red-900 mb-2">Errors:</p>
              <ul className="text-xs text-red-700 space-y-1">
                {result.errors.slice(0, 5).map((err: string, i: number) => (
                  <li key={i}>• {err}</li>
                ))}
                {result.errors.length > 5 && <li>• ...and {result.errors.length - 5} more</li>}
              </ul>
            </div>
          )}

          {dryRun ? (
            <button
              onClick={() => {
                setStrategy('duplicate') // reset strategy
                setStep('strategy')
              }}
              className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-medium"
            >
              Proceed with real import
            </button>
          ) : null}

          <button
            onClick={reset}
            className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            {t('common.close')}
          </button>
        </div>
      )}
    </div>
  )
}
