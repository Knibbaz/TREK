import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../tests/helpers/msw/server'
import {
  calculateRoute,
  calculateSegments,
  optimizeRoute,
  generateGoogleMapsUrl,
} from './RouteCalculator'

const OSRM_BASE = 'https://router.project-osrm.org/route/v1'

const buildOsrmRouteResponse = (distance = 5000, duration = 360) => ({
  code: 'Ok',
  routes: [
    {
      geometry: { coordinates: [[2.3522, 48.8566], [2.3600, 48.8600]] },
      distance,
      duration,
      legs: [{ distance, duration }],
    },
  ],
})

const wp1 = { lat: 48.8566, lng: 2.3522 }
const wp2 = { lat: 48.8600, lng: 2.3600 }

// ── calculateRoute ─────────────────────────────────────────────────────────────

describe('calculateRoute', () => {
  it('FE-COMP-ROUTECALCULATOR-001: throws when fewer than 2 waypoints', async () => {
    await expect(calculateRoute([wp1])).rejects.toThrow('At least 2 waypoints required')
  })

  it('FE-COMP-ROUTECALCULATOR-002: auto profile returns parsed coordinates on success', async () => {
    // wp1→wp2 is < 2 km → auto picks walking
    server.use(
      http.get(`${OSRM_BASE}/walking/:coords`, () =>
        HttpResponse.json(buildOsrmRouteResponse())
      )
    )
    const result = await calculateRoute([wp1, wp2])
    expect(result.coordinates).toEqual([[48.8566, 2.3522], [48.8600, 2.3600]])
  })

  it('FE-COMP-ROUTECALCULATOR-003: returns formatted distance text for >= 1000 m', async () => {
    server.use(
      http.get(`${OSRM_BASE}/walking/:coords`, () =>
        HttpResponse.json(buildOsrmRouteResponse(1500, 360))
      )
    )
    const result = await calculateRoute([wp1, wp2])
    expect(result.distanceText).toBe('1.5 km')
  })

  it('FE-COMP-ROUTECALCULATOR-004: returns formatted distance in meters for short routes', async () => {
    server.use(
      http.get(`${OSRM_BASE}/walking/:coords`, () =>
        HttpResponse.json(buildOsrmRouteResponse(800, 360))
      )
    )
    const result = await calculateRoute([wp1, wp2])
    expect(result.distanceText).toBe('800 m')
  })

  it('FE-COMP-ROUTECALCULATOR-005: walking profile overrides duration with distance-based calculation', async () => {
    const distance = 5000
    const osrmDuration = 999
    server.use(
      http.get(`${OSRM_BASE}/walking/:coords`, () =>
        HttpResponse.json(buildOsrmRouteResponse(distance, osrmDuration))
      )
    )
    const result = await calculateRoute([wp1, wp2], 'walking')
    const expectedDuration = distance / (5000 / 3600)
    expect(result.duration).toBeCloseTo(expectedDuration)
    expect(result.duration).not.toBe(osrmDuration)
  })

  it('FE-COMP-ROUTECALCULATOR-006: throws when OSRM returns non-ok HTTP status', async () => {
    server.use(
      http.get(`${OSRM_BASE}/walking/:coords`, () =>
        HttpResponse.json({}, { status: 500 })
      )
    )
    // Explicit profile bypasses auto fallback
    await expect(calculateRoute([wp1, wp2], 'walking')).rejects.toThrow('Route could not be calculated')
  })

  it('FE-COMP-ROUTECALCULATOR-007: throws when OSRM code is not Ok', async () => {
    server.use(
      http.get(`${OSRM_BASE}/walking/:coords`, () =>
        HttpResponse.json({ code: 'NoRoute', routes: [] })
      )
    )
    // Explicit profile bypasses auto fallback
    await expect(calculateRoute([wp1, wp2], 'walking')).rejects.toThrow('No route found')
  })

  it('FE-COMP-ROUTECALCULATOR-008: respects AbortSignal', async () => {
    server.use(
      http.get(`${OSRM_BASE}/walking/:coords`, () =>
        HttpResponse.json(buildOsrmRouteResponse())
      )
    )
    const controller = new AbortController()
    controller.abort()
    await expect(calculateRoute([wp1, wp2], 'walking', { signal: controller.signal })).rejects.toThrow()
  })

  it('FE-COMP-ROUTECALCULATOR-016: auto profile uses driving for medium distances', async () => {
    // Waypoints ~25 km apart → auto picks driving
    const near = { lat: 48.8566, lng: 2.3522 }
    const far = { lat: 49.0000, lng: 2.6000 }
    server.use(
      http.get(`${OSRM_BASE}/driving/:coords`, () =>
        HttpResponse.json(buildOsrmRouteResponse(25000, 1200))
      )
    )
    const result = await calculateRoute([near, far])
    expect(result.distanceText).toBe('25.0 km')
  })

  it('FE-COMP-ROUTECALCULATOR-017: auto profile treats >500 km as flight (straight line)', async () => {
    // Amsterdam → Tenerife (~3600 km)
    const amsterdam = { lat: 52.3676, lng: 4.9041 }
    const tenerife = { lat: 28.2916, lng: -16.6291 }
    const result = await calculateRoute([amsterdam, tenerife])
    // Should NOT call OSRM at all – returns straight-line estimate
    expect(result.distance).toBeGreaterThan(3_000_000) // > 3000 km
    expect(result.duration).toBeGreaterThan(3600 * 4) // > 4h flight
    // Coordinates should be a straight line (more than 2 points)
    expect(result.coordinates.length).toBeGreaterThan(2)
  })
})

