import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../../api/client'
import { useToast } from '../shared/Toast'
import { Loader2, Save, Upload, Trash2, Palette } from 'lucide-react'

interface BrandingSettings {
  brand_name: string
  brand_logo_light: string
  brand_logo_dark: string
  brand_icon_light: string
  brand_icon_dark: string
  brand_accent: string
  brand_accent_text: string
  brand_bg_primary: string
  brand_bg_secondary: string
  brand_text_primary: string
  brand_text_secondary: string
  brand_text_muted: string
  brand_nav_bg: string
  disable_dark_mode: string
}

const LOGO_SLOTS = [
  { key: 'brand_logo_light', label: 'Logo (licht)', hint: 'Navbar op donkere achtergrond · aanbevolen: SVG, max 5MB' },
  { key: 'brand_logo_dark', label: 'Logo (donker)', hint: 'Navbar op lichte achtergrond · aanbevolen: SVG, max 5MB' },
  { key: 'brand_icon_light', label: 'Icoon (licht)', hint: 'Mobiel + favicon · vierkant · aanbevolen: SVG' },
  { key: 'brand_icon_dark', label: 'Icoon (donker)', hint: 'Mobiel op lichte achtergrond · vierkant · aanbevolen: SVG' },
] as const

type LogoKey = typeof LOGO_SLOTS[number]['key']

const DEFAULT_LOGOS: Record<LogoKey, string> = {
  brand_logo_light: '/logo-light.svg',
  brand_logo_dark: '/logo-dark.svg',
  brand_icon_light: '/icons/icon-white.svg',
  brand_icon_dark: '/icons/icon-dark.svg',
}

// Apply brand CSS vars directly to the DOM for live preview
const BRAND_CSS_VARS: Partial<Record<keyof BrandingSettings, string[]>> = {
  brand_accent: ['--accent'],
  brand_accent_text: ['--accent-text'],
  brand_bg_primary: ['--bg-primary', '--bg-card'],
  brand_bg_secondary: ['--bg-secondary', '--bg-tertiary', '--bg-input'],
  brand_text_primary: ['--text-primary'],
  brand_text_secondary: ['--text-secondary'],
  brand_text_muted: ['--text-muted'],
  brand_nav_bg: ['--brand-nav-bg'],
}

function applyBrandVar(key: keyof BrandingSettings, value: string) {
  const vars = BRAND_CSS_VARS[key]
  if (!vars) return
  vars.forEach(v => {
    if (value) document.documentElement.style.setProperty(v, value)
    else document.documentElement.style.removeProperty(v)
  })
}

