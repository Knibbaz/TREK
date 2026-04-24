import { offlineDb } from '../db/offlineDb';
import type { RouteResult, RouteSegment, Waypoint } from '../types';

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Round a coordinate to 5 decimal places (~1m) for stable cache keys. */
function round5(n: number): number {
  return Math.round(n * 100000) / 100000;
}

/** Build a deterministic cache key for a leg (from → to). */
export function legKey(from: Waypoint, to: Waypoint): string {
  return `${round5(from.lat)},${round5(from.lng)};${round5(to.lat)},${round5(to.lng)}`;
}

/** Check if the cache entry is still fresh. */
function isFresh(entry: { cachedAt: number }): boolean {
  return Date.now() - entry.cachedAt < TTL_MS;
}

// ── Per-leg route geometry cache ────────────────────────────────────────────

/** Look up a cached route result for a single leg. */
export async function getCachedLeg(
  from: Waypoint,
  to: Waypoint
): Promise<RouteResult | null> {
  const key = legKey(from, to);
  const row = await offlineDb.routeCache.get(key);
  if (!row || !isFresh(row)) return null;
  try {
    const coordinates: [number, number][] = JSON.parse(row.coordinates);
    return {
      coordinates,
      distance: row.distance,
      duration: row.duration,
      distanceText: row.distanceText,
      durationText: row.durationText,
      walkingText: row.walkingText,
      drivingText: row.drivingText,
    };
  } catch {
    return null;
  }
}

/** Store a route result for a single leg. */
export async function setCachedLeg(
  from: Waypoint,
  to: Waypoint,
  result: RouteResult
): Promise<void> {
  const key = legKey(from, to);
  await offlineDb.routeCache.put({
    key,
    coordinates: JSON.stringify(result.coordinates),
    distance: result.distance,
    duration: result.duration,
    distanceText: result.distanceText,
    durationText: result.durationText,
    walkingText: result.walkingText,
    drivingText: result.drivingText,
    cachedAt: Date.now(),
  });
}

/** Remove stale entries from the route cache. */
export async function evictStaleRoutes(): Promise<void> {
  const cutoff = Date.now() - TTL_MS;
  await offlineDb.routeCache.where('cachedAt').below(cutoff).delete();
}

// ── Batch helpers for segment calculations ──────────────────────────────────

/** Look up cached segments for a list of waypoints.
 *  Returns a sparse array: index i has the segment from waypoint i → i+1.
 *  Missing entries mean a cache miss for that leg. */
export async function getCachedSegments(
  waypoints: Waypoint[]
): Promise<(RouteSegment | null)[]> {
  const results: (RouteSegment | null)[] = new Array(Math.max(0, waypoints.length - 1)).fill(null);
  if (waypoints.length < 2) return results;

  const keys = waypoints.slice(0, -1).map((from, i) => legKey(from, waypoints[i + 1]));
  const rows = await offlineDb.routeCache.where('key').anyOf(keys).toArray();

  for (const row of rows) {
    if (!isFresh(row)) continue;
    const idx = keys.indexOf(row.key);
    if (idx === -1) continue;
    const from = waypoints[idx];
    const to = waypoints[idx + 1];
    try {
      const mid: [number, number] = [(from.lat + to.lat) / 2, (from.lng + to.lng) / 2];
      results[idx] = {
        mid,
        from: [from.lat, from.lng],
        to: [to.lat, to.lng],
        walkingText: row.walkingText,
        drivingText: row.drivingText,
      };
    } catch {
      // ignore parse errors
    }
  }
  return results;
}

/** Store segments for a list of waypoints.
 *  Accepts an array of RouteSegments aligned with waypoints[i] → waypoints[i+1].
 *  Also stores the full coordinate geometry if a RouteResult is provided per leg. */
export async function setCachedSegments(
  waypoints: Waypoint[],
  segments: RouteSegment[]
): Promise<void> {
  if (waypoints.length < 2 || segments.length === 0) return;
  const now = Date.now();
  const entries = segments
    .map((seg, i) => {
      if (!seg || i >= waypoints.length - 1) return null;
      const from = waypoints[i];
      const to = waypoints[i + 1];
      return {
        key: legKey(from, to),
        coordinates: '[]', // segments don't store full geometry; geometry is cached via setCachedLeg
        distance: 0,
        duration: 0,
        distanceText: '',
        durationText: seg.drivingText || '',
        walkingText: seg.walkingText || '',
        drivingText: seg.drivingText || '',
        cachedAt: now,
      };
    })
    .filter(Boolean) as any[];

  if (entries.length > 0) {
    await offlineDb.routeCache.bulkPut(entries);
  }
}

/** Invalidate any cache entries that involve a specific lat/lng pair.
 *  Useful when a place is moved/deleted — all legs touching that point are stale. */
export async function invalidateRoutesNear(point: Waypoint): Promise<void> {
  const lat = round5(point.lat);
  const lng = round5(point.lng);
  // Dexie doesn't support regex queries efficiently; we iterate and filter.
  const all = await offlineDb.routeCache.toArray();
  const staleKeys = all
    .filter(row => {
      const parts = row.key.split(';');
      if (parts.length !== 2) return false;
      return parts.some(p => {
        const [plat, plng] = p.split(',').map(Number);
        return plat === lat && plng === lng;
      });
    })
    .map(r => r.key);
  if (staleKeys.length > 0) {
    await offlineDb.routeCache.where('key').anyOf(staleKeys).delete();
  }
}

/** Wipe the entire route cache (e.g. on logout or user request). */
export async function clearRouteCache(): Promise<void> {
  await offlineDb.routeCache.clear();
}
