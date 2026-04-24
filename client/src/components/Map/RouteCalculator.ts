import type { RouteResult, RouteSegment, Waypoint } from '../../types'
import { getCachedLeg, setCachedLeg, getCachedSegments, setCachedSegments } from '../../services/routeCache'

const OSRM_BASE = 'https://router.project-osrm.org/route/v1'

/** Fetches a full route via OSRM for a single leg, with cache lookup first. */
async function fetchSingleLeg(
  from: Waypoint,
  to: Waypoint,
  profile: 'driving' | 'walking' | 'cycling',
  signal?: AbortSignal
): Promise<RouteResult> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`
  const url = `${OSRM_BASE}/${profile}/${coords}?overview=full&geometries=geojson&steps=false`

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error('Route could not be calculated')
  }

  const data = await response.json()

  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error('No route found')
  }

  const route = data.routes[0]
  const coordinates: [number, number][] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng])

  const distance: number = route.distance
  let duration: number
  if (profile === 'walking') {
    duration = distance / (5000 / 3600)
  } else if (profile === 'cycling') {
    duration = distance / (15000 / 3600)
  } else {
    duration = route.duration
  }

  const walkingDuration = distance / (5000 / 3600)
  const drivingDuration: number = route.duration

  return {
    coordinates,
    distance,
    duration,
    distanceText: formatDistance(distance),
    durationText: formatDuration(duration),
    walkingText: formatDuration(walkingDuration),
    drivingText: formatDuration(drivingDuration),
  }
}

/** Calculates a route for a list of waypoints.
 *  Caches each leg individually so only changed legs need a network request. */
export async function calculateRoute(
  waypoints: Waypoint[],
  profile: 'driving' | 'walking' | 'cycling' = 'driving',
  { signal }: { signal?: AbortSignal } = {}
): Promise<RouteResult> {
  if (!waypoints || waypoints.length < 2) {
    throw new Error('At least 2 waypoints required')
  }

  // For single-leg routes, use the simple cache
  if (waypoints.length === 2) {
    const cached = await getCachedLeg(waypoints[0], waypoints[1])
    if (cached) return cached
    const result = await fetchSingleLeg(waypoints[0], waypoints[1], profile, signal)
    await setCachedLeg(waypoints[0], waypoints[1], result)
    return result
  }

  // Multi-leg: try cache for each individual leg, fetch misses
  const legResults: RouteResult[] = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (signal?.aborted) throw new Error('AbortError')
    const from = waypoints[i]
    const to = waypoints[i + 1]
    const cached = await getCachedLeg(from, to)
    if (cached) {
      legResults.push(cached)
      continue
    }
    const result = await fetchSingleLeg(from, to, profile, signal)
    await setCachedLeg(from, to, result)
    legResults.push(result)
  }

  // Merge legs into a single RouteResult
  const coordinates: [number, number][] = []
  let totalDistance = 0
  let totalDuration = 0
  for (const leg of legResults) {
    // Avoid duplicating the shared waypoint between legs
    if (coordinates.length > 0 && leg.coordinates.length > 0) {
      coordinates.push(...leg.coordinates.slice(1))
    } else {
      coordinates.push(...leg.coordinates)
    }
    totalDistance += leg.distance
    totalDuration += leg.duration
  }

  const walkingDuration = totalDistance / (5000 / 3600)

  return {
    coordinates,
    distance: totalDistance,
    duration: totalDuration,
    distanceText: formatDistance(totalDistance),
    durationText: formatDuration(totalDuration),
    walkingText: formatDuration(walkingDuration),
    drivingText: formatDuration(totalDuration),
  }
}

export function generateGoogleMapsUrl(places: Waypoint[]): string | null {
  const valid = places.filter((p) => p.lat && p.lng)
  if (valid.length === 0) return null
  if (valid.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${valid[0].lat},${valid[0].lng}`
  }
  const stops = valid.map((p) => `${p.lat},${p.lng}`).join('/')
  return `https://www.google.com/maps/dir/${stops}`
}

function dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.sqrt(Math.pow(a.lat - b.lat, 2) + Math.pow(a.lng - b.lng, 2))
}

/**
 * Reorders waypoints using a nearest-neighbor heuristic to minimize total Euclidean distance.
 * Optional anchors from adjacent days:
 *   - startAnchor: last place of the previous day → start from the place nearest to it
 *   - endAnchor:   first place of the next day → ensure the route ends at the place nearest to it
 */
