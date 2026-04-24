// Generate all valid country/region names via Intl.DisplayNames.
// This produces a complete list (including territories) in the user's language,
// rather than relying on an English-only holiday API subset.

export interface CountryOption {
  code: string
  name: string
}

const ALL_AA_ZZ: string[] = []
for (let i = 65; i <= 90; i++) {
  for (let j = 65; j <= 90; j++) {
    ALL_AA_ZZ.push(String.fromCharCode(i) + String.fromCharCode(j))
  }
}

function getValidCountries(locale: string): CountryOption[] {
  try {
    const dn = new Intl.DisplayNames([locale], { type: 'region' })
    const list: CountryOption[] = []
    for (const code of ALL_AA_ZZ) {
      try {
        const name = dn.of(code)
        if (name && name !== code) {
          list.push({ code, name })
        }
      } catch {
        // not a recognised region code
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, locale))
  } catch {
    // Fallback for environments without Intl.DisplayNames
    return []
  }
}

let cachedLocale: string | null = null
let cachedList: CountryOption[] | null = null

/**
 * Return a sorted list of all recognised country/region codes with
 * human-readable names in the requested locale.
 * Results are cached per locale.
 */
export function getAllCountries(locale: string): CountryOption[] {
  if (cachedLocale === locale && cachedList) return cachedList
  cachedList = getValidCountries(locale)
  cachedLocale = locale
  return cachedList
}

/**
 * Check whether a country code is supported by the holiday API (Nager.Date).
 * Accepts an array of supported codes (e.g. from the API) and falls back to
 * a built-in subset when the list is empty.
 */
const BUILT_IN_HOLIDAY_CODES = new Set([
  'AD', 'AL', 'AM', 'AR', 'AT', 'AU', 'AX', 'BA', 'BB', 'BD', 'BE', 'BG', 'BJ',
  'BO', 'BR', 'BS', 'BW', 'BY', 'BZ', 'CA', 'CD', 'CG', 'CH', 'CL', 'CN', 'CO',
  'CR', 'CU', 'CY', 'CZ', 'DE', 'DK', 'DO', 'EC', 'EE', 'EG', 'ES', 'FI', 'FO',
  'FR', 'GA', 'GB', 'GD', 'GE', 'GG', 'GH', 'GI', 'GL', 'GM', 'GR', 'GT', 'GU',
  'GY', 'HK', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IM', 'IN', 'IS', 'IT', 'JE',
  'JM', 'JP', 'KE', 'KR', 'KY', 'KZ', 'LI', 'LK', 'LS', 'LT', 'LU', 'LV', 'MA',
  'MC', 'MD', 'ME', 'MG', 'MK', 'ML', 'MN', 'MQ', 'MR', 'MT', 'MU', 'MW', 'MX',
  'MZ', 'NA', 'NE', 'NG', 'NI', 'NL', 'NO', 'NZ', 'PA', 'PE', 'PH', 'PK', 'PL',
  'PR', 'PT', 'PY', 'RO', 'RS', 'RU', 'RW', 'SC', 'SE', 'SG', 'SH', 'SI', 'SJ',
  'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SZ', 'TC', 'TD',
  'TG', 'TN', 'TR', 'TT', 'TZ', 'UA', 'UG', 'US', 'UY', 'VA', 'VC', 'VE', 'VG',
  'VI', 'VN', 'XK', 'ZA', 'ZM', 'ZW',
])

export function hasHolidaySupport(code: string, supportedCodes?: string[]): boolean {
  if (supportedCodes && supportedCodes.length > 0) {
    return supportedCodes.includes(code.toUpperCase())
  }
  return BUILT_IN_HOLIDAY_CODES.has(code.toUpperCase())
}
