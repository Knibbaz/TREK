import { SUPPORTED_LANGUAGES } from './supportedLanguages'

// Derived from SUPPORTED_LANGUAGES — add new languages there, not here.
const LOCALES: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map(l => [l.value, l.locale])
)
const RTL_LANGUAGES = new Set(['ar'])

export function getLocaleForLanguage(language: string): string {
  return LOCALES[language] || LOCALES.en
}

export function getIntlLanguage(language: string): string {
  if (language === 'br') return 'pt-BR'
  return ['de', 'es', 'fr', 'hu', 'it', 'ru', 'zh', 'zh-TW', 'nl', 'ar', 'cs', 'pl', 'id'].includes(language) ? language : 'en'
}

export function isRtlLanguage(language: string): boolean {
  return RTL_LANGUAGES.has(language)
}

// Detects the user's preferred language from the browser/OS settings and maps
// it to one of the supported language codes. Returns null if no match is found.
export function detectBrowserLanguage(): string | null {
  if (typeof navigator === 'undefined') return null
  const browserLangs = navigator.languages?.length
    ? navigator.languages
    : navigator.language ? [navigator.language] : []
  const supported = SUPPORTED_LANGUAGES.map(l => l.value)

  for (const lang of browserLangs) {
    // Exact match (e.g. 'de', 'zh-TW') — case-insensitive
    const exactMatch = supported.find(s => s.toLowerCase() === lang.toLowerCase())
    if (exactMatch) return exactMatch

    // pt-BR has no exact match (our code is 'br', not 'pt-BR'), so map it explicitly.
    // pt-PT and bare 'pt' are NOT mapped — they fall through to null and let the
    // server default or 'en' fallback apply instead.
    if (lang.toLowerCase() === 'pt-br') return 'br'

    // Prefix match (e.g. 'de-AT' → 'de', 'zh-CN' → 'zh') — case-insensitive
    const prefix = lang.split('-')[0].toLowerCase()
    const prefixMatch = supported.find(s => s.toLowerCase() === prefix)
    if (prefixMatch) return prefixMatch
  }

  return null
}
