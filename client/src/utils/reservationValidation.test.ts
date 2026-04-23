import { describe, it, expect } from 'vitest'
import {
  MAX_FLIGHT_HOURS,
  parseOffset,
  isEndBeforeStart,
  isFlightDurationExceeded,
  isInvalidTimezone,
  type FlightFormFields,
} from './reservationValidation'

// ── Helpers ──────────────────────────────────────────────────────────────────

function flightForm(overrides: Partial<FlightFormFields> = {}): FlightFormFields {
  return {
    type: 'flight',
    reservation_time: '2025-06-01T10:00',
    end_date: '2025-06-01',
    reservation_end_time: '14:00',
    meta_departure_timezone: 'UTC+2',
    meta_arrival_timezone: 'UTC+2',
    ...overrides,
  }
}

// ── parseOffset ──────────────────────────────────────────────────────────────

describe('parseOffset', () => {
  it('returns null for empty string', () => {
    expect(parseOffset('')).toBeNull()
  })

  it('parses UTC+0', () => {
    expect(parseOffset('UTC+0')).toBe(0)
  })

  it('parses UTC+1 as 60 minutes', () => {
    expect(parseOffset('UTC+1')).toBe(60)
  })

  it('parses UTC-5 as -300 minutes', () => {
    expect(parseOffset('UTC-5')).toBe(-300)
  })

  it('parses UTC+5:30 (India) as 330 minutes', () => {
    expect(parseOffset('UTC+5:30')).toBe(330)
  })

  it('parses UTC-3:30 (Newfoundland) as -210 minutes', () => {
    expect(parseOffset('UTC-3:30')).toBe(-210)
  })

  it('parses GMT+2 (with GMT prefix)', () => {
    expect(parseOffset('GMT+2')).toBe(120)
  })

  it('parses +8 without prefix', () => {
    expect(parseOffset('+8')).toBe(480)
  })

  it('parses -12 as -720 minutes', () => {
    expect(parseOffset('-12')).toBe(-720)
  })

  it('returns null for garbage input', () => {
    expect(parseOffset('London')).toBeNull()
  })

  it('returns null for missing sign', () => {
    expect(parseOffset('UTC5')).toBeNull()
  })
})

// ── isEndBeforeStart ─────────────────────────────────────────────────────────

describe('isEndBeforeStart', () => {
  it('returns false when end_date is missing', () => {
    expect(isEndBeforeStart(flightForm({ end_date: null }))).toBe(false)
  })

  it('returns false when reservation_time is missing', () => {
    expect(isEndBeforeStart(flightForm({ reservation_time: null }))).toBe(false)
  })

  it('returns false when arrival is after departure (same timezone)', () => {
    // departs 10:00, arrives 14:00 — 4h flight, same TZ
    expect(isEndBeforeStart(flightForm())).toBe(false)
  })

  it('returns true when arrival is before departure (same timezone)', () => {
    // departs 14:00, arrives 10:00 → invalid
    expect(isEndBeforeStart(flightForm({
      reservation_time: '2025-06-01T14:00',
      reservation_end_time: '10:00',
    }))).toBe(true)
  })

  it('returns true when arrival equals departure time (same timezone)', () => {
    expect(isEndBeforeStart(flightForm({
      reservation_time: '2025-06-01T10:00',
      reservation_end_time: '10:00',
    }))).toBe(true)
  })

  it('accounts for timezone offset: arrival before departure in UTC is invalid', () => {
    // Departs 10:00 UTC+2 (= 08:00 UTC)
    // Arrives 09:00 UTC+2 (= 07:00 UTC) on same date — before departure
    expect(isEndBeforeStart(flightForm({
      reservation_time: '2025-06-01T10:00',
      reservation_end_time: '09:00',
      meta_departure_timezone: 'UTC+2',
      meta_arrival_timezone: 'UTC+2',
    }))).toBe(true)
  })

  it('accounts for timezone offset: arrival earlier local time but later UTC is valid', () => {
    // Departs 10:00 UTC+8 (= 02:00 UTC)
    // Arrives 08:00 UTC+0 (= 08:00 UTC) — 6 hours later in UTC
    expect(isEndBeforeStart(flightForm({
      reservation_time: '2025-06-01T10:00',
      end_date: '2025-06-01',
      reservation_end_time: '08:00',
      meta_departure_timezone: 'UTC+8',
      meta_arrival_timezone: 'UTC+0',
    }))).toBe(false)
  })

  it('returns false when timezone cannot be parsed (missing offsets)', () => {
    // Can't safely determine order without valid TZ
    expect(isEndBeforeStart(flightForm({
      meta_departure_timezone: '',
      meta_arrival_timezone: '',
    }))).toBe(false)
  })

  it('non-flight type: compares dates as strings without TZ', () => {
    const form: FlightFormFields = {
      type: 'train',
      reservation_time: '2025-06-01T14:00',
      end_date: '2025-06-01',
      reservation_end_time: '10:00',
      meta_departure_timezone: '',
      meta_arrival_timezone: '',
    }
    expect(isEndBeforeStart(form)).toBe(true)
  })

  it('non-flight type: end after start returns false', () => {
    const form: FlightFormFields = {
      type: 'train',
      reservation_time: '2025-06-01T10:00',
      end_date: '2025-06-02',
      reservation_end_time: '08:00',
      meta_departure_timezone: '',
      meta_arrival_timezone: '',
    }
    expect(isEndBeforeStart(form)).toBe(false)
  })
})

// ── isFlightDurationExceeded ─────────────────────────────────────────────────