// ── calculateSegments ──────────────────────────────────────────────────────────

describe('calculateSegments', () => {
  it('FE-COMP-ROUTECALCULATOR-009: returns empty array for fewer than 2 waypoints', async () => {
    const result = await calculateSegments([wp1])
    expect(result).toEqual([])
  })

  it('FE-COMP-ROUTECALCULATOR-010: returns segment midpoints and travel times', async () => {
    // wp1→wp2 is < 2 km → auto picks walking
    server.use(
      http.get(`${OSRM_BASE}/walking/:coords`, () =>
        HttpResponse.json({
          code: 'Ok',
          routes: [
            {
              legs: [{ distance: 1000, duration: 720 }],
            },
          ],
        })
      )
    )
    const result = await calculateSegments([wp1, wp2])
    expect(result).toHaveLength(1)
    const seg = result[0]
    const expectedMid: [number, number] = [
      (wp1.lat + wp2.lat) / 2,
      (wp1.lng + wp2.lng) / 2,
    ]
    expect(seg.mid[0]).toBeCloseTo(expectedMid[0])
    expect(seg.mid[1]).toBeCloseTo(expectedMid[1])
    expect(seg.drivingText).toBe('12 min')
  })

  it('FE-COMP-ROUTECALCULATOR-018: long-distance segment returns flight estimate', async () => {
    const amsterdam = { lat: 52.3676, lng: 4.9041 }
    const tenerife = { lat: 28.2916, lng: -16.6291 }
    const result = await calculateSegments([amsterdam, tenerife])
    expect(result).toHaveLength(1)
    const seg = result[0]
    expect(seg.distance).toBeGreaterThan(3_000_000)
    // Flight duration should be ~4-5 hours
    expect(seg.drivingText).toMatch(/h/)
  })
})

// ── optimizeRoute ──────────────────────────────────────────────────────────────

describe('optimizeRoute', () => {
  it('FE-COMP-ROUTECALCULATOR-011: returns input unchanged for 2 or fewer places', () => {
    const places = [wp1, wp2]
    const result = optimizeRoute(places)
    expect(result).toHaveLength(2)
    expect(result).toBe(places)
  })

  it('FE-COMP-ROUTECALCULATOR-012: nearest-neighbor reorders 3 waypoints correctly', () => {
    // Note: filter uses `p.lat && p.lng`, so avoid zero values
    const a = { lat: 1, lng: 1 }
    const b = { lat: 10, lng: 1 }
    const c = { lat: 2, lng: 1 }
    const result = optimizeRoute([a, b, c])
    // Starting from a(1,1), nearest is c(2,1) (dist=1), then b(10,1) (dist=8)
    expect(result[0]).toEqual(a)
    expect(result[1]).toEqual(c)
    expect(result[2]).toEqual(b)
  })
})

// ── generateGoogleMapsUrl ──────────────────────────────────────────────────────

describe('generateGoogleMapsUrl', () => {
  it('FE-COMP-ROUTECALCULATOR-013: returns null for empty places', () => {
    expect(generateGoogleMapsUrl([])).toBeNull()
  })

  it('FE-COMP-ROUTECALCULATOR-014: single place returns search URL', () => {
    const result = generateGoogleMapsUrl([{ lat: 48.85, lng: 2.35 }])
    expect(result).toBe('https://www.google.com/maps/search/?api=1&query=48.85,2.35')
  })

  it('FE-COMP-ROUTECALCULATOR-015: multiple places returns directions URL', () => {
    const result = generateGoogleMapsUrl([
      { lat: 48.85, lng: 2.35 },
      { lat: 48.86, lng: 2.36 },
    ])
    expect(result).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//)
    expect(result).toContain('48.85,2.35')
    expect(result).toContain('48.86,2.36')
  })
})
