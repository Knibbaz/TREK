import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

/**
 * Leaflet measures its container exactly once, on mount. With SPA navigation
 * the flex/grid layout often settles a frame later, so the map ends up with a
 * 0×0 (or stale) size and only renders after a manual page reload. This
 * re-measures on every container resize and once shortly after mount.
 */
export function SizeInvalidator() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    const tid = window.setTimeout(() => map.invalidateSize(), 50)
    return () => { ro.disconnect(); window.clearTimeout(tid) }
  }, [map])
  return null
}
