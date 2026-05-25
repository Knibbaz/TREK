import React, { createContext, useContext, useEffect, ReactNode } from 'react'

export interface Branding {
  name: string
  logoLight: string
  logoDark: string
  iconLight: string
  iconDark: string
  accent: string
  accentText: string
  bgPrimary: string
  bgSecondary: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  navBg: string
  disableDarkMode: boolean
}

const DEFAULT_BRANDING: Branding = {
  name: 'ROUTD',
  logoLight: '/logo-light.svg',
  logoDark: '/logo-dark.svg',
  iconLight: '/icons/icon-white.svg',
  iconDark: '/icons/icon-dark.svg',
  accent: '#111827',
  accentText: '#ffffff',
  bgPrimary: '',
  bgSecondary: '',
  textPrimary: '',
  textSecondary: '',
  textMuted: '',
  navBg: '',
  disableDarkMode: false,
}

// Module-level singleton for non-React contexts (e.g. PDF generation)
let _currentBranding: Branding = DEFAULT_BRANDING
export function getBrandingSnapshot(): Branding {
  return _currentBranding
}

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING)

export function useBranding(): Branding {
  return useContext(BrandingContext)
}

interface BrandingProviderProps {
  branding: Partial<Branding> | null
  children: ReactNode
}

export function BrandingProvider({ branding, children }: BrandingProviderProps) {
  const resolved: Branding = {
    name: branding?.name || DEFAULT_BRANDING.name,
    logoLight: branding?.logoLight || DEFAULT_BRANDING.logoLight,
    logoDark: branding?.logoDark || DEFAULT_BRANDING.logoDark,
    iconLight: branding?.iconLight || DEFAULT_BRANDING.iconLight,
    iconDark: branding?.iconDark || DEFAULT_BRANDING.iconDark,
    accent: branding?.accent || DEFAULT_BRANDING.accent,
    accentText: branding?.accentText || DEFAULT_BRANDING.accentText,
    bgPrimary: branding?.bgPrimary || '',
    bgSecondary: branding?.bgSecondary || '',
    textPrimary: branding?.textPrimary || '',
    textSecondary: branding?.textSecondary || '',
    textMuted: branding?.textMuted || '',
    navBg: branding?.navBg || '',
    disableDarkMode: branding?.disableDarkMode ?? false,
  }

  useEffect(() => {
    _currentBranding = resolved
    document.documentElement.style.setProperty('--accent', resolved.accent)
    document.documentElement.style.setProperty('--accent-text', resolved.accentText)
    // Extended brand colors — only override when a value is set (empty = use theme default)
    if (resolved.bgPrimary) {
      document.documentElement.style.setProperty('--bg-primary', resolved.bgPrimary)
      document.documentElement.style.setProperty('--bg-card', resolved.bgPrimary)
    } else {
      document.documentElement.style.removeProperty('--bg-primary')
      document.documentElement.style.removeProperty('--bg-card')
    }
    if (resolved.bgSecondary) {
      document.documentElement.style.setProperty('--bg-secondary', resolved.bgSecondary)
      document.documentElement.style.setProperty('--bg-tertiary', resolved.bgSecondary)
      document.documentElement.style.setProperty('--bg-input', resolved.bgSecondary)
    } else {
      document.documentElement.style.removeProperty('--bg-secondary')
      document.documentElement.style.removeProperty('--bg-tertiary')
      document.documentElement.style.removeProperty('--bg-input')
    }
    if (resolved.textPrimary) {
      document.documentElement.style.setProperty('--text-primary', resolved.textPrimary)
    } else {
      document.documentElement.style.removeProperty('--text-primary')
    }
    if (resolved.textSecondary) {
      document.documentElement.style.setProperty('--text-secondary', resolved.textSecondary)
    } else {
      document.documentElement.style.removeProperty('--text-secondary')
    }
    if (resolved.textMuted) {
      document.documentElement.style.setProperty('--text-muted', resolved.textMuted)
    } else {
      document.documentElement.style.removeProperty('--text-muted')
    }
    // Force light mode when disabled
    if (resolved.disableDarkMode) {
      document.documentElement.classList.remove('dark')
      document.documentElement.setAttribute('data-force-light', '1')
    } else {
      document.documentElement.removeAttribute('data-force-light')
    }
    if (resolved.navBg) {
      document.documentElement.style.setProperty('--brand-nav-bg', resolved.navBg)
    } else {
      document.documentElement.style.removeProperty('--brand-nav-bg')
    }
    document.title = resolved.name
    const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    if (appleMeta) appleMeta.setAttribute('content', resolved.name)
    // Update favicon when icon changes
    const iconHref = resolved.iconLight || '/icons/icon-white.svg'
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (favicon) favicon.href = iconHref
    const appleTouchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
    if (appleTouchIcon) appleTouchIcon.href = iconHref
  }, [resolved.accent, resolved.accentText, resolved.name, resolved.logoLight, resolved.logoDark,
      resolved.iconLight, resolved.bgPrimary, resolved.bgSecondary, resolved.textPrimary,
      resolved.textSecondary, resolved.textMuted, resolved.navBg, resolved.disableDarkMode])

  return (
    <BrandingContext.Provider value={resolved}>
      {children}
    </BrandingContext.Provider>
  )
}
