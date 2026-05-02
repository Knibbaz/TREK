import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Globe2, Plus, Trash2, X, MapPin, Utensils, Lightbulb, Bed, Activity, MoreHorizontal } from 'lucide-react'
import { getLocaleForLanguage, useTranslation } from '../i18n'
import { useSettingsStore } from '../store/settingsStore'
import { useAuthStore } from '../store/authStore'
import { worldmapApi } from '../api/client'
import Navbar from '../components/Layout/Navbar'
import { useToast } from '../components/shared/Toast'
import { getAllCountries } from '../i18n/countryNames'

interface WorldMapEntry {
  id: number
  country_code: string
  name: string
  description: string | null
  category: string
  lat: number | null
  lng: number | null
  added_by: number | null
  added_by_username: string | null
  created_at: string
}

const CATEGORIES = ['place', 'food', 'tip', 'accommodation', 'activity', 'other'] as const
type Category = typeof CATEGORIES[number]

const CATEGORY_COLORS: Record<string, string> = {
  place: '#3b82f6',
  food: '#f59e0b',
  tip: '#10b981',
  accommodation: '#8b5cf6',
  activity: '#ef4444',
  other: '#6b7280',
}

function CategoryIcon({ cat, size = 14 }: { cat: string; size?: number }): React.ReactElement {
  const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other
  const style = { color }
  if (cat === 'food') return <Utensils size={size} style={style} />
  if (cat === 'tip') return <Lightbulb size={size} style={style} />
  if (cat === 'accommodation') return <Bed size={size} style={style} />
  if (cat === 'activity') return <Activity size={size} style={style} />
  if (cat === 'other') return <MoreHorizontal size={size} style={style} />
  return <MapPin size={size} style={style} />
}

interface AddFormState {
  name: string
  description: string
  category: Category
}

