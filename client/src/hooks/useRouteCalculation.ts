import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useTripStore } from '../store/tripStore'
import { calculateSegments, calculateRoute } from '../components/Map/RouteCalculator'
import type { TripStoreState } from '../store/tripStore'
import type { RouteSegment, RouteResult } from '../types'

const TRANSPORT_TYPES = ['flight', 'train', 'bus', 'car', 'cruise']

/** Builds segments (arrays of [lat,lng] points) from a flat ordered list of entries,
 *  breaking the current segment whenever a transport entry is encountered. */
function buildSegments(
  entries: ({ kind: 'place'; lat: number; lng: number } | { kind: 'transport' })[]
): [number, number][][] {
  const segments: [number, number][][] = []
  let currentSeg: [number, number][] = []
  for (const entry of entries) {
    if (entry.kind === 'place') {
      currentSeg.push([entry.lat, entry.lng])
    } else {
      if (currentSeg.length >= 2) segments.push([...currentSeg])
      currentSeg = []
    }
  }
  if (currentSeg.length >= 2) segments.push(currentSeg)
  return segments
}

/** Parses route_geometry JSON from place entries and returns them as additional map segments.
 *  These are GPX/KML tracks stored on a place — they are shown as-is alongside the OSRM route. */
function extractGpxSegments(
  entries: ({ kind: 'place'; route_geometry?: string } | { kind: 'transport' })[]
): [number, number][][] {
  const result: [number, number][][] = []
  for (const entry of entries) {
    if (entry.kind !== 'place' || !entry.route_geometry) continue
    try {
      const pts = JSON.parse(entry.route_geometry) as number[][]
      if (pts.length >= 2) result.push(pts.map(p => [p[0], p[1]] as [number, number]))
    } catch {}
  }
  return result
}

/** Fetches actual road geometry from OSRM for each segment group and returns road coordinates.
 *  Falls back to the original straight-line segment if OSRM fails for that segment. */
async function fetchRoadSegments(
  segments: [number, number][][],
  signal: AbortSignal
): Promise<[number, number][][]> {
  return Promise.all(
    segments.map(seg =>
      calculateRoute(
        seg.map(([lat, lng]) => ({ lat, lng })),
        'driving',
        { signal }
      )
        .then(r => r.coordinates)
        .catch(() => seg)
    )
  )
}

/**
 * Manages route calculation state.
 * - When selectedDayId is set: shows the route for that day only.
 * - When selectedDayId is null: shows a combined route across all days.
 * Straight lines are shown immediately as a fallback; OSRM road geometry replaces them
 * once the async fetch resolves. Aborts in-flight requests when the day changes.
 */
