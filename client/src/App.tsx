import React, { useCallback, useEffect, useState, ReactNode } from 'react'
import ErrorBoundary from './components/shared/ErrorBoundary'
import { BrandingProvider, Branding } from './context/BrandingContext'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useSettingsStore } from './store/settingsStore'
import { useAddonStore } from './store/addonStore'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import DashboardPage from './pages/DashboardPage'
import TripPlannerPage from './pages/TripPlannerPage'
import FilesPage from './pages/FilesPage'
import AdminPage from './pages/AdminPage'
import SettingsPage from './pages/SettingsPage'
import VacayPage from './pages/VacayPage'
import AtlasPage from './pages/AtlasPage'
import JourneyPage from './pages/JourneyPage'
import JourneyDetailPage from './pages/JourneyDetailPage'
import GroupsPage from './pages/GroupsPage'
import GroupJoinPage from './pages/GroupJoinPage'
import GuestAvailabilityPage from './pages/GuestAvailabilityPage'
import GuestPollPage from './pages/GuestPollPage'
import JourneyPublicPage from './pages/JourneyPublicPage'
import ExplorePage from './pages/ExplorePage'
import { CreatorStorefrontPage } from './pages/CreatorStorefrontPage'
import CreatorHubPage from './pages/CreatorHubPage'
import { LinkInBioPage } from './pages/LinkInBioPage'
import WorldMapPage from './pages/WorldMapPage'
import SharedTripPage from './pages/SharedTripPage'
import TripInvitePage from './pages/TripInvitePage'
import InAppNotificationsPage from './pages/InAppNotificationsPage.tsx'
import OAuthAuthorizePage from './pages/OAuthAuthorizePage'
import { ToastContainer } from './components/shared/Toast'
import BottomNav from './components/Layout/BottomNav'
import { TranslationProvider, useTranslation } from './i18n'
import { authApi, adminApi } from './api/client'
import { usePermissionsStore, PermissionLevel } from './store/permissionsStore'
import { useInAppNotificationListener } from './hooks/useInAppNotificationListener.ts'
import { registerSyncTriggers, unregisterSyncTriggers } from './sync/syncTriggers'
import OfflineBanner from './components/Layout/OfflineBanner'
import { SystemNoticeHost } from './components/SystemNotices/SystemNoticeHost.js'
// Notice action registrations (side-effect imports):
import './pages/Trips/noticeActions.js'

interface ProtectedRouteProps {
  children: ReactNode
  adminRequired?: boolean
  addonId?: string
}

function ProtectedRoute({ children, adminRequired = false, addonId }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const appRequireMfa = useAuthStore((s) => s.appRequireMfa)
  const addonStore = useAddonStore()
  const { t } = useTranslation()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
          <p className="text-slate-500 text-sm">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    const redirectParam = encodeURIComponent(location.pathname + location.search + location.hash)
    return <Navigate to={`/login?redirect=${redirectParam}`} replace />
  }

  if (
    appRequireMfa &&
    user &&
    !user.mfa_enabled &&
    location.pathname !== '/settings'
  ) {
    return <Navigate to="/settings?mfa=required" replace />
  }

  if (adminRequired && user && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  if (addonId && addonStore.loaded && !addonStore.isEnabled(addonId)) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex flex-col h-screen md:block md:h-auto">
      <div className="flex-1 overflow-y-auto md:overflow-visible">{children}</div>
      <BottomNav />
    </div>
  )
}

function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
      </div>
    )
  }

  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />
}

