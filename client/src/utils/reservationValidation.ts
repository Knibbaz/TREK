/**
 * Pure validation helpers for flight/reservation form fields.
 * Extracted here so they can be unit-tested independently from the React component.
 */

export const MAX_FLIGHT_HOURS = 24

/**
 * Parse a UTC/GMT offset string (e.g. "UTC+5:30", "GMT-3", "+1") into
 * total minutes as a signed integer. Returns null if the string is empty or
 * doesn't match the expected format.
 */
export function parseOffset(tz: string): number | null {
  if (!tz) return null
  const m = tz.trim().match(/^(?:UTC|GMT)?\s*([+-])(\d{1,2})(?::(\d{2}))?$/i)
  if (!m) return null
  const sign = m[1] === '+' ? 1 : -1
  return sign * (parseInt(m[2]) * 60 + parseInt(m[3] || '0'))
}

export interface FlightFormFields {
  type: string
  reservation_time: string | null      // "YYYY-MM-DDTHH:MM"
  end_date: string | null              // "YYYY-MM-DD"
  reservation_end_time: string | null  // "HH:MM"
  meta_departure_timezone: string
  meta_arrival_timezone: string
}

/**
 * Returns true when the arrival datetime (in UTC) is before or equal to the
 * departure datetime (in UTC), accounting for timezone offsets for flights.
 * Returns false when there is insufficient data to determine order.
 */
export function isEndBeforeStart(form: FlightFormFields): boolean {
  if (!form.end_date || !form.reservation_time) return false
  const startDate = form.reservation_time.split('T')[0]
  const startTime = form.reservation_time.split('T')[1] || '00:00'
  const endTime = form.reservation_end_time || '00:00'

  if (form.type === 'flight') {
    const depOffset = parseOffset(form.meta_departure_timezone)
    const arrOffset = parseOffset(form.meta_arrival_timezone)
    if (depOffset === null || arrOffset === null) return false
    const depMs = new Date(`${startDate}T${startTime}`).getTime() - depOffset * 60000
    const arrMs = new Date(`${form.end_date}T${endTime}`).getTime() - arrOffset * 60000
    return arrMs <= depMs
  }

  const startFull = `${startDate}T${startTime}`
  const endFull = `${form.end_date}T${endTime}`
  return endFull <= startFull
}

/**
 * Returns true when the flight duration (arrival UTC − departure UTC) exceeds
 * MAX_FLIGHT_HOURS. Returns false when form type is not flight, when dates are
 * missing, or when timezone offsets cannot be parsed (preventing false positives).
 */
export function isFlightDurationExceeded(form: FlightFormFields): boolean {
  if (form.type !== 'flight') return false
  if (!form.end_date || !form.reservation_time) return false

  const startDate = form.reservation_time.split('T')[0]
  const startTime = form.reservation_time.split('T')[1] || '00:00'
  const endTime = form.reservation_end_time || '00:00'

  const depOffset = parseOffset(form.meta_departure_timezone)
  const arrOffset = parseOffset(form.meta_arrival_timezone)
  if (depOffset === null || arrOffset === null) return false

  const depMs = new Date(`${startDate}T${startTime}`).getTime() - depOffset * 60000
  const arrMs = new Date(`${form.end_date}T${endTime}`).getTime() - arrOffset * 60000
  const durationMs = arrMs - depMs

  return durationMs > MAX_FLIGHT_HOURS * 60 * 60 * 1000
}

/**
 * Returns true when either the departure or arrival timezone has a syntactically
 * invalid format. Empty strings are treated as "not provided" and are valid.
 * Only relevant when form type is flight and all date/time fields are present.
 */
export function isInvalidTimezone(form: FlightFormFields): boolean {
  if (form.type !== 'flight') return false

  const startDate = form.reservation_time ? form.reservation_time.split('T')[0] : null
  const startTime = form.reservation_time ? form.reservation_time.split('T')[1] : null
  const endDate = form.end_date
  const endTime = form.reservation_end_time

  if (!startDate || !startTime || !endDate || !endTime) return false

  const isValidFormat = (tz: string): boolean => {
    if (!tz) return true
    const m = tz.trim().match(/^(?:UTC|GMT)?\s*([+-])(\d{1,2})(?::(\d{2}))?$/i)
    if (!m) return false
    const hours = parseInt(m[2], 10)
    const minutes = parseInt(m[3] || '0', 10)
    if (hours > 14) return false
    if (minutes > 59) return false
    return true
  }

  const depIsInvalid = form.meta_departure_timezone ? !isValidFormat(form.meta_departure_timezone) : false
  const arrIsInvalid = form.meta_arrival_timezone ? !isValidFormat(form.meta_arrival_timezone) : false

  return depIsInvalid || arrIsInvalid
}
