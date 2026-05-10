import type { RouteResult, RouteSegment, Waypoint } from '../../types'

const OSRM_BASE = 'https://router.project-osrm.org/route/v1'

/** Haversine distance in meters between two lat/lng points. */
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000 // Earth radius in meters
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const c =
    2 *
    Math.atan2(
      Math.sqrt(sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng),
      Math.sqrt(1 - (sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng))
    )
  return R * c
}

/** Estimate flight duration in seconds (taxi + cruise + descent). */
function flightDuration(distanceMeters: number): number {
  const km = distanceMeters / 1000
  if (km < 500) return (km / 400) * 3600 // short hop, lower average speed
  // ~1h ground time + cruise at ~850 km/h
  return 3600 + (km / 850) * 3600
}

/** Build a straight-line (geodesic) polyline between two points. */
function straightLine(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  segments = 20
): [number, number][] {
  const coords: [number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    // Simple lerp works fine for visual straight lines at typical zooms;
    // for a true geodesic we'd use spherical interpolation, but lerp is
    // visually indistinguishable for short-to-medium map distances.
    coords.push([from.lat + (to.lat - from.lat) * t, from.lng + (to.lng - from.lng) * t])
  }
  return coords
}

/** Detect whether a segment should be treated as a flight. */
function isFlightSegment(a: Waypoint, b: Waypoint): boolean {
  const d = haversine(a, b)
  // Long-distance (>500 km) or crossing a significant body of water
  // where land routing makes no sense (e.g. Amsterdam → Tenerife).
  // 500 km is roughly the max sensible high-speed rail / ferry distance.
  return d > 500_000
}

/** Choose the best OSRM profile for a local (non-flight) segment. */
function autoProfile(distanceMeters: number): 'walking' | 'driving' {
  // Under 2 km → walking is realistic
  // 2–500 km → driving (or cycling, but driving covers both)
  return distanceMeters < 2000 ? 'walking' : 'driving'
}

/**
 * Fetches a route via OSRM. Automatically treats very long segments
 * (>500 km) as flights (straight line + estimated air time) instead of
 * trying to route over land. Falls back to driving for medium distances
 * and walking for very short ones.
 */