export default function App() {
  const { loadUser, isAuthenticated, demoMode, setDemoMode, setDevMode, setIsPrerelease, setAppVersion, setHasMapsKey, setServerTimezone, setAppRequireMfa, setTripRemindersEnabled, setPlacesPhotosEnabled, setPlacesAutocompleteEnabled, setPlacesDetailsEnabled, setUnsplashConfigured } = useAuthStore()
  const { loadSettings } = useSettingsStore()
  const { loadAddons } = useAddonStore()
  const [branding, setBranding] = useState<Partial<Branding> | null>(null)

  const reloadBranding = useCallback(async () => {
    try {
      const data = await adminApi.getBranding() as Record<string, string>
      setBranding({
        name: data.brand_name || undefined,
        logoLight: data.brand_logo_light || undefined,
        logoDark: data.brand_logo_dark || undefined,
        iconLight: data.brand_icon_light || undefined,
        iconDark: data.brand_icon_dark || undefined,
        accent: data.brand_accent || undefined,
        accentText: data.brand_accent_text || undefined,
        bgPrimary: data.brand_bg_primary || undefined,
        bgSecondary: data.brand_bg_secondary || undefined,
        textPrimary: data.brand_text_primary || undefined,
        textSecondary: data.brand_text_secondary || undefined,
        textMuted: data.brand_text_muted || undefined,
        navBg: data.brand_nav_bg || undefined,
        disableDarkMode: data.disable_dark_mode === 'true' ? true : undefined,
      })
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    window.addEventListener('branding-updated', reloadBranding)
    return () => window.removeEventListener('branding-updated', reloadBranding)
  }, [reloadBranding])

  useEffect(() => {
    if (!location.pathname.startsWith('/shared/') && !location.pathname.startsWith('/public/') && !location.pathname.startsWith('/invite/') && !location.pathname.startsWith('/login')) {
      // If the persist snapshot already has an authenticated user, validate
      // silently so the PWA shell renders immediately without a spinner.
      const alreadyAuthenticated = useAuthStore.getState().isAuthenticated
      if (alreadyAuthenticated) {
        useAuthStore.setState({ isLoading: false })
        loadUser({ silent: true })
      } else {
        loadUser()
      }
    }
    authApi.getAppConfig().then(async (config: { demo_mode?: boolean; dev_mode?: boolean; is_prerelease?: boolean; has_maps_key?: boolean; version?: string; timezone?: string; require_mfa?: boolean; trip_reminders_enabled?: boolean; places_photos_enabled?: boolean; places_autocomplete_enabled?: boolean; places_details_enabled?: boolean; unsplash_configured?: boolean; permissions?: Record<string, PermissionLevel>; branding?: { name?: string; logo_light?: string; logo_dark?: string; icon_light?: string; icon_dark?: string; accent?: string; accent_text?: string; bg_primary?: string; bg_secondary?: string; text_primary?: string; text_secondary?: string; text_muted?: string; nav_bg?: string; disable_dark_mode?: boolean } }) => {
      if (config?.demo_mode) setDemoMode(true)
      if (config?.dev_mode) setDevMode(true)
      if (config?.is_prerelease !== undefined) setIsPrerelease(config.is_prerelease)
      if (config?.version) setAppVersion(config.version)
      if (config?.has_maps_key !== undefined) setHasMapsKey(config.has_maps_key)
      if (config?.timezone) setServerTimezone(config.timezone)
      if (config?.require_mfa !== undefined) setAppRequireMfa(!!config.require_mfa)
      if (config?.trip_reminders_enabled !== undefined) setTripRemindersEnabled(config.trip_reminders_enabled)
      if (config?.places_photos_enabled !== undefined) setPlacesPhotosEnabled(config.places_photos_enabled)
      if (config?.places_autocomplete_enabled !== undefined) setPlacesAutocompleteEnabled(config.places_autocomplete_enabled)
      if (config?.places_details_enabled !== undefined) setPlacesDetailsEnabled(config.places_details_enabled)
      if (config?.unsplash_configured !== undefined) setUnsplashConfigured(config.unsplash_configured)
      if (config?.permissions) usePermissionsStore.getState().setPermissions(config.permissions)
      if (config?.branding) {
        const b = config.branding
        setBranding({
          name: b.name || undefined,
          logoLight: b.logo_light || undefined,
          logoDark: b.logo_dark || undefined,
          iconLight: b.icon_light || undefined,
          iconDark: b.icon_dark || undefined,
          accent: b.accent || undefined,
          accentText: b.accent_text || undefined,
          bgPrimary: b.bg_primary || undefined,
          bgSecondary: b.bg_secondary || undefined,
          textPrimary: b.text_primary || undefined,
          textSecondary: b.text_secondary || undefined,
          textMuted: b.text_muted || undefined,
          navBg: b.nav_bg || undefined,
          disableDarkMode: b.disable_dark_mode ?? undefined,
        })
      }

      if (config?.version) {
        const storedVersion = localStorage.getItem('trek_app_version')
        if (storedVersion && storedVersion !== config.version) {
          try {
            if ('caches' in window) {
              const names = await caches.keys()
              await Promise.all(names.map(n => caches.delete(n)))
            }
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations()
              await Promise.all(regs.map(r => r.unregister()))
            }
          } catch {}
          localStorage.setItem('trek_app_version', config.version)
          window.location.reload()
          return
        }
        localStorage.setItem('trek_app_version', config.version)
      }
    }).catch(() => {})
  }, [])

  const { settings } = useSettingsStore()

  useInAppNotificationListener()

  useEffect(() => {
    if (isAuthenticated) {
      loadSettings()
      loadAddons()
    }
  }, [isAuthenticated])

  useEffect(() => {
    registerSyncTriggers()
    return () => unregisterSyncTriggers()
  }, [])

  const location = useLocation()
  const isSharedPage = location.pathname.startsWith('/shared/') || location.pathname.startsWith('/invite/')

  useEffect(() => {
    // Shared page or admin-disabled dark mode always forces light mode
    if (isSharedPage || document.documentElement.hasAttribute('data-force-light')) {
      document.documentElement.classList.remove('dark')
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', '#ffffff')
      return
    }

    const mode = settings.dark_mode
    const applyDark = (isDark: boolean) => {
      document.documentElement.classList.toggle('dark', isDark)
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', isDark ? '#09090b' : '#ffffff')
    }

    if (mode === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyDark(mq.matches)
      const handler = (e: MediaQueryListEvent) => applyDark(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
    applyDark(mode === true || mode === 'dark')
  }, [settings.dark_mode, isSharedPage])

  const isAuthPage = location.pathname.startsWith('/login')
    || location.pathname.startsWith('/register')
    || location.pathname.startsWith('/forgot-password')
    || location.pathname.startsWith('/reset-password')

  return (
    <BrandingProvider branding={branding}>
    <TranslationProvider>
      <ErrorBoundary>
      {!isAuthPage && <SystemNoticeHost />}
      <ToastContainer />
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/shared/:token" element={<SharedTripPage />} />
        <Route path="/@:slug" element={<LinkInBioPage />} />
        <Route path="/creator/:slug" element={<CreatorStorefrontPage />} />
        <Route path="/invite/trip/:token" element={<TripInvitePage />} />
        <Route path="/public/journey/:token" element={<JourneyPublicPage />} />
        <Route path="/register" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/join-group/:token" element={<GroupJoinPage />} />
        <Route path="/guest/availability/:token" element={<GuestAvailabilityPage />} />
        <Route path="/guest/poll/:token" element={<GuestPollPage />} />
        {/* OAuth 2.1 consent page — intentionally outside ProtectedRoute */}
        <Route path="/oauth/authorize" element={<OAuthAuthorizePage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trips/:id"
          element={
            <ProtectedRoute>
              <TripPlannerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trips/:id/files"
          element={
            <ProtectedRoute>
              <FilesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminRequired>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vacay"
          element={
            <ProtectedRoute addonId="vacay">
              <VacayPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/atlas"
          element={
            <ProtectedRoute addonId="atlas">
              <AtlasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/journey"
          element={
            <ProtectedRoute addonId="journey">
              <JourneyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/journey/:id"
          element={
            <ProtectedRoute addonId="journey">
              <JourneyDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/groups"
          element={
            <ProtectedRoute addonId="groups">
              <GroupsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/groups/:id"
          element={
            <ProtectedRoute addonId="groups">
              <GroupsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/explore"
          element={
            <ProtectedRoute addonId="explore">
              <ExplorePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/creator-hub"
          element={
            <ProtectedRoute addonId="creator_hub">
              <CreatorHubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/worldmap"
          element={
            <ProtectedRoute addonId="worldmap">
              <WorldMapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <InAppNotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
    </TranslationProvider>
    </BrandingProvider>
  )
}