export function optimizeRoute(
  places: Waypoint[],
  options?: { startAnchor?: Waypoint; endAnchor?: Waypoint }
): Waypoint[] {
  const valid = places.filter((p) => p.lat && p.lng)
  if (valid.length <= 2) return places

  const { startAnchor, endAnchor } = options ?? {}

  // If endAnchor is given, pre-select the place closest to it as the forced last stop
  let forcedLastIdx: number | null = null
  if (endAnchor) {
    let minD = Infinity
    valid.forEach((p, i) => {
      const d = dist(p, endAnchor)
      if (d < minD) { minD = d; forcedLastIdx = i }
    })
  }

  // Determine start: place closest to startAnchor, excluding the forced-last place
  let startIdx = 0
  if (startAnchor) {
    let minD = Infinity
    valid.forEach((p, i) => {
      if (i === forcedLastIdx) return
      const d = dist(p, startAnchor)
      if (d < minD) { minD = d; startIdx = i }
    })
  } else if (forcedLastIdx === 0) {
    // startAnchor not set but index 0 is reserved for last → start from 1
    startIdx = 1
  }

  const visited = new Set<number>()
  const result: Waypoint[] = []

  if (forcedLastIdx !== null) visited.add(forcedLastIdx)
  visited.add(startIdx)
  let current = valid[startIdx]
  result.push(current)

  while (result.length < valid.length - (forcedLastIdx !== null ? 1 : 0)) {
    let nearestIdx = -1
    let minDist = Infinity
    for (let i = 0; i < valid.length; i++) {
      if (visited.has(i)) continue
      const d = dist(valid[i], current)
      if (d < minDist) { minDist = d; nearestIdx = i }
    }
    if (nearestIdx === -1) break
    visited.add(nearestIdx)
    current = valid[nearestIdx]
    result.push(current)
  }

  // Append forced-last place at the end
  if (forcedLastIdx !== null) result.push(valid[forcedLastIdx])

  return result
}

/** Fetches per-leg distance/duration from OSRM and returns segment metadata.
 *  Uses the cache for individual legs; only fetches missing legs. */
export async function calculateSegments(
  waypoints: Waypoint[],
  { signal }: { signal?: AbortSignal } = {}
): Promise<RouteSegment[]> {
  if (!waypoints || waypoints.length < 2) return []

  // Check cache first
  const cached = await getCachedSegments(waypoints)
  const allHit = cached.every(c => c !== null)
  if (allHit) {
    return cached as RouteSegment[]
  }

  // Determine which legs are missing from cache
  const missingIndices: number[] = []
  cached.forEach((c, i) => { if (!c) missingIndices.push(i) })

  if (missingIndices.length === 0) {
    return cached as RouteSegment[]
  }

  // If only a few legs are missing, fetch them individually (uses per-leg cache)
  // If many are missing, do a single batch request for efficiency
  const useBatch = missingIndices.length > 2 && waypoints.length > 3

  if (useBatch) {
    const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(';')
    const url = `${OSRM_BASE}/driving/${coords}?overview=false&geometries=geojson&steps=false&annotations=distance,duration`

    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error('Route could not be calculated')

    const data = await response.json()
    if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No route found')

    const legs = data.routes[0].legs
    const segments: RouteSegment[] = legs.map((leg: { distance: number; duration: number }, i: number): RouteSegment => {
      const from: [number, number] = [waypoints[i].lat, waypoints[i].lng]
      const to: [number, number] = [waypoints[i + 1].lat, waypoints[i + 1].lng]
      const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
      const walkingDuration = leg.distance / (5000 / 3600)
      return {
        mid, from, to,
        walkingText: formatDuration(walkingDuration),
        drivingText: formatDuration(leg.duration),
      }
    })

    // Cache the newly fetched segments
    await setCachedSegments(waypoints, segments)
    // Also cache individual leg geometries for route display
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i]
      const geometry = data.routes[0].geometry?.coordinates
        ?.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
      if (geometry && geometry.length >= 2) {
        await setCachedLeg(waypoints[i], waypoints[i + 1], {
          coordinates: geometry,
          distance: leg.distance,
          duration: leg.duration,
          distanceText: formatDistance(leg.distance),
          durationText: formatDuration(leg.duration),
          walkingText: formatDuration(leg.distance / (5000 / 3600)),
          drivingText: formatDuration(leg.duration),
        })
      }
    }
    return segments
  }

  // Fetch missing legs individually (benefits from per-leg cache)
  const results: RouteSegment[] = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (signal?.aborted) throw new Error('AbortError')
    if (cached[i]) {
      results.push(cached[i]!)
      continue
    }
    const from = waypoints[i]
    const to = waypoints[i + 1]
    const result = await fetchSingleLeg(from, to, 'driving', signal)
    await setCachedLeg(from, to, result)
    const mid: [number, number] = [(from.lat + to.lat) / 2, (from.lng + to.lng) / 2]
    results.push({
      mid,
      from: [from.lat, from.lng],
      to: [to.lat, to.lng],
      walkingText: result.walkingText,
      drivingText: result.drivingText,
    })
  }
  await setCachedSegments(waypoints, results)
  return results
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }
  return `${(meters / 1000).toFixed(1)} km`
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) {
    return `${h} h ${m} min`
  }
  return `${m} min`
}