describe('isFlightDurationExceeded', () => {
  it(`MAX_FLIGHT_HOURS is ${MAX_FLIGHT_HOURS}`, () => {
    expect(MAX_FLIGHT_HOURS).toBe(24)
  })

  it('returns false for non-flight type', () => {
    expect(isFlightDurationExceeded(flightForm({ type: 'hotel' }))).toBe(false)
  })

  it('returns false when dates are missing', () => {
    expect(isFlightDurationExceeded(flightForm({ end_date: null }))).toBe(false)
    expect(isFlightDurationExceeded(flightForm({ reservation_time: null }))).toBe(false)
  })

  it('returns false when timezone cannot be parsed', () => {
    expect(isFlightDurationExceeded(flightForm({
      meta_departure_timezone: '',
      meta_arrival_timezone: '',
    }))).toBe(false)
  })

  it('returns false for a 4-hour flight (well under 24h)', () => {
    // departs 10:00, arrives 14:00, same TZ → 4h
    expect(isFlightDurationExceeded(flightForm())).toBe(false)
  })

  it('returns false for a flight exactly 24 hours long', () => {
    // departs 2025-06-01T10:00 UTC+0, arrives 2025-06-02T10:00 UTC+0 = exactly 24h
    expect(isFlightDurationExceeded(flightForm({
      reservation_time: '2025-06-01T10:00',
      end_date: '2025-06-02',
      reservation_end_time: '10:00',
      meta_departure_timezone: 'UTC+0',
      meta_arrival_timezone: 'UTC+0',
    }))).toBe(false)
  })

  it('returns true for a flight 25 hours long', () => {
    // departs 2025-06-01T10:00 UTC+0, arrives 2025-06-02T11:00 UTC+0 = 25h
    expect(isFlightDurationExceeded(flightForm({
      reservation_time: '2025-06-01T10:00',
      end_date: '2025-06-02',
      reservation_end_time: '11:00',
      meta_departure_timezone: 'UTC+0',
      meta_arrival_timezone: 'UTC+0',
    }))).toBe(true)
  })

  it('accounts for timezone offset in duration calculation', () => {
    // departs 2025-06-01T10:00 UTC+8 (= 02:00 UTC)
    // arrives 2025-06-02T23:00 UTC-8 (= 07:00 UTC next day)
    // duration: 07:00 UTC June 2 − 02:00 UTC June 1 = 29h → exceeds 24h
    expect(isFlightDurationExceeded(flightForm({
      reservation_time: '2025-06-01T10:00',
      end_date: '2025-06-02',
      reservation_end_time: '23:00',
      meta_departure_timezone: 'UTC+8',
      meta_arrival_timezone: 'UTC-8',
    }))).toBe(true)
  })

  it('a long-haul flight with timezone help staying under 24h is allowed', () => {
    // departs 2025-06-01T10:00 UTC-8 (= 18:00 UTC)
    // arrives 2025-06-02T10:00 UTC+8 (= 02:00 UTC June 2)
    // duration: 02:00 UTC June 2 − 18:00 UTC June 1 = 8h → under 24h
    expect(isFlightDurationExceeded(flightForm({
      reservation_time: '2025-06-01T10:00',
      end_date: '2025-06-02',
      reservation_end_time: '10:00',
      meta_departure_timezone: 'UTC-8',
      meta_arrival_timezone: 'UTC+8',
    }))).toBe(false)
  })
})

// ── isInvalidTimezone ────────────────────────────────────────────────────────

describe('isInvalidTimezone', () => {
  it('returns false for non-flight type', () => {
    expect(isInvalidTimezone(flightForm({ type: 'hotel' }))).toBe(false)
  })

  it('returns false when date or time fields are missing', () => {
    expect(isInvalidTimezone(flightForm({ reservation_time: null }))).toBe(false)
    expect(isInvalidTimezone(flightForm({ end_date: null }))).toBe(false)
    expect(isInvalidTimezone(flightForm({ reservation_end_time: null }))).toBe(false)
  })

  it('returns false for valid UTC offset format', () => {
    expect(isInvalidTimezone(flightForm({
      meta_departure_timezone: 'UTC+1',
      meta_arrival_timezone: 'UTC+5:30',
    }))).toBe(false)
  })

  it('returns false when both timezone fields are empty', () => {
    expect(isInvalidTimezone(flightForm({
      meta_departure_timezone: '',
      meta_arrival_timezone: '',
    }))).toBe(false)
  })

  it('returns true when departure timezone is invalid', () => {
    expect(isInvalidTimezone(flightForm({
      meta_departure_timezone: 'Europe/Amsterdam',
      meta_arrival_timezone: 'UTC+1',
    }))).toBe(true)
  })

  it('returns true when arrival timezone is invalid', () => {
    expect(isInvalidTimezone(flightForm({
      meta_departure_timezone: 'UTC+1',
      meta_arrival_timezone: 'foobar',
    }))).toBe(true)
  })

  it('returns true for offset with hours > 14', () => {
    expect(isInvalidTimezone(flightForm({
      meta_departure_timezone: 'UTC+15',
      meta_arrival_timezone: 'UTC+1',
    }))).toBe(true)
  })

  it('returns true for offset with minutes > 59', () => {
    expect(isInvalidTimezone(flightForm({
      meta_departure_timezone: 'UTC+1:60',
      meta_arrival_timezone: 'UTC+1',
    }))).toBe(true)
  })

  it('returns false for UTC+14 (maximum valid offset)', () => {
    expect(isInvalidTimezone(flightForm({
      meta_departure_timezone: 'UTC+14',
      meta_arrival_timezone: 'UTC-12',
    }))).toBe(false)
  })

  it('returns false for GMT prefix', () => {
    expect(isInvalidTimezone(flightForm({
      meta_departure_timezone: 'GMT+2',
      meta_arrival_timezone: 'GMT-5',
    }))).toBe(false)
  })
})