export default function WorldMapPage(): React.ReactElement {
  const { t, language } = useTranslation()
  const settings = useSettingsStore(s => s.settings)
  const user = useAuthStore(s => s.user)
  const toast = useToast()

  const dm = settings.dark_mode
  const dark = dm === true || dm === 'dark' || (dm === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const geoLayerRef = useRef<L.GeoJSON | null>(null)
  const countryCounts = useRef<Map<string, number>>(new Map())

  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [selectedCountryName, setSelectedCountryName] = useState<string>('')
  const [entries, setEntries] = useState<WorldMapEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<AddFormState>({ name: '', description: '', category: 'place' })
  const [saving, setSaving] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)

  const getCountryName = (code: string): string => {
    const allCountries = getAllCountries(getLocaleForLanguage(language))
    return allCountries.find(c => c.code === code)?.name || code
  }

  // Load country counts for heat-coloring
  const loadCountryCounts = async () => {
    try {
      const data = await worldmapApi.getCountries()
      const map = new Map<string, number>()
      for (const c of (data.countries || [])) map.set(c.country_code, c.count)
      countryCounts.current = map
    } catch {}
  }

  const loadEntries = async (code: string) => {
    setLoadingEntries(true)
    try {
      const data = await worldmapApi.getEntries(code)
      setEntries(data.entries || [])
    } catch {
      toast.error(t('worldmap.addError'))
    } finally {
      setLoadingEntries(false)
    }
  }

  const handleCountryClick = (code: string) => {
    setSelectedCountry(code)
    setSelectedCountryName(getCountryName(code))
    setShowAddForm(false)
    setPanelOpen(true)
    loadEntries(code)
    colorLayer()
  }

  const colorLayer = () => {
    if (!geoLayerRef.current) return
    geoLayerRef.current.eachLayer((layer: any) => {
      const code: string = layer.feature?.properties?.ISO_A2?.toUpperCase()
      const count = countryCounts.current.get(code) || 0
      const isSelected = code === selectedCountry
      layer.setStyle(getCountryStyle(code, count, isSelected, dark))
    })
  }

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }

    const map = L.map(mapRef.current, {
      center: [25, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 8,
      zoomControl: false,
      attributionControl: false,
      maxBounds: [[-90, -220], [90, 220]],
      maxBoundsViscosity: 1.0,
      fadeAnimation: false,
      preferCanvas: true,
    })

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const tileUrl = dark
      ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'

    L.tileLayer(tileUrl, {
      maxZoom: 8,
      tileSize: 256,
      crossOrigin: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
    } as any).addTo(map)

    mapInstance.current = map

    // Load GeoJSON world countries
    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson')
      .then(r => r.json())
      .then(async (geo) => {
        await loadCountryCounts()
        const layer = L.geoJSON(geo as any, {
          style: (feature: any) => {
            const code = feature?.properties?.ISO_A2?.toUpperCase()
            const count = countryCounts.current.get(code) || 0
            return getCountryStyle(code, count, false, dark)
          },
          onEachFeature: (feature: any, lyr: any) => {
            const code: string = feature?.properties?.ISO_A2?.toUpperCase()
            if (!code || code === '-1') return
            lyr.on('click', () => handleCountryClick(code))
            lyr.on('mouseover', () => {
              lyr.setStyle({ weight: 2, opacity: 1, fillOpacity: 0.85 })
            })
            lyr.on('mouseout', () => {
              const count = countryCounts.current.get(code) || 0
              const isSelected = code === selectedCountry
              lyr.setStyle(getCountryStyle(code, count, isSelected, dark))
            })
          },
        })
        layer.addTo(map)
        geoLayerRef.current = layer
      })
      .catch(err => console.error('Failed to load world GeoJSON:', err))

    return () => {
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }
    }
  }, [dark])

  // Recolor when selectedCountry changes
  useEffect(() => {
    if (!geoLayerRef.current) return
    geoLayerRef.current.eachLayer((layer: any) => {
      const code: string = layer.feature?.properties?.ISO_A2?.toUpperCase()
      const count = countryCounts.current.get(code) || 0
      const isSelected = code === selectedCountry
      layer.setStyle(getCountryStyle(code, count, isSelected, dark))
    })
  }, [selectedCountry, dark])

  const handleAdd = async () => {
    if (!selectedCountry || !addForm.name.trim()) return
    setSaving(true)
    try {
      const data = await worldmapApi.addEntry({
        country_code: selectedCountry,
        name: addForm.name.trim(),
        description: addForm.description.trim() || undefined,
        category: addForm.category,
      })
      setEntries(prev => [data.entry, ...prev])
      countryCounts.current.set(selectedCountry, (countryCounts.current.get(selectedCountry) || 0) + 1)
      colorLayer()
      setAddForm({ name: '', description: '', category: 'place' })
      setShowAddForm(false)
      toast.success(t('worldmap.addSuccess'))
    } catch {
      toast.error(t('worldmap.addError'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number, countryCode: string) => {
    if (!window.confirm(t('worldmap.deleteConfirm'))) return
    try {
      await worldmapApi.deleteEntry(id)
      setEntries(prev => prev.filter(e => e.id !== id))
      const prev = countryCounts.current.get(countryCode) || 1
      countryCounts.current.set(countryCode, Math.max(0, prev - 1))
      colorLayer()
      toast.success(t('worldmap.deleteSuccess'))
    } catch {
      toast.error(t('worldmap.deleteError'))
    }
  }

  const tp = dark ? '#f1f5f9' : '#0f172a'
  const tm = dark ? '#94a3b8' : '#64748b'
  const bg = dark ? '#0f172a' : '#ffffff'
  const border = dark ? '#1e293b' : '#e2e8f0'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: bg }}>
      <Navbar />
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {/* Map */}
        <div ref={mapRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />

        {/* Header overlay */}
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 10,
          background: dark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)', borderRadius: 12, padding: '10px 16px',
          border: `1px solid ${border}`, maxWidth: 280,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Globe2 size={18} color={dark ? '#60a5fa' : '#3b82f6'} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: tp }}>{t('worldmap.title')}</div>
              <div style={{ fontSize: 11, color: tm }}>{t('worldmap.subtitle')}</div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        {panelOpen && selectedCountry && (
          <div style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 20, width: 320,
            background: dark ? 'rgba(15,23,42,0.97)' : 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(16px)', borderLeft: `1px solid ${border}`,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Panel header */}
            <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: tp }}>{selectedCountryName}</div>
                <button onClick={() => { setPanelOpen(false); setSelectedCountry(null) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: tm, padding: 4 }}>
                  <X size={18} />
                </button>
              </div>
              <div style={{ fontSize: 12, color: tm }}>
                {entries.length} {t('worldmap.entries')}
              </div>
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  style={{
                    marginTop: 10, display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: '#3b82f6', color: 'white', fontSize: 13, fontWeight: 600,
                  }}>
                  <Plus size={14} />
                  {t('worldmap.addEntry')}
                </button>
              )}
            </div>

            {/* Add form */}
            {showAddForm && (
              <div style={{ padding: 16, borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: tp, marginBottom: 10 }}>
                  {t('worldmap.addTitle')} {selectedCountryName}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    placeholder={t('worldmap.namePlaceholder')}
                    value={addForm.name}
                    onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    style={{
                      padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`,
                      background: dark ? '#1e293b' : '#f8fafc', color: tp, fontSize: 13,
                    }}
                  />
                  <textarea
                    placeholder={t('worldmap.descriptionPlaceholder')}
                    value={addForm.description}
                    rows={2}
                    onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                    style={{
                      padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`,
                      background: dark ? '#1e293b' : '#f8fafc', color: tp, fontSize: 13,
                      resize: 'none',
                    }}
                  />
                  <select
                    value={addForm.category}
                    onChange={e => setAddForm(f => ({ ...f, category: e.target.value as Category }))}
                    style={{
                      padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`,
                      background: dark ? '#1e293b' : '#f8fafc', color: tp, fontSize: 13,
                    }}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{t(`worldmap.cat.${c}`)}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <button
                      onClick={() => setShowAddForm(false)}
                      style={{
                        flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${border}`, background: 'none', color: tm, fontSize: 13,
                      }}>
                      {t('worldmap.cancel')}
                    </button>
                    <button
                      onClick={handleAdd}
                      disabled={saving || !addForm.name.trim()}
                      style={{
                        flex: 1, padding: '8px', borderRadius: 8, cursor: saving ? 'default' : 'pointer',
                        border: 'none', background: '#3b82f6', color: 'white', fontSize: 13, fontWeight: 600,
                        opacity: saving || !addForm.name.trim() ? 0.6 : 1,
                      }}>
                      {saving ? t('worldmap.saving') : t('worldmap.save')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Entry list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {loadingEntries ? (
                <div style={{ textAlign: 'center', padding: 24, color: tm, fontSize: 13 }}>...</div>
              ) : entries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: tm, fontSize: 13 }}>
                  {t('worldmap.noEntries')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {entries.map(entry => (
                    <div key={entry.id} style={{
                      padding: 12, borderRadius: 10, border: `1px solid ${border}`,
                      background: dark ? '#1e293b' : '#f8fafc',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                          <CategoryIcon cat={entry.category} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: tp, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.name}
                          </span>
                        </div>
                        {(entry.added_by === user?.id || user?.role === 'admin') && (
                          <button
                            onClick={() => handleDelete(entry.id, entry.country_code)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2, flexShrink: 0 }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      {entry.description && (
                        <div style={{ marginTop: 4, fontSize: 12, color: tm, lineHeight: 1.4 }}>
                          {entry.description}
                        </div>
                      )}
                      <div style={{ marginTop: 6, fontSize: 11, color: dark ? '#475569' : '#94a3b8' }}>
                        {t('worldmap.addedBy')} {entry.added_by_username || '?'} · {new Date(entry.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hint when no country selected */}
        {!panelOpen && (
          <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
            background: dark ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(10px)', borderRadius: 99, padding: '8px 20px',
            border: `1px solid ${border}`, fontSize: 12, color: tm, pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            {t('worldmap.selectCountry')}
          </div>
        )}
      </div>
    </div>
  )
}

function getCountryStyle(code: string, count: number, isSelected: boolean, dark: boolean): L.PathOptions {
  if (isSelected) {
    return { fillColor: '#3b82f6', fillOpacity: 0.75, color: '#1d4ed8', weight: 2, opacity: 1 }
  }
  if (count === 0) {
    return {
      fillColor: dark ? '#1e293b' : '#e2e8f0',
      fillOpacity: 0.6, color: dark ? '#334155' : '#cbd5e1', weight: 0.5, opacity: 0.8,
    }
  }
  // Heat: more entries = more saturated green
  const intensity = Math.min(count / 10, 1)
  const r = Math.round(16 + (34 - 16) * (1 - intensity))
  const g = Math.round(185 + (197 - 185) * intensity)
  const b = Math.round(129 + (94 - 129) * intensity)
  return {
    fillColor: `rgb(${r},${g},${b})`,
    fillOpacity: 0.5 + intensity * 0.3,
    color: dark ? '#334155' : '#cbd5e1',
    weight: 0.5, opacity: 0.8,
  }
}