export default function BrandingPanel() {
  const toast = useToast()
  const [settings, setSettings] = useState<BrandingSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    adminApi.getBranding().then(setSettings).catch(() => toast.error('Kon branding niet laden'))
  }, [])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await adminApi.updateBranding({
        brand_name: settings.brand_name,
        brand_accent: settings.brand_accent,
        brand_accent_text: settings.brand_accent_text,
        brand_bg_primary: settings.brand_bg_primary,
        brand_bg_secondary: settings.brand_bg_secondary,
        brand_text_primary: settings.brand_text_primary,
        brand_text_secondary: settings.brand_text_secondary,
        brand_text_muted: settings.brand_text_muted,
        brand_nav_bg: settings.brand_nav_bg,
        disable_dark_mode: settings.disable_dark_mode,
      })
      window.dispatchEvent(new CustomEvent('branding-updated'))
      toast.success('Branding opgeslagen')
    } catch {
      toast.error('Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (key: LogoKey, file: File) => {
    setUploading(key)
    try {
      const { url } = await adminApi.uploadBrandingLogo(key, file)
      setSettings(s => s ? { ...s, [key]: url } : s)
      window.dispatchEvent(new CustomEvent('branding-updated'))
      toast.success('Logo geüpload')
    } catch {
      toast.error('Upload mislukt')
    } finally {
      setUploading(null)
    }
  }

  const handleLogoReset = async (key: LogoKey) => {
    try {
      await adminApi.deleteBrandingLogo(key)
      setSettings(s => s ? { ...s, [key]: '' } : s)
      window.dispatchEvent(new CustomEvent('branding-updated'))
      toast.success('Logo hersteld naar standaard')
    } catch {
      toast.error('Herstellen mislukt')
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl">

      {/* App naam */}
      <section>
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>App naam</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Wordt getoond in de navbar, browser-tab en op de inlogpagina.</p>
        <input
          type="text"
          value={settings.brand_name}
          onChange={e => setSettings(s => s ? { ...s, brand_name: e.target.value } : s)}
          className="w-full px-3 py-2 rounded-lg text-sm border"
          style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
          placeholder="ROUTD"
          maxLength={64}
        />
      </section>

      {/* Accentkleur */}
      <section>
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Accentkleur</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Gebruikt voor knoppen en interactieve elementen.</p>
        <div className="flex gap-3 items-center flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Knopkleur</label>
            <div className="relative">
              <input
                type="color"
                value={settings.brand_accent}
                onChange={e => { setSettings(s => s ? { ...s, brand_accent: e.target.value } : s); applyBrandVar('brand_accent', e.target.value) }}
                className="w-10 h-10 rounded cursor-pointer border"
                style={{ borderColor: 'var(--border-primary)', padding: 2 }}
              />
            </div>
            <input
              type="text"
              value={settings.brand_accent}
              onChange={e => { setSettings(s => s ? { ...s, brand_accent: e.target.value } : s); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) applyBrandVar('brand_accent', e.target.value) }}
              className="w-24 px-2 py-1.5 rounded text-xs font-mono border"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              placeholder="#111827"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Tekstkleur op knop</label>
            <input
              type="color"
              value={settings.brand_accent_text}
              onChange={e => { setSettings(s => s ? { ...s, brand_accent_text: e.target.value } : s); applyBrandVar('brand_accent_text', e.target.value) }}
              className="w-10 h-10 rounded cursor-pointer border"
              style={{ borderColor: 'var(--border-primary)', padding: 2 }}
            />
            <input
              type="text"
              value={settings.brand_accent_text}
              onChange={e => { setSettings(s => s ? { ...s, brand_accent_text: e.target.value } : s); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) applyBrandVar('brand_accent_text', e.target.value) }}
              className="w-24 px-2 py-1.5 rounded text-xs font-mono border"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              placeholder="#ffffff"
            />
          </div>
          {/* Live preview */}
          <button
            type="button"
            className="px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: settings.brand_accent, color: settings.brand_accent_text, pointerEvents: 'none' }}
          >
            <Palette className="w-4 h-4 inline mr-1" />
            Preview
          </button>
        </div>
      </section>

      {/* Kleuren */}
      <section>
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Kleuren</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Laat leeg om de standaard thema-kleuren te gebruiken. Overschrijft zowel licht- als donker-modus.</p>
        <div className="space-y-3">
          {([
            { key: 'brand_bg_primary', label: 'Paginaachtergrond', hint: 'Grote vlakken, kaarten' },
            { key: 'brand_bg_secondary', label: 'Panelachtergrond', hint: 'Sidebar, modals, invoervelden' },
            { key: 'brand_text_primary', label: 'Primaire tekst', hint: 'Koppen en bodytekst' },
            { key: 'brand_text_secondary', label: 'Secundaire tekst', hint: 'Labels, beschrijvingen' },
            { key: 'brand_text_muted', label: 'Gedempte tekst', hint: 'Tijdstempels, placeholders' },
            { key: 'brand_nav_bg', label: 'Navigatiebalk', hint: 'Achtergrond van de bovenbalk' },
          ] as const).map(({ key, label, hint }) => (
            <div key={key} className="flex items-center gap-3">
              <div style={{ minWidth: 180 }}>
                <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</div>
              </div>
              <input
                type="color"
                value={settings[key] || '#ffffff'}
                onChange={e => {
                  const v = e.target.value
                  setSettings(s => s ? { ...s, [key]: v } : s)
                  applyBrandVar(key, v)
                }}
                className="w-10 h-10 rounded cursor-pointer border"
                style={{ borderColor: 'var(--border-primary)', padding: 2 }}
              />
              <input
                type="text"
                value={settings[key]}
                onChange={e => {
                  const v = e.target.value
                  setSettings(s => s ? { ...s, [key]: v } : s)
                  if (/^#[0-9a-fA-F]{6}$/.test(v) || v === '') applyBrandVar(key, v)
                }}
                className="w-28 px-2 py-1.5 rounded text-xs font-mono border"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                placeholder="Leeg = standaard"
                maxLength={32}
              />
              {settings[key] && (
                <button
                  type="button"
                  onClick={() => {
                    setSettings(s => s ? { ...s, [key]: '' } : s)
                    applyBrandVar(key, '')
                  }}
                  className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: 'var(--border-primary)', color: 'var(--text-muted)' }}
                  title="Wis — gebruik thema-standaard"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {/* Reset button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                const colorKeys = ['brand_bg_primary', 'brand_bg_secondary', 'brand_text_primary', 'brand_text_secondary', 'brand_text_muted', 'brand_nav_bg'] as const
                setSettings(s => s ? { ...s, ...Object.fromEntries(colorKeys.map(k => [k, ''])) } : s)
                colorKeys.forEach(k => applyBrandVar(k, ''))
              }}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}
            >
              Alle kleuren resetten naar standaard
            </button>
          </div>
        </div>
      </section>

      {/* Donkere modus */}
      <section>
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Donkere modus</h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            className="relative w-10 h-6 rounded-full transition-colors"
            style={{ background: settings.disable_dark_mode === 'true' ? 'var(--accent)' : 'var(--border-primary)' }}
            onClick={() => {
              const next = settings.disable_dark_mode === 'true' ? '' : 'true'
              setSettings(s => s ? { ...s, disable_dark_mode: next } : s)
              if (next === 'true') document.documentElement.classList.remove('dark')
            }}
          >
            <div
              className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
              style={{ left: 4, transform: settings.disable_dark_mode === 'true' ? 'translateX(16px)' : 'translateX(0)' }}
            />
          </div>
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Donkere modus uitschakelen</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Dwingt alle gebruikers tot lichte modus, ongeacht hun voorkeur.</div>
          </div>
        </label>
      </section>

      {/* Logo uploads */}
      <section>
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Logo's</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Laat leeg om de standaard ROUTD logo's te gebruiken. SVG of PNG aanbevolen.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {LOGO_SLOTS.map(slot => {
            const currentUrl = settings[slot.key] || DEFAULT_LOGOS[slot.key]
            const isCustom = !!settings[slot.key]
            return (
              <div key={slot.key} className="rounded-xl border p-4 space-y-3"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
                <div>
                  <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{slot.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{slot.hint}</div>
                </div>
                {/* Preview */}
                <div className="flex items-center justify-center rounded-lg p-3"
                  style={{ background: slot.key.includes('light') ? '#1a1a1e' : '#f8fafc', minHeight: 56 }}>
                  <img src={currentUrl} alt={slot.label} style={{ maxHeight: 32, maxWidth: 140, objectFit: 'contain' }} />
                </div>
                {/* Actions */}
                <div className="flex gap-2">
                  <input
                    ref={el => { fileInputs.current[slot.key] = el }}
                    type="file"
                    accept=".jpg,.jpeg,.png,.gif,.webp,.svg"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleLogoUpload(slot.key, file)
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputs.current[slot.key]?.click()}
                    disabled={uploading === slot.key}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                    style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}
                  >
                    {uploading === slot.key
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Upload className="w-3.5 h-3.5" />}
                    Uploaden
                  </button>
                  {isCustom && (
                    <button
                      type="button"
                      onClick={() => handleLogoReset(slot.key)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors text-red-500 hover:bg-red-50"
                      style={{ borderColor: 'var(--border-primary)' }}
                      title="Herstel standaard"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Opslaan */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Opslaan
        </button>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Naam en kleuren zijn direct actief na opslaan. Logo's zijn direct actief na uploaden.
        </p>
      </div>
    </div>
  )
}
