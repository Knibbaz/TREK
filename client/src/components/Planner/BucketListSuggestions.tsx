import { useEffect, useState } from 'react'
import apiClient from '../../api/client'
import { useTranslation } from '../../i18n'
import { Sparkles, Plus, ChevronDown, ChevronRight, MapPin } from 'lucide-react'

interface BucketSuggestion {
  id: number
  name: string
  lat: number | null
  lng: number | null
  country_code: string
  notes: string | null
}

/**
 * Surfaces the user's per-country bucket list (Atlas) while planning a trip:
 * once the trip has places, the server derives the dominant country and returns
 * matching wishlist items. Clicking one prefills the add-place form.
 */
export function BucketListSuggestions({ tripId, placeCount, onAdd }: {
  tripId: number
  placeCount: number
  onAdd?: (item: { lat: number; lng: number; name: string }) => void
}) {
  const { t } = useTranslation()
  const [items, setItems] = useState<BucketSuggestion[]>([])
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (!tripId || placeCount === 0) { setItems([]); return }
    let cancelled = false
    apiClient.get(`/trips/${tripId}/bucket-list-suggestions`)
      .then(r => { if (!cancelled) setItems(r.data.items || []) })
      .catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [tripId, placeCount])

  if (items.length === 0) return null

  return (
    <div className="border-b border-edge-faint" style={{ flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 text-content-secondary"
        style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}
      >
        <Sparkles size={13} className="text-accent" />
        <span>{t('bucketList.suggestionsTitle')}</span>
        <span className="text-content-faint" style={{ fontWeight: 500 }}>({items.length})</span>
        <span style={{ marginLeft: 'auto' }}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map(it => (
            <div key={it.id} className="bg-surface-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8 }}>
              <MapPin size={13} className="text-content-faint" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-content" style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                {it.notes && <div className="text-content-faint" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.notes}</div>}
              </div>
              {onAdd && it.lat != null && it.lng != null && (
                <button
                  onClick={() => onAdd({ lat: it.lat!, lng: it.lng!, name: it.name })}
                  className="bg-accent text-accent-text"
                  aria-label={t('places.addPlace')}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, flexShrink: 0 }}
                >
                  <Plus size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