export async function calculateRoute(
  waypoints: Waypoint[],
  profile?: 'driving' | 'walking' | 'cycling' | 'auto',
  { signal }: { signal?: AbortSignal } = {}
): Promise<RouteResult> {
  if (!waypoints || waypoints.length < 2) {
    throw new Error('At least 2 waypoints required')
  }

  const effectiveProfile = profile ?? 'auto'

  // If auto: split waypoints into clusters separated by flight segments
  if (effectiveProfile === 'auto') {
    return calculateHybridRoute(waypoints, signal)
  }

  // Legacy manual-profile path (used when caller explicitly forces a profile)
  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(';')
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
  const coordinates: [number, number][] = route.geometry.coordinates.map(
    ([lng, lat]: [number, number]) => [lat, lng]
  )

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

/** Hybrid route: uses OSRM for local segments and straight lines for flights. */
async function calculateHybridRoute(
  waypoints: Waypoint[],
  signal?: AbortSignal
): Promise<RouteResult> {
  let allCoordinates: [number, number][] = []
  let totalDistance = 0
  let totalDuration = 0
  let totalWalkingDuration = 0
  let totalDrivingDuration = 0

  // Add starting point
  allCoordinates.push([waypoints[0].lat, waypoints[0].lng])

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]
    const to = waypoints[i + 1]
    const segDist = haversine(from, to)

    if (isFlightSegment(from, to)) {
      // Flight segment: straight line + estimated flight time
      const flightCoords = straightLine(from, to)
      // Skip first point to avoid duplicates
      allCoordinates.push(...flightCoords.slice(1))
      const airTime = flightDuration(segDist)
      totalDistance += segDist
      totalDuration += airTime
      totalWalkingDuration += segDist / (5000 / 3600) // not meaningful, but consistent
      totalDrivingDuration += airTime
    } else {
      // Local segment: OSRM
      const segProfile = autoProfile(segDist)
      const coordsStr = `${from.lng},${from.lat};${to.lng},${to.lat}`
      const url = `${OSRM_BASE}/${segProfile}/${coordsStr}?overview=full&geometries=geojson&steps=false`

      try {
        const res = await fetch(url, { signal })
        if (res.ok) {
          const data = await res.json()
          if (data.code === 'Ok' && data.routes?.[0]) {
            const route = data.routes[0]
            const coords: [number, number][] = route.geometry.coordinates.map(
              ([lng, lat]: [number, number]) => [lat, lng]
            )
            allCoordinates.push(...coords.slice(1)) // avoid duplicate start
            totalDistance += route.distance
            totalDuration +=
              segProfile === 'walking' ? route.distance / (5000 / 3600) : route.duration
            totalWalkingDuration += route.distance / (5000 / 3600)
            totalDrivingDuration += route.duration
            continue
          }
        }
      } catch {
        /* OSRM failed – fall through to straight line */
      }
      // Fallback: straight line if OSRM fails
      const fallbackCoords = straightLine(from, to, 10)
      allCoordinates.push(...fallbackCoords.slice(1))
      const estDuration = segDist / (segProfile === 'walking' ? 5000 / 3600 : 25000 / 3600)
      totalDistance += segDist
      totalDuration += estDuration
      totalWalkingDuration += segDist / (5000 / 3600)
      totalDrivingDuration += estDuration
    }
  }

  return {
    coordinates: allCoordinates,
    distance: totalDistance,
    duration: totalDuration,
    distanceText: formatDistance(totalDistance),
    durationText: formatDuration(totalDuration),
    walkingText: formatDuration(totalWalkingDuration),
    drivingText: formatDuration(totalDrivingDuration),
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

function euclideanDist(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
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
      const d = euclideanDist(p, endAnchor)
      if (d < minD) { minD = d; forcedLastIdx = i }
    })
  }

  // Determine start: place closest to startAnchor, excluding the forced-last place
  let startIdx = 0
  if (startAnchor) {
    let minD = Infinity
    valid.forEach((p, i) => {
      if (i === forcedLastIdx) return
      const d = euclideanDist(p, startAnchor)
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
      const d = euclideanDist(valid[i], current)
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

/** Fetches per-leg distance/duration from OSRM and returns segment metadata (midpoints, walking/driving times).
 *  Automatically treats long-distance segments as flights. */
export async function calculateSegments(
  waypoints: Waypoint[],
  { signal }: { signal?: AbortSignal } = {}
): Promise<RouteSegment[]> {
  if (!waypoints || waypoints.length < 2) return []

  const segments: RouteSegment[] = []

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]
    const to = waypoints[i + 1]
    const segDist = haversine(from, to)

    const fromCoord: [number, number] = [from.lat, from.lng]
    const toCoord: [number, number] = [to.lat, to.lng]
    const mid: [number, number] = [(fromCoord[0] + toCoord[0]) / 2, (fromCoord[1] + toCoord[1]) / 2]

    if (isFlightSegment(from, to)) {
      const airTime = flightDuration(segDist)
      segments.push({
        mid,
        from: fromCoord,
        to: toCoord,
        walkingText: formatDuration(segDist / (5000 / 3600)),
        drivingText: formatDuration(airTime),
        distance: segDist,
        distanceText: formatDistance(segDist),
      })
      continue
    }

    // Local segment via OSRM
    const segProfile = autoProfile(segDist)
    const coordsStr = `${from.lng},${from.lat};${to.lng},${to.lat}`
    const url = `${OSRM_BASE}/${segProfile}/${coordsStr}?overview=false&geometries=geojson&steps=false&annotations=distance,duration`

    try {
      const res = await fetch(url, { signal })
      if (res.ok) {
        const data = await res.json()
        if (data.code === 'Ok' && data.routes?.[0]?.legs?.[0]) {
          const leg = data.routes[0].legs[0]
          const walkingDuration = leg.distance / (5000 / 3600)
          segments.push({
            mid,
            from: fromCoord,
            to: toCoord,
            walkingText: formatDuration(walkingDuration),
            drivingText: formatDuration(leg.duration),
            distance: leg.distance,
            distanceText: formatDistance(leg.distance),
          })
          continue
        }
      }
    } catch {
      /* OSRM failed */
    }

    // Fallback
    const estDuration = segDist / (segProfile === 'walking' ? 5000 / 3600 : 25000 / 3600)
    segments.push({
      mid,
      from: fromCoord,
      to: toCoord,
      walkingText: formatDuration(segDist / (5000 / 3600)),
      drivingText: formatDuration(estDuration),
      distance: segDist,
      distanceText: formatDistance(segDist),
    })
  }

  return segments
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
