import { createContext, useContext, useEffect, useMemo, ReactNode } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import de from './translations/de'
import en from './translations/en'
import es from './translations/es'
import fr from './translations/fr'
import hu from './translations/hu'
import it from './translations/it'
import ru from './translations/ru'
import zh from './translations/zh'
import zhTw from './translations/zhTw'
import nl from './translations/nl'
import id from './translations/id'
import ar from './translations/ar'
import br from './translations/br'
import cs from './translations/cs'
import pl from './translations/pl'
import { SupportedLanguageCode } from './supportedLanguages'
import { getLocaleForLanguage, isRtlLanguage } from './helpers'

type TranslationStrings = Record<string, string | { name: string; category: string }[]>

// Keyed by SupportedLanguageCode so TypeScript enforces all languages have a translation.
const translations: Record<SupportedLanguageCode, TranslationStrings> = {
  de, en, es, fr, hu, it, ru, zh, 'zh-TW': zhTw, nl, id, ar, br, cs, pl,
}

interface TranslationContextValue {
  t: (key: string, params?: Record<string, string | number>) => string
  language: string
  locale: string
}

const TranslationContext = createContext<TranslationContextValue>({ t: (k: string) => k, language: 'en', locale: 'en-US' })

interface TranslationProviderProps {
  children: ReactNode
}

export function TranslationProvider({ children }: TranslationProviderProps) {
  const language = useSettingsStore((s) => s.settings.language) || 'en'

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = isRtlLanguage(language) ? 'rtl' : 'ltr'
  }, [language])

  const value = useMemo((): TranslationContextValue => {
    const strings = translations[language] || translations.en
    const fallback = translations.en

    function t(key: string, params?: Record<string, string | number>): string {
      let val: string = (strings[key] ?? fallback[key] ?? key) as string
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        })
      }
      return val
    }

    return { t, language, locale: getLocaleForLanguage(language) }
  }, [language])

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>
}

export function useTranslation(): TranslationContextValue {
  return useContext(TranslationContext)
}