export function useRouteCalculation(tripStore: TripStoreState, selectedDayId: number | null) {
  const [route, setRoute] = useState<[number, number][][] | null>(null)
  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null)
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([])
  const [isCalculating, setIsCalculating] = useState(false)
  const routeCalcEnabled = useSettingsStore((s) => s.settings.route_calculation) !== false
  const routeAbortRef = useRef<AbortController | null>(null)
  const calcGenRef = useRef(0)
  const reservationsForSignature = useTripStore((s) => s.reservations)

  const updateRouteForDay = useCallback(async (dayId: number | null, connectDays = false) => {
    if (routeAbortRef.current) routeAbortRef.current.abort()
    const myGen = ++calcGenRef.current
    setIsCalculating(true)
    try {
    // ── inner ──────────────────────────────────────────────────────────────

    const currentAssignments = useTripStore.getState().assignments || {}
    const allReservations = useTripStore.getState().reservations || []
    const allDays = useTripStore.getState().days || []
    const dayOrder = (id: number | null | undefined): number | null => {
      if (id == null) return null
      const d = allDays.find(x => x.id === id)
      return d ? ((d as any).day_number ?? allDays.indexOf(d)) : null
    }

    type Entry = { kind: 'place'; lat: number; lng: number; route_geometry?: string } | { kind: 'transport' }

    if (!dayId) {
      // ── No day selected: build combined route across all days ──────────────
      const sortedDays = [...allDays].sort((a, b) => {
        const oa = (a as any).day_number ?? allDays.indexOf(a)
        const ob = (b as any).day_number ?? allDays.indexOf(b)
        return oa - ob
      })

      const allEntries: Entry[] = []
      const allWaypoints: { lat: number; lng: number }[] = []

      for (const day of sortedDays) {
        const da = (currentAssignments[String(day.id)] || [])
          .slice()
          .sort((a, b) => a.order_index - b.order_index)

        const thisOrder = dayOrder(day.id)
        const dayTransports = thisOrder == null ? [] : allReservations.filter(r => {
          if (!TRANSPORT_TYPES.includes(r.type)) return false
          if (r.day_id == null) return false
          const endId = r.end_day_id ?? r.day_id
          if (r.day_id === endId) {
            if (r.day_id !== day.id) return false
          } else {
            const so = dayOrder(r.day_id), eo = dayOrder(endId)
            if (so == null || eo == null) return false
            if (thisOrder < so || thisOrder > eo) return false
          }
          const pos = r.day_positions?.[day.id] ?? r.day_positions?.[String(day.id)] ?? r.day_plan_position
          return pos != null
        })

        const dayEntries: (Entry & { pos: number })[] = [
          ...da.filter(a => a.place?.lat != null && a.place?.lng != null).map(a => ({
            kind: 'place' as const, lat: a.place.lat!, lng: a.place.lng!,
            route_geometry: a.place.route_geometry || undefined, pos: a.order_index,
          })),
          ...dayTransports.map(r => ({
            kind: 'transport' as const,
            pos: (r.day_positions?.[day.id] ?? r.day_positions?.[String(day.id)] ?? r.day_plan_position) as number,
          })),
        ].sort((a, b) => a.pos - b.pos)

        // Between days: insert a transport break so day boundaries split the route
        // (skipped in connectDays mode so the overview shows one continuous route)
        if (!connectDays && allEntries.length > 0 && dayEntries.some(e => e.kind === 'place')) {
          allEntries.push({ kind: 'transport' })
        }
        allEntries.push(...dayEntries)
        da.filter(a => a.place?.lat != null && a.place?.lng != null).forEach(a =>
          allWaypoints.push({ lat: a.place.lat!, lng: a.place.lng! })
        )
      }

      const segments = buildSegments(allEntries)
      const gpxSegs = extractGpxSegments(allEntries)
      if (segments.length === 0 && gpxSegs.length === 0) { setRoute(null); setRouteSegments([]); return }
      setRoute([...segments, ...gpxSegs])
      if (!routeCalcEnabled) { setRouteSegments([]); return }
      const controller = new AbortController()
      routeAbortRef.current = controller
      try {
        const [roadSegs, calcSegs] = await Promise.all([
          fetchRoadSegments(segments, controller.signal),
          allWaypoints.length >= 2
            ? calculateSegments(allWaypoints, { signal: controller.signal })
            : Promise.resolve([] as RouteSegment[]),
        ])
        if (!controller.signal.aborted) {
          setRoute([...(roadSegs.length > 0 ? roadSegs : segments), ...gpxSegs].length > 0
            ? [...(roadSegs.length > 0 ? roadSegs : segments), ...gpxSegs] : null)
          setRouteSegments(calcSegs)
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') setRouteSegments([])
        else if (!(err instanceof Error)) setRouteSegments([])
      }
      return
    }

    // ── Day selected: show route for that day only ──────────────────────────
    const da = (currentAssignments[String(dayId)] || []).slice().sort((a, b) => a.order_index - b.order_index)
    const thisOrder = dayOrder(dayId)

    const dayTransports = thisOrder == null ? [] : allReservations.filter(r => {
      if (!TRANSPORT_TYPES.includes(r.type)) return false
      const startId = r.day_id
      if (startId == null) return false
      const endId = r.end_day_id ?? startId
      if (startId === endId) {
        if (startId !== dayId) return false
      } else {
        const startOrder = dayOrder(startId)
        const endOrder = dayOrder(endId)
        if (startOrder == null || endOrder == null) return false
        if (thisOrder < startOrder || thisOrder > endOrder) return false
      }
      const pos = r.day_positions?.[dayId] ?? r.day_positions?.[String(dayId)] ?? r.day_plan_position
      return pos != null
    })

    const entries: (Entry & { pos: number })[] = [
      ...da.filter(a => a.place?.lat != null && a.place?.lng != null).map(a => ({
        kind: 'place' as const, lat: a.place.lat!, lng: a.place.lng!,
        route_geometry: a.place.route_geometry || undefined, pos: a.order_index,
      })),
      ...dayTransports.map(r => ({
        kind: 'transport' as const,
        pos: (r.day_positions?.[dayId] ?? r.day_positions?.[String(dayId)] ?? r.day_plan_position) as number,
      })),
    ].sort((a, b) => a.pos - b.pos)

    const segments = buildSegments(entries)
    const gpxSegs = extractGpxSegments(entries)
    const geocodedWaypoints = da.map(a => a.place).filter(p => p?.lat != null && p?.lng != null) as { lat: number; lng: number }[]

    if (segments.length === 0 && geocodedWaypoints.length < 2 && gpxSegs.length === 0) {
      setRoute(null); setRouteSegments([]); return
    }
    setRoute([...(segments.length > 0 ? segments : []), ...gpxSegs].length > 0
      ? [...(segments.length > 0 ? segments : []), ...gpxSegs] : null)
    if (!routeCalcEnabled) { setRouteSegments([]); return }
    const controller = new AbortController()
    routeAbortRef.current = controller
    try {
      const [roadSegs, calcSegs] = await Promise.all([
        fetchRoadSegments(segments, controller.signal),
        calculateSegments(geocodedWaypoints, { signal: controller.signal }),
      ])
      if (!controller.signal.aborted) {
        setRoute([...(roadSegs.length > 0 ? roadSegs : segments), ...gpxSegs].length > 0
          ? [...(roadSegs.length > 0 ? roadSegs : segments), ...gpxSegs] : null)
        setRouteSegments(calcSegs)
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') setRouteSegments([])
      else if (!(err instanceof Error)) setRouteSegments([])
    }
    // ── end inner ──────────────────────────────────────────────────────────
    } finally {
      if (myGen === calcGenRef.current) setIsCalculating(false)
    }
  }, [routeCalcEnabled])

  // Stable signature for transport reservations on the selected day
  const transportSignature = useMemo(() => {
    if (!selectedDayId) return ''
    return reservationsForSignature
      .filter(r => TRANSPORT_TYPES.includes(r.type))
      .map(r => {
        const pos = r.day_positions?.[selectedDayId] ?? r.day_positions?.[String(selectedDayId)] ?? r.day_plan_position
        return `${r.id}:${r.day_id ?? ''}:${r.end_day_id ?? ''}:${r.reservation_time ?? ''}:${pos ?? ''}`
      })
      .sort()
      .join('|')
  }, [reservationsForSignature, selectedDayId])

  const selectedDayAssignments = selectedDayId ? tripStore.assignments?.[String(selectedDayId)] : null
  const allAssignmentsSignature = !selectedDayId
    ? Object.values(tripStore.assignments || {}).flat().map(a => `${a.id}:${a.order_index}`).join('|')
    : null

  useEffect(() => {
    updateRouteForDay(selectedDayId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayId, selectedDayAssignments, allAssignmentsSignature, transportSignature])

  return { route, routeSegments, routeInfo, setRoute, setRouteInfo, updateRouteForDay, isCalculating }
}
