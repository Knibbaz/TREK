import axios, { AxiosInstance } from 'axios'
import { getSocketId } from './websocket'
import en from '../i18n/translations/en'
import br from '../i18n/translations/br'
import de from '../i18n/translations/de'
import es from '../i18n/translations/es'
import fr from '../i18n/translations/fr'
import it from '../i18n/translations/it'
import nl from '../i18n/translations/nl'
import pl from '../i18n/translations/pl'
import cs from '../i18n/translations/cs'
import hu from '../i18n/translations/hu'
import ru from '../i18n/translations/ru'
import zh from '../i18n/translations/zh'
import zhTw from '../i18n/translations/zhTw'
import ar from '../i18n/translations/ar'

const rateLimitTranslations: Record<string, Record<string, string | unknown>> = {
  en, br, de, es, fr, it, nl, pl, cs, hu, ru, zh, 'zh-TW': zhTw, ar,
}

function translateRateLimit(): string {
  const fallback = 'Too many attempts. Please try again later.'
  try {
    const lang = localStorage.getItem('app_language') || 'en'
    const table = rateLimitTranslations[lang] || rateLimitTranslations.en
    return (table['common.tooManyAttempts'] as string) || (rateLimitTranslations.en['common.tooManyAttempts'] as string) || fallback
  } catch {
    return fallback
  }
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

// ── Simple in-memory cache for GET requests ────────────────────────────────
interface CacheEntry {
  data: unknown
  expiresAt: number
}
const _apiCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5_000 // 5 seconds

function cacheKey(config: unknown): string {
  const c = config as { url?: string; params?: Record<string, unknown> }
  const params = c.params ? JSON.stringify(c.params) : ''
  return `${c.url || ''}?${params}`
}

export function invalidateApiCache(urlPattern?: string): void {
  if (!urlPattern) {
    _apiCache.clear()
    return
  }
  for (const key of _apiCache.keys()) {
    if (key.startsWith(urlPattern)) _apiCache.delete(key)
  }
}

// Request interceptor - add socket ID + idempotency key + cache lookup
apiClient.interceptors.request.use(
  (config) => {
    const sid = getSocketId()
    if (sid) {
      config.headers['X-Socket-Id'] = sid
    }
    // Attach a per-request idempotency key to all write operations so the
    // server can deduplicate retried requests (e.g. network blips).
    // The mutation queue sets its own pre-generated key; skip if already set.
    const method = (config.method ?? '').toLowerCase()
    if (MUTATING_METHODS.has(method) && !config.headers['X-Idempotency-Key']) {
      const key = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)
      config.headers['X-Idempotency-Key'] = key
    }
    // Simple GET cache lookup (skip if explicitly no-cache)
    if (method === 'get' && !config.headers['X-Skip-Cache']) {
      const key = cacheKey(config)
      const cached = _apiCache.get(key)
      if (cached && cached.expiresAt > Date.now()) {
        config.adapter = async () => ({
          data: cached.data,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: config as any,
        })
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

export function isAuthPublicPath(pathname: string): boolean {
  const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password']
  const publicPrefixes = ['/shared/', '/public/', '/invite/']
  return publicPaths.includes(pathname) || publicPrefixes.some((p) => pathname.startsWith(p))
}

// ── Retry mechanism ────────────────────────────────────────────────────────
const RETRY_COUNT = 2
const RETRY_DELAY_MS = 500
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Response interceptor - handle 401, 403 MFA, 429 rate limit, caching, retry
apiClient.interceptors.response.use(
  (response) => {
    const method = (response.config.method ?? '').toLowerCase()
    // Cache successful GET responses
    if (method === 'get' && !response.config.headers['X-Skip-Cache']) {
      const key = cacheKey(response.config)
      _apiCache.set(key, { data: response.data, expiresAt: Date.now() + CACHE_TTL_MS })
    }
    // Clear entire cache on mutations so subsequent GETs fetch fresh data
    if (MUTATING_METHODS.has(method)) {
      _apiCache.clear()
    }
    return response
  },
  async (error) => {
    const config = error.config

    // Retry on network errors or retryable status codes
    if (config && config.retryCount === undefined) config.retryCount = 0
    if (
      config &&
      config.retryCount < RETRY_COUNT &&
      (!error.response || RETRYABLE_STATUSES.has(error.response.status))
    ) {
      config.retryCount++
      await sleep(RETRY_DELAY_MS * config.retryCount)
      return apiClient(config)
    }

    if (error.response?.status === 401 && (error.response?.data as { code?: string } | undefined)?.code === 'AUTH_REQUIRED') {
      const { pathname } = window.location
      if (!isAuthPublicPath(pathname)) {
        const currentPath = pathname + window.location.search + window.location.hash
        window.location.href = '/login?redirect=' + encodeURIComponent(currentPath)
      }
    }
    if (
      error.response?.status === 403 &&
      (error.response?.data as { code?: string } | undefined)?.code === 'MFA_REQUIRED' &&
      !window.location.pathname.startsWith('/settings')
    ) {
      window.location.href = '/settings?mfa=required'
    }
    if (error.response?.status === 429) {
      const translated = translateRateLimit()
      const data = error.response.data as { error?: string } | undefined
      if (data && typeof data === 'object') {
        data.error = translated
      } else {
        error.response.data = { error: translated }
      }
      error.message = translated
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  register: (data: { username: string; email: string; password: string; invite_token?: string }) => apiClient.post('/auth/register', data).then(r => r.data),
  validateInvite: (token: string) => apiClient.get(`/auth/invite/${token}`).then(r => r.data),
  login: (data: { email: string; password: string }) => apiClient.post('/auth/login', data).then(r => r.data),
  verifyMfaLogin: (data: { mfa_token: string; code: string }) => apiClient.post('/auth/mfa/verify-login', data).then(r => r.data),
  mfaSetup: () => apiClient.post('/auth/mfa/setup', {}).then(r => r.data),
  mfaEnable: (data: { code: string }) => apiClient.post('/auth/mfa/enable', data).then(r => r.data as { success: boolean; mfa_enabled: boolean; backup_codes?: string[] }),
  mfaDisable: (data: { password: string; code: string }) => apiClient.post('/auth/mfa/disable', data).then(r => r.data),
  me: () => apiClient.get('/auth/me').then(r => r.data),
  updateMapsKey: (key: string | null) => apiClient.put('/auth/me/maps-key', { maps_api_key: key }).then(r => r.data),
  updateApiKeys: (data: Record<string, string | null>) => apiClient.put('/auth/me/api-keys', data).then(r => r.data),
  updateSettings: (data: Record<string, unknown>) => apiClient.put('/auth/me/settings', data).then(r => r.data),
  getSettings: () => apiClient.get('/auth/me/settings').then(r => r.data),
  listUsers: () => apiClient.get('/auth/users').then(r => r.data),
  uploadAvatar: (formData: FormData) => apiClient.post('/auth/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),
  deleteAvatar: () => apiClient.delete('/auth/avatar').then(r => r.data),
  getAppConfig: () => apiClient.get('/auth/app-config').then(r => r.data),
  updateAppSettings: (data: Record<string, unknown>) => apiClient.put('/auth/app-settings', data).then(r => r.data),
  validateKeys: () => apiClient.get('/auth/validate-keys').then(r => r.data),
  travelStats: () => apiClient.get('/auth/travel-stats').then(r => r.data),
  changePassword: (data: { current_password: string; new_password: string }) => apiClient.put('/auth/me/password', data).then(r => r.data),
  forgotPassword: (data: { email: string }) => apiClient.post('/auth/forgot-password', data).then(r => r.data as { ok: true }),
  resetPassword: (data: { token: string; new_password: string; mfa_code?: string }) => apiClient.post('/auth/reset-password', data).then(r => r.data as { success?: true; mfa_required?: true }),
  deleteOwnAccount: () => apiClient.delete('/auth/me').then(r => r.data),
  demoLogin: () => apiClient.post('/auth/demo-login').then(r => r.data),
  mcpTokens: {
    list: () => apiClient.get('/auth/mcp-tokens').then(r => r.data),
    create: (name: string) => apiClient.post('/auth/mcp-tokens', { name }).then(r => r.data),
    delete: (id: number) => apiClient.delete(`/auth/mcp-tokens/${id}`).then(r => r.data),
  },
}

export const oauthApi = {
  /** Validate OAuth authorize params — called by consent page on load */
  validate: (params: {
    response_type: string
    client_id: string
    redirect_uri: string
    scope: string
    state?: string
    code_challenge: string
    code_challenge_method: string
  }) => apiClient.get('/oauth/authorize/validate', { params }).then(r => r.data),

  /** Submit user consent (approve or deny) */
  authorize: (body: {
    client_id: string
    redirect_uri: string
    scope: string
    state?: string
    code_challenge: string
    code_challenge_method: string
    approved: boolean
  }) => apiClient.post('/oauth/authorize', body).then(r => r.data),

  clients: {
    list: () => apiClient.get('/oauth/clients').then(r => r.data),
    create: (data: { name: string; redirect_uris: string[]; allowed_scopes: string[] }) =>
      apiClient.post('/oauth/clients', data).then(r => r.data),
    rotate: (id: string) => apiClient.post(`/oauth/clients/${id}/rotate`).then(r => r.data),
    delete: (id: string) => apiClient.delete(`/oauth/clients/${id}`).then(r => r.data),
  },

  sessions: {
    list: () => apiClient.get('/oauth/sessions').then(r => r.data),
    revoke: (id: number) => apiClient.delete(`/oauth/sessions/${id}`).then(r => r.data),
  },
}

export const tripsApi = {
  list: (params?: Record<string, unknown>) => apiClient.get('/trips', { params }).then(r => r.data),
  create: (data: Record<string, unknown>) => apiClient.post('/trips', data).then(r => r.data),
  get: (id: number | string) => apiClient.get(`/trips/${id}`).then(r => r.data),
  update: (id: number | string, data: Record<string, unknown>) => apiClient.put(`/trips/${id}`, data).then(r => r.data),
  delete: (id: number | string) => apiClient.delete(`/trips/${id}`).then(r => r.data),
  uploadCover: (id: number | string, formData: FormData) => apiClient.post(`/trips/${id}/cover`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),
  searchCoverImages: (q: string) => apiClient.get(`/trips/cover-search?q=${encodeURIComponent(q)}`).then(r => r.data) as Promise<{ photos: { id: string; url: string; thumb: string; description: string | null; photographer: string | null; photographerUrl: string | null; link: string }[] }>,
  triggerUnsplashDownload: (photoId: string) => apiClient.post('/trips/unsplash-download', { photoId }).then(r => r.data),
  archive: (id: number | string) => apiClient.put(`/trips/${id}`, { is_archived: true }).then(r => r.data),
  unarchive: (id: number | string) => apiClient.put(`/trips/${id}`, { is_archived: false }).then(r => r.data),
  getMembers: (id: number | string) => apiClient.get(`/trips/${id}/members`).then(r => r.data),
  addMember: (id: number | string, identifier: string) => apiClient.post(`/trips/${id}/members`, { identifier }).then(r => r.data),
  removeMember: (id: number | string, userId: number) => apiClient.delete(`/trips/${id}/members/${userId}`).then(r => r.data),
  copy: (id: number | string, data?: { title?: string }) => apiClient.post(`/trips/${id}/copy`, data || {}).then(r => r.data),
  bundle: (id: number | string) => apiClient.get(`/trips/${id}/bundle`).then(r => r.data),
  checkOverflow: (id: number | string, startDate: string, endDate: string) =>
    apiClient.get(`/trips/${id}/overflow-check`, { params: { start_date: startDate, end_date: endDate } }).then(r => r.data) as Promise<{ daysToRemove: number; assignments: number; notes: number; accommodations: number }>,
  getGroups: (id: number | string) => apiClient.get(`/trips/${id}/groups`).then(r => r.data) as Promise<{ groups: Array<{ id: number; name: string }> }>,
}

export const daysApi = {
  list: (tripId: number | string) => apiClient.get(`/trips/${tripId}/days`).then(r => r.data),
  create: (tripId: number | string, data: Record<string, unknown>) => apiClient.post(`/trips/${tripId}/days`, data).then(r => r.data),
  update: (tripId: number | string, dayId: number | string, data: Record<string, unknown>) => apiClient.put(`/trips/${tripId}/days/${dayId}`, data).then(r => r.data),
  delete: (tripId: number | string, dayId: number | string) => apiClient.delete(`/trips/${tripId}/days/${dayId}`).then(r => r.data),
}

export const placesApi = {
  list: (tripId: number | string, params?: Record<string, unknown>) => apiClient.get(`/trips/${tripId}/places`, { params }).then(r => r.data),
  create: (tripId: number | string, data: Record<string, unknown>) => apiClient.post(`/trips/${tripId}/places`, data).then(r => r.data),
  get: (tripId: number | string, id: number | string) => apiClient.get(`/trips/${tripId}/places/${id}`).then(r => r.data),
  update: (tripId: number | string, id: number | string, data: Record<string, unknown>) => apiClient.put(`/trips/${tripId}/places/${id}`, data).then(r => r.data),
  delete: (tripId: number | string, id: number | string) => apiClient.delete(`/trips/${tripId}/places/${id}`).then(r => r.data),
  searchImage: (tripId: number | string, id: number | string, q?: string) => apiClient.get(`/trips/${tripId}/places/${id}/image${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(r => r.data),
  setImage: (tripId: number | string, id: number | string, imageUrl: string) => apiClient.post(`/trips/${tripId}/places/${id}/image`, { image_url: imageUrl }).then(r => r.data),
  uploadPhoto: (tripId: number | string, id: number | string, formData: FormData) => apiClient.post(`/trips/${tripId}/places/${id}/photo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),
  deletePhoto: (tripId: number | string, id: number | string) => apiClient.delete(`/trips/${tripId}/places/${id}/photo`).then(r => r.data),
  importGpx: (tripId: number | string, file: File, opts?: { waypoints?: boolean; routes?: boolean; tracks?: boolean }) => {
    const fd = new FormData()
    fd.append('file', file)
    if (opts?.waypoints !== undefined) fd.append('importWaypoints', String(opts.waypoints))
    if (opts?.routes !== undefined) fd.append('importRoutes', String(opts.routes))
    if (opts?.tracks !== undefined) fd.append('importTracks', String(opts.tracks))
    return apiClient.post(`/trips/${tripId}/places/import/gpx`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
  },
  importMapFile: (tripId: number | string, file: File, opts?: { points?: boolean; paths?: boolean }) => {
    const fd = new FormData()
    fd.append('file', file)
    if (opts?.points !== undefined) fd.append('importPoints', String(opts.points))
    if (opts?.paths !== undefined) fd.append('importPaths', String(opts.paths))
    return apiClient.post(`/trips/${tripId}/places/import/map`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
  },
  importGoogleList: (tripId: number | string, url: string) =>
    apiClient.post(`/trips/${tripId}/places/import/google-list`, { url }).then(r => r.data),
  importNaverList: (tripId: number | string, url: string) =>
    apiClient.post(`/trips/${tripId}/places/import/naver-list`, { url }).then(r => r.data),
  bulkDelete: (tripId: number | string, ids: number[]) =>
    apiClient.post(`/trips/${tripId}/places/bulk-delete`, { ids }).then(r => r.data),
  importKml: (tripId: string | number, formData: FormData) =>
    apiClient.post(`/trips/${tripId}/places/import/kml`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),
  getVotes: (tripId: number | string, placeId: number | string) =>
    apiClient.get(`/trips/${tripId}/places/${placeId}/votes`).then(r => r.data),
  vote: (tripId: number | string, placeId: number | string, vote: 1 | -1 | null) =>
    apiClient.put(`/trips/${tripId}/places/${placeId}/vote`, { vote }).then(r => r.data),
}

export const assignmentsApi = {
  list: (tripId: number | string, dayId: number | string) => apiClient.get(`/trips/${tripId}/days/${dayId}/assignments`).then(r => r.data),
  create: (tripId: number | string, dayId: number | string, data: { place_id: number | string }) => apiClient.post(`/trips/${tripId}/days/${dayId}/assignments`, data).then(r => r.data),
  delete: (tripId: number | string, dayId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/days/${dayId}/assignments/${id}`).then(r => r.data),
  reorder: (tripId: number | string, dayId: number | string, orderedIds: number[]) => apiClient.put(`/trips/${tripId}/days/${dayId}/assignments/reorder`, { orderedIds }).then(r => r.data),
  move: (tripId: number | string, assignmentId: number, newDayId: number | string, orderIndex: number | null) => apiClient.put(`/trips/${tripId}/assignments/${assignmentId}/move`, { new_day_id: newDayId, order_index: orderIndex }).then(r => r.data),
  update: (tripId: number | string, dayId: number | string, id: number, data: Record<string, unknown>) => apiClient.put(`/trips/${tripId}/days/${dayId}/assignments/${id}`, data).then(r => r.data),
  getParticipants: (tripId: number | string, id: number) => apiClient.get(`/trips/${tripId}/assignments/${id}/participants`).then(r => r.data),
  setParticipants: (tripId: number | string, id: number, userIds: number[]) => apiClient.put(`/trips/${tripId}/assignments/${id}/participants`, { user_ids: userIds }).then(r => r.data),
  updateTime: (tripId: number | string, id: number, times: Record<string, unknown>) => apiClient.put(`/trips/${tripId}/assignments/${id}/time`, times).then(r => r.data),
}

export const packingApi = {
  list: (tripId: number | string) => apiClient.get(`/trips/${tripId}/packing`).then(r => r.data),
  create: (tripId: number | string, data: Record<string, unknown>) => apiClient.post(`/trips/${tripId}/packing`, data).then(r => r.data),
  bulkImport: (tripId: number | string, items: { name: string; category?: string; quantity?: number }[]) => apiClient.post(`/trips/${tripId}/packing/import`, { items }).then(r => r.data),
  update: (tripId: number | string, id: number, data: Record<string, unknown>) => apiClient.put(`/trips/${tripId}/packing/${id}`, data).then(r => r.data),
  delete: (tripId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/packing/${id}`).then(r => r.data),
  reorder: (tripId: number | string, orderedIds: number[]) => apiClient.put(`/trips/${tripId}/packing/reorder`, { orderedIds }).then(r => r.data),
  getCategoryAssignees: (tripId: number | string) => apiClient.get(`/trips/${tripId}/packing/category-assignees`).then(r => r.data),
  setCategoryAssignees: (tripId: number | string, categoryName: string, userIds: number[]) => apiClient.put(`/trips/${tripId}/packing/category-assignees/${encodeURIComponent(categoryName)}`, { user_ids: userIds }).then(r => r.data),
  applyTemplate: (tripId: number | string, templateId: number) => apiClient.post(`/trips/${tripId}/packing/apply-template/${templateId}`).then(r => r.data),
  saveAsTemplate: (tripId: number | string, name: string) => apiClient.post(`/trips/${tripId}/packing/save-as-template`, { name }).then(r => r.data),
  setBagMembers: (tripId: number | string, bagId: number, userIds: number[]) => apiClient.put(`/trips/${tripId}/packing/bags/${bagId}/members`, { user_ids: userIds }).then(r => r.data),
  listBags: (tripId: number | string) => apiClient.get(`/trips/${tripId}/packing/bags`).then(r => r.data),
  createBag: (tripId: number | string, data: { name: string; color?: string }) => apiClient.post(`/trips/${tripId}/packing/bags`, data).then(r => r.data),
  updateBag: (tripId: number | string, bagId: number, data: Record<string, unknown>) => apiClient.put(`/trips/${tripId}/packing/bags/${bagId}`, data).then(r => r.data),
  deleteBag: (tripId: number | string, bagId: number) => apiClient.delete(`/trips/${tripId}/packing/bags/${bagId}`).then(r => r.data),
}

export const todoApi = {
  list: (tripId: number | string) => apiClient.get(`/trips/${tripId}/todo`).then(r => r.data),
  create: (tripId: number | string, data: Record<string, unknown>) => apiClient.post(`/trips/${tripId}/todo`, data).then(r => r.data),
  update: (tripId: number | string, id: number, data: Record<string, unknown>) => apiClient.put(`/trips/${tripId}/todo/${id}`, data).then(r => r.data),
  delete: (tripId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/todo/${id}`).then(r => r.data),
  reorder: (tripId: number | string, orderedIds: number[]) => apiClient.put(`/trips/${tripId}/todo/reorder`, { orderedIds }).then(r => r.data),
  getCategoryAssignees: (tripId: number | string) => apiClient.get(`/trips/${tripId}/todo/category-assignees`).then(r => r.data),
  setCategoryAssignees: (tripId: number | string, categoryName: string, userIds: number[]) => apiClient.put(`/trips/${tripId}/todo/category-assignees/${encodeURIComponent(categoryName)}`, { user_ids: userIds }).then(r => r.data),
}

export const tagsApi = {
  list: () => apiClient.get('/tags').then(r => r.data),
  create: (data: Record<string, unknown>) => apiClient.post('/tags', data).then(r => r.data),
  update: (id: number, data: Record<string, unknown>) => apiClient.put(`/tags/${id}`, data).then(r => r.data),
  delete: (id: number) => apiClient.delete(`/tags/${id}`).then(r => r.data),
}

export const categoriesApi = {
  list: () => apiClient.get('/categories').then(r => r.data),
  listMy: () => apiClient.get('/categories/my').then(r => r.data),
  create: (data: Record<string, unknown>) => apiClient.post('/categories', data).then(r => r.data),
  update: (id: number, data: Record<string, unknown>) => apiClient.put(`/categories/${id}`, data).then(r => r.data),
  delete: (id: number) => apiClient.delete(`/categories/${id}`).then(r => r.data),
}

export const adminApi = {
  users: () => apiClient.get('/admin/users').then(r => r.data),
  createUser: (data: Record<string, unknown>) => apiClient.post('/admin/users', data).then(r => r.data),
  updateUser: (id: number, data: Record<string, unknown>) => apiClient.put(`/admin/users/${id}`, data).then(r => r.data),
  deleteUser: (id: number) => apiClient.delete(`/admin/users/${id}`).then(r => r.data),
  stats: () => apiClient.get('/admin/stats').then(r => r.data),
  getPlatformFee: () => apiClient.get('/admin/platform-fee').then(r => r.data),
  setPlatformFee: (platform_fee_percent: number | null) => apiClient.put('/admin/platform-fee', { platform_fee_percent }).then(r => r.data),
  getMollieFees: () => apiClient.get('/admin/mollie-fees').then(r => r.data),
  setMollieFees: (methods: Array<{ name: string; fixed_cents: number; variable_pct: number }>) => apiClient.put('/admin/mollie-fees', { methods }).then(r => r.data),
  getPayouts: () => apiClient.get('/admin/payouts').then(r => r.data),
  registerPayout: (data: { creator_user_id: number; amount_cents: number; description?: string }) => apiClient.post('/admin/payouts', data).then(r => r.data),
  saveDemoBaseline: () => apiClient.post('/admin/save-demo-baseline').then(r => r.data),
  getOidc: () => apiClient.get('/admin/oidc').then(r => r.data),
  updateOidc: (data: Record<string, unknown>) => apiClient.put('/admin/oidc', data).then(r => r.data),
  addons: () => apiClient.get('/admin/addons').then(r => r.data),
  updateAddon: (id: number | string, data: Record<string, unknown>) => apiClient.put(`/admin/addons/${id}`, data).then(r => r.data),
  checkVersion: () => apiClient.get('/admin/version-check').then(r => r.data),
  getBagTracking: () => apiClient.get('/admin/bag-tracking').then(r => r.data),
  updateBagTracking: (enabled: boolean) => apiClient.put('/admin/bag-tracking', { enabled }).then(r => r.data),
  getPlacesPhotos: () => apiClient.get('/admin/places-photos').then(r => r.data),
  updatePlacesPhotos: (enabled: boolean) => apiClient.put('/admin/places-photos', { enabled }).then(r => r.data),
  getPlacesAutocomplete: () => apiClient.get('/admin/places-autocomplete').then(r => r.data),
  updatePlacesAutocomplete: (enabled: boolean) => apiClient.put('/admin/places-autocomplete', { enabled }).then(r => r.data),
  getPlacesDetails: () => apiClient.get('/admin/places-details').then(r => r.data),
  updatePlacesDetails: (enabled: boolean) => apiClient.put('/admin/places-details', { enabled }).then(r => r.data),
  getCollabFeatures: () => apiClient.get('/admin/collab-features').then(r => r.data),
  updateCollabFeatures: (features: Record<string, boolean>) => apiClient.put('/admin/collab-features', features).then(r => r.data),
  packingTemplates: () => apiClient.get('/admin/packing-templates').then(r => r.data),
  getPackingTemplate: (id: number) => apiClient.get(`/admin/packing-templates/${id}`).then(r => r.data),
  createPackingTemplate: (data: { name: string }) => apiClient.post('/admin/packing-templates', data).then(r => r.data),
  updatePackingTemplate: (id: number, data: { name: string }) => apiClient.put(`/admin/packing-templates/${id}`, data).then(r => r.data),
  deletePackingTemplate: (id: number) => apiClient.delete(`/admin/packing-templates/${id}`).then(r => r.data),
  addTemplateCategory: (templateId: number, data: { name: string }) => apiClient.post(`/admin/packing-templates/${templateId}/categories`, data).then(r => r.data),
  updateTemplateCategory: (templateId: number, catId: number, data: { name: string }) => apiClient.put(`/admin/packing-templates/${templateId}/categories/${catId}`, data).then(r => r.data),
  deleteTemplateCategory: (templateId: number, catId: number) => apiClient.delete(`/admin/packing-templates/${templateId}/categories/${catId}`).then(r => r.data),
  addTemplateItem: (templateId: number, catId: number, data: { name: string }) => apiClient.post(`/admin/packing-templates/${templateId}/categories/${catId}/items`, data).then(r => r.data),
  updateTemplateItem: (templateId: number, itemId: number, data: { name: string }) => apiClient.put(`/admin/packing-templates/${templateId}/items/${itemId}`, data).then(r => r.data),
  deleteTemplateItem: (templateId: number, itemId: number) => apiClient.delete(`/admin/packing-templates/${templateId}/items/${itemId}`).then(r => r.data),
  listInvites: () => apiClient.get('/admin/invites').then(r => r.data),
  createInvite: (data: { max_uses: number; expires_in_days?: number }) => apiClient.post('/admin/invites', data).then(r => r.data),
  deleteInvite: (id: number) => apiClient.delete(`/admin/invites/${id}`).then(r => r.data),
  auditLog: (params?: { limit?: number; offset?: number }) =>
    apiClient.get('/admin/audit-log', { params }).then(r => r.data),
  mcpTokens: () => apiClient.get('/admin/mcp-tokens').then(r => r.data),
  deleteMcpToken: (id: number) => apiClient.delete(`/admin/mcp-tokens/${id}`).then(r => r.data),
  oauthSessions: () => apiClient.get('/admin/oauth-sessions').then(r => r.data),
  revokeOAuthSession: (id: number) => apiClient.delete(`/admin/oauth-sessions/${id}`).then(r => r.data),
  getPermissions: () => apiClient.get('/admin/permissions').then(r => r.data),
  updatePermissions: (permissions: Record<string, string>) => apiClient.put('/admin/permissions', { permissions }).then(r => r.data),
  rotateJwtSecret: () => apiClient.post('/admin/rotate-jwt-secret').then(r => r.data),
  sendTestNotification: (data: Record<string, unknown>) =>
    apiClient.post('/admin/dev/test-notification', data).then(r => r.data),
  getNotificationPreferences: () => apiClient.get('/admin/notification-preferences').then(r => r.data),
  updateNotificationPreferences: (prefs: Record<string, Record<string, boolean>>) => apiClient.put('/admin/notification-preferences', prefs).then(r => r.data),
  getDefaultUserSettings: () => apiClient.get('/admin/default-user-settings').then(r => r.data),
  updateDefaultUserSettings: (settings: Record<string, unknown>) => apiClient.put('/admin/default-user-settings', settings).then(r => r.data),
  getGroupWelcomeNotice: () => apiClient.get('/admin/group-welcome-notice').then(r => r.data) as Promise<{ title: string; body: string; icon: string }>,
  updateGroupWelcomeNotice: (data: { title: string; body: string; icon: string }) => apiClient.put('/admin/group-welcome-notice', data).then(r => r.data) as Promise<{ title: string; body: string; icon: string }>,
  getUnsplash: () => apiClient.get('/admin/unsplash').then(r => r.data) as Promise<{ configured: boolean }>,
  updateUnsplash: (key: string) => apiClient.put('/admin/unsplash', { key }).then(r => r.data) as Promise<{ configured: boolean }>,
}

export const addonsApi = {
  enabled: () => apiClient.get('/addons').then(r => r.data),
}

export const journeyApi = {
  list: () => apiClient.get('/journeys').then(r => r.data),
  create: (data: { title: string; subtitle?: string; trip_ids?: number[] }) => apiClient.post('/journeys', data).then(r => r.data),
  get: (id: number) => apiClient.get(`/journeys/${id}`).then(r => r.data),
  update: (id: number, data: Record<string, unknown>) => apiClient.patch(`/journeys/${id}`, data).then(r => r.data),
  delete: (id: number) => apiClient.delete(`/journeys/${id}`).then(r => r.data),

  suggestions: () => apiClient.get('/journeys/suggestions').then(r => r.data),
  availableTrips: () => apiClient.get('/journeys/available-trips').then(r => r.data),

  // Trips (sync sources)
  addTrip: (id: number, tripId: number) => apiClient.post(`/journeys/${id}/trips`, { trip_id: tripId }).then(r => r.data),
  removeTrip: (id: number, tripId: number) => apiClient.delete(`/journeys/${id}/trips/${tripId}`).then(r => r.data),

  // Entries
  listEntries: (id: number) => apiClient.get(`/journeys/${id}/entries`).then(r => r.data),
  createEntry: (id: number, data: Record<string, unknown>) => apiClient.post(`/journeys/${id}/entries`, data).then(r => r.data),
  updateEntry: (entryId: number, data: Record<string, unknown>) => apiClient.patch(`/journeys/entries/${entryId}`, data).then(r => r.data),
  deleteEntry: (entryId: number) => apiClient.delete(`/journeys/entries/${entryId}`).then(r => r.data),
  reorderEntries: (journeyId: number, orderedIds: number[]) => apiClient.put(`/journeys/${journeyId}/entries/reorder`, { orderedIds }).then(r => r.data),

  // Photos
  uploadPhotos: (entryId: number, formData: FormData) => apiClient.post(`/journeys/entries/${entryId}/photos`, formData, { headers: { 'Content-Type': undefined as any } }).then(r => r.data),
  uploadGalleryPhotos: (journeyId: number, formData: FormData) => apiClient.post(`/journeys/${journeyId}/gallery/photos`, formData, { headers: { 'Content-Type': undefined as any } }).then(r => r.data),
  addProviderPhotosToGallery: (journeyId: number, provider: string, assetIds: string[], passphrase?: string) => apiClient.post(`/journeys/${journeyId}/gallery/provider-photos`, { provider, asset_ids: assetIds, ...(passphrase ? { passphrase } : {}) }).then(r => r.data),
  addProviderPhoto: (entryId: number, provider: string, assetId: string, caption?: string, passphrase?: string) => apiClient.post(`/journeys/entries/${entryId}/provider-photos`, { provider, asset_id: assetId, caption, ...(passphrase ? { passphrase } : {}) }).then(r => r.data),
  addProviderPhotos: (entryId: number, provider: string, assetIds: string[], caption?: string, passphrase?: string) => apiClient.post(`/journeys/entries/${entryId}/provider-photos`, { provider, asset_ids: assetIds, caption, ...(passphrase ? { passphrase } : {}) }).then(r => r.data),
  linkPhoto: (entryId: number, journeyPhotoId: number) => apiClient.post(`/journeys/entries/${entryId}/link-photo`, { journey_photo_id: journeyPhotoId }).then(r => r.data),
  unlinkPhoto: (entryId: number, journeyPhotoId: number) => apiClient.delete(`/journeys/entries/${entryId}/photos/${journeyPhotoId}`).then(r => r.data),
  deleteGalleryPhoto: (journeyId: number, journeyPhotoId: number) => apiClient.delete(`/journeys/${journeyId}/gallery/${journeyPhotoId}`).then(r => r.data),
  updatePhoto: (photoId: number, data: Record<string, unknown>) => apiClient.patch(`/journeys/photos/${photoId}`, data).then(r => r.data),
  deletePhoto: (photoId: number) => apiClient.delete(`/journeys/photos/${photoId}`).then(r => r.data),

  // Cover
  uploadCover: (id: number, formData: FormData) => apiClient.post(`/journeys/${id}/cover`, formData, { headers: { 'Content-Type': undefined as any } }).then(r => r.data),

  // Contributors
  addContributor: (id: number, userId: number, role: string) => apiClient.post(`/journeys/${id}/contributors`, { user_id: userId, role }).then(r => r.data),
  updateContributor: (id: number, userId: number, role: string) => apiClient.patch(`/journeys/${id}/contributors/${userId}`, { role }).then(r => r.data),
  removeContributor: (id: number, userId: number) => apiClient.delete(`/journeys/${id}/contributors/${userId}`).then(r => r.data),

  // Preferences
  updatePreferences: (id: number, data: { hide_skeletons?: boolean }) => apiClient.patch(`/journeys/${id}/preferences`, data).then(r => r.data),

  // Share
  getShareLink: (id: number) => apiClient.get(`/journeys/${id}/share-link`).then(r => r.data),
  createShareLink: (id: number, perms: { share_timeline?: boolean; share_gallery?: boolean; share_map?: boolean }) => apiClient.post(`/journeys/${id}/share-link`, perms).then(r => r.data),
  deleteShareLink: (id: number) => apiClient.delete(`/journeys/${id}/share-link`).then(r => r.data),
  getPublicJourney: (token: string) => apiClient.get(`/public/journey/${token}`).then(r => r.data),
}

export const mapsApi = {
  search: (query: string, lang?: string) => apiClient.post(`/maps/search?lang=${lang || 'en'}`, { query }).then(r => r.data),
  autocomplete: (input: string, lang?: string, locationBias?: { low: { lat: number; lng: number }; high: { lat: number; lng: number } }, signal?: AbortSignal, types?: string[]) =>
    apiClient.post('/maps/autocomplete', { input, lang, locationBias, types }, { signal }).then(r => r.data),
  details: (placeId: string, lang?: string) => apiClient.get(`/maps/details/${encodeURIComponent(placeId)}`, { params: { lang } }).then(r => r.data),
  placePhoto: (placeId: string, lat?: number, lng?: number, name?: string) => apiClient.get(`/maps/place-photo/${encodeURIComponent(placeId)}`, { params: { lat, lng, name } }).then(r => r.data),
  reverse: (lat: number, lng: number, lang?: string) => apiClient.get('/maps/reverse', { params: { lat, lng, lang } }).then(r => r.data),
  resolveUrl: (url: string) => apiClient.post('/maps/resolve-url', { url }).then(r => r.data),
}

export const airportsApi = {
  search: (q: string, signal?: AbortSignal) => apiClient.get('/airports/search', { params: { q }, signal }).then(r => r.data),
  byIata: (iata: string) => apiClient.get(`/airports/${encodeURIComponent(iata)}`).then(r => r.data),
}

export const budgetApi = {
  list: (tripId: number | string) => apiClient.get(`/trips/${tripId}/budget`).then(r => r.data),
  create: (tripId: number | string, data: Record<string, unknown>) => apiClient.post(`/trips/${tripId}/budget`, data).then(r => r.data),
  update: (tripId: number | string, id: number, data: Record<string, unknown>) => apiClient.put(`/trips/${tripId}/budget/${id}`, data).then(r => r.data),
  delete: (tripId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/budget/${id}`).then(r => r.data),
  setMembers: (tripId: number | string, id: number, userIds: number[]) => apiClient.put(`/trips/${tripId}/budget/${id}/members`, { user_ids: userIds }).then(r => r.data),
  togglePaid: (tripId: number | string, id: number, userId: number, paid: boolean) => apiClient.put(`/trips/${tripId}/budget/${id}/members/${userId}/paid`, { paid }).then(r => r.data),
  perPersonSummary: (tripId: number | string) => apiClient.get(`/trips/${tripId}/budget/summary/per-person`).then(r => r.data),
  settlement: (tripId: number | string) => apiClient.get(`/trips/${tripId}/budget/settlement`).then(r => r.data),
  reorderItems: (tripId: number | string, orderedIds: number[]) => apiClient.put(`/trips/${tripId}/budget/reorder/items`, { orderedIds }).then(r => r.data),
  reorderCategories: (tripId: number | string, orderedCategories: string[]) => apiClient.put(`/trips/${tripId}/budget/reorder/categories`, { orderedCategories }).then(r => r.data),
}

export const filesApi = {
  list: (tripId: number | string, trash?: boolean) => apiClient.get(`/trips/${tripId}/files`, { params: trash ? { trash: 'true' } : {} }).then(r => r.data),
  upload: (tripId: number | string, formData: FormData) => apiClient.post(`/trips/${tripId}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data),
  update: (tripId: number | string, id: number, data: Record<string, unknown>) => apiClient.put(`/trips/${tripId}/files/${id}`, data).then(r => r.data),
  delete: (tripId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/files/${id}`).then(r => r.data),
  toggleStar: (tripId: number | string, id: number) => apiClient.patch(`/trips/${tripId}/files/${id}/star`).then(r => r.data),
  restore: (tripId: number | string, id: number) => apiClient.post(`/trips/${tripId}/files/${id}/restore`).then(r => r.data),
  permanentDelete: (tripId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/files/${id}/permanent`).then(r => r.data),
  emptyTrash: (tripId: number | string) => apiClient.delete(`/trips/${tripId}/files/trash/empty`).then(r => r.data),
  addLink: (tripId: number | string, fileId: number, data: { reservation_id?: number; assignment_id?: number }) => apiClient.post(`/trips/${tripId}/files/${fileId}/link`, data).then(r => r.data),
  removeLink: (tripId: number | string, fileId: number, linkId: number) => apiClient.delete(`/trips/${tripId}/files/${fileId}/link/${linkId}`).then(r => r.data),
  getLinks: (tripId: number | string, fileId: number) => apiClient.get(`/trips/${tripId}/files/${fileId}/links`).then(r => r.data),
}

export const reservationsApi = {
  list: (tripId: number | string) => apiClient.get(`/trips/${tripId}/reservations`).then(r => r.data),
  create: (tripId: number | string, data: Record<string, unknown>) => apiClient.post(`/trips/${tripId}/reservations`, data).then(r => r.data),
  update: (tripId: number | string, id: number, data: Record<string, unknown>) => apiClient.put(`/trips/${tripId}/reservations/${id}`, data).then(r => r.data),
  delete: (tripId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/reservations/${id}`).then(r => r.data),
  updatePositions: (tripId: number | string, positions: { id: number; day_plan_position: number }[], dayId?: number) => apiClient.put(`/trips/${tripId}/reservations/positions`, { positions, day_id: dayId }).then(r => r.data),
}

export const weatherApi = {
  get: (lat: number, lng: number, date: string) => apiClient.get('/weather', { params: { lat, lng, date } }).then(r => r.data),
  getDetailed: (lat: number, lng: number, date: string, lang?: string) => apiClient.get('/weather/detailed', { params: { lat, lng, date, lang } }).then(r => r.data),
}

export const configApi = {
  getPublicConfig: (): Promise<{ defaultLanguage: string }> =>
    apiClient.get('/config').then(r => r.data),
}

export const settingsApi = {
  get: () => apiClient.get('/settings').then(r => r.data),
  set: (key: string, value: unknown) => apiClient.put('/settings', { key, value }).then(r => r.data),
  setBulk: (settings: Record<string, unknown>) => apiClient.post('/settings/bulk', { settings }).then(r => r.data),
}

export const accommodationsApi = {
  list: (tripId: number | string) => apiClient.get(`/trips/${tripId}/accommodations`).then(r => r.data),
  create: (tripId: number | string, data: Record<string, unknown>) => apiClient.post(`/trips/${tripId}/accommodations`, data).then(r => r.data),
  update: (tripId: number | string, id: number, data: Record<string, unknown>) => apiClient.put(`/trips/${tripId}/accommodations/${id}`, data).then(r => r.data),
  delete: (tripId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/accommodations/${id}`).then(r => r.data),
}

export const dayNotesApi = {
  list: (tripId: number | string, dayId: number | string) => apiClient.get(`/trips/${tripId}/days/${dayId}/notes`).then(r => r.data),
  create: (tripId: number | string, dayId: number | string, data: Record<string, unknown>) => apiClient.post(`/trips/${tripId}/days/${dayId}/notes`, data).then(r => r.data),
  update: (tripId: number | string, dayId: number | string, id: number, data: Record<string, unknown>) => apiClient.put(`/trips/${tripId}/days/${dayId}/notes/${id}`, data).then(r => r.data),
  delete: (tripId: number | string, dayId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/days/${dayId}/notes/${id}`).then(r => r.data),
}

export const collabApi = {
  getNotes: (tripId: number | string) => apiClient.get(`/trips/${tripId}/collab/notes`).then(r => r.data),
  createNote: (tripId: number | string, data: Record<string, unknown>) => apiClient.post(`/trips/${tripId}/collab/notes`, data).then(r => r.data),
  updateNote: (tripId: number | string, id: number, data: Record<string, unknown>) => apiClient.put(`/trips/${tripId}/collab/notes/${id}`, data).then(r => r.data),
  deleteNote: (tripId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/collab/notes/${id}`).then(r => r.data),
  uploadNoteFile: (tripId: number | string, noteId: number, formData: FormData) => apiClient.post(`/trips/${tripId}/collab/notes/${noteId}/files`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),
  deleteNoteFile: (tripId: number | string, noteId: number, fileId: number) => apiClient.delete(`/trips/${tripId}/collab/notes/${noteId}/files/${fileId}`).then(r => r.data),
  getPolls: (tripId: number | string) => apiClient.get(`/trips/${tripId}/collab/polls`).then(r => r.data),
  createPoll: (tripId: number | string, data: Record<string, unknown>) => apiClient.post(`/trips/${tripId}/collab/polls`, data).then(r => r.data),
  votePoll: (tripId: number | string, id: number, optionIndex: number) => apiClient.post(`/trips/${tripId}/collab/polls/${id}/vote`, { option_index: optionIndex }).then(r => r.data),
  closePoll: (tripId: number | string, id: number) => apiClient.put(`/trips/${tripId}/collab/polls/${id}/close`).then(r => r.data),
  deletePoll: (tripId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/collab/polls/${id}`).then(r => r.data),
  getMessages: (tripId: number | string, before?: string) => apiClient.get(`/trips/${tripId}/collab/messages${before ? `?before=${before}` : ''}`).then(r => r.data),
  sendMessage: (tripId: number | string, data: Record<string, unknown>) => apiClient.post(`/trips/${tripId}/collab/messages`, data).then(r => r.data),
  deleteMessage: (tripId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/collab/messages/${id}`).then(r => r.data),
  reactMessage: (tripId: number | string, id: number, emoji: string) => apiClient.post(`/trips/${tripId}/collab/messages/${id}/react`, { emoji }).then(r => r.data),
  linkPreview: (tripId: number | string, url: string) => apiClient.get(`/trips/${tripId}/collab/link-preview?url=${encodeURIComponent(url)}`).then(r => r.data),
}

export const dateProposalsApi = {
  list: (groupId: number | string) => apiClient.get(`/groups/${groupId}/date-proposals`).then(r => r.data),
  create: (groupId: number | string, data: { title?: string; period_start: string; period_end: string; deadline?: string | null; reminder_days?: number }) =>
    apiClient.post(`/groups/${groupId}/date-proposals`, data).then(r => r.data),
  delete: (groupId: number | string, proposalId: number) =>
    apiClient.delete(`/groups/${groupId}/date-proposals/${proposalId}`).then(r => r.data),
  setAvailability: (groupId: number | string, proposalId: number, responses: Record<string, 'yes' | 'no' | 'maybe' | null>, notes?: Record<string, string | null>) =>
    apiClient.put(`/groups/${groupId}/date-proposals/${proposalId}/availability`, { responses, notes }).then(r => r.data),
  myProposals: () => apiClient.get('/date-proposals').then(r => r.data),
  getAnalysis: (groupId: number | string, proposalId: number, minDays = 3, maxSuggestions = 5) =>
    apiClient.get(`/groups/${groupId}/date-proposals/${proposalId}/analysis`, { params: { min_days: minDays, max_suggestions: maxSuggestions } }).then(r => r.data),
  confirm: (groupId: number | string, proposalId: number, data: { confirmed_start: string; confirmed_end: string }) =>
    apiClient.patch(`/groups/${groupId}/date-proposals/${proposalId}/confirm`, data).then(r => r.data),
  reopen: (groupId: number | string, proposalId: number) =>
    apiClient.patch(`/groups/${groupId}/date-proposals/${proposalId}/reopen`).then(r => r.data),
  createGuestLink: (groupId: number | string, proposalId: number, expiresInDays?: number) =>
    apiClient.post(`/groups/${groupId}/date-proposals/${proposalId}/guest-link`, { expires_in_days: expiresInDays }).then(r => r.data),
  deleteGuestLink: (groupId: number | string, proposalId: number, tokenId: number) =>
    apiClient.delete(`/groups/${groupId}/date-proposals/${proposalId}/guest-link/${tokenId}`).then(r => r.data),
  ping: (groupId: number | string, proposalId: number) =>
    apiClient.post(`/groups/${groupId}/date-proposals/${proposalId}/ping`).then(r => r.data),
}

export const availabilityApi = {
  listVacationDays: () => apiClient.get('/availability/vacation-days').then(r => r.data),
  createVacationDay: (data: { start_date: string; end_date: string; label?: string; color?: string }) =>
    apiClient.post('/availability/vacation-days', data).then(r => r.data),
  deleteVacationDay: (id: number) => apiClient.delete(`/availability/vacation-days/${id}`).then(r => r.data),

  listCompanyHolidays: () => apiClient.get('/availability/company-holidays').then(r => r.data),
  createCompanyHoliday: (data: { date: string; name: string; color?: string }) =>
    apiClient.post('/availability/company-holidays', data).then(r => r.data),
  deleteCompanyHoliday: (id: number) => apiClient.delete(`/availability/company-holidays/${id}`).then(r => r.data),

  listHolidayCountries: () => apiClient.get('/availability/holidays/countries').then(r => r.data),
  getHolidays: (year: number | string, country: string) =>
    apiClient.get(`/availability/holidays/${year}/${country}`).then(r => r.data),
}

export const backupApi = {
  list: () => apiClient.get('/backup/list').then(r => r.data),
  create: () => apiClient.post('/backup/create').then(r => r.data),
  download: async (filename: string): Promise<void> => {
    const res = await fetch(`/api/backup/download/${filename}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Download failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
  delete: (filename: string) => apiClient.delete(`/backup/${filename}`).then(r => r.data),
  restore: (filename: string) => apiClient.post(`/backup/restore/${filename}`).then(r => r.data),
  uploadRestore: (file: File) => {
    const form = new FormData()
    form.append('backup', file)
    return apiClient.post('/backup/upload-restore', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
  },
  getAutoSettings: () => apiClient.get('/backup/auto-settings').then(r => r.data),
  setAutoSettings: (settings: Record<string, unknown>) => apiClient.put('/backup/auto-settings', settings).then(r => r.data),
}

export const shareApi = {
  getLink: (tripId: number | string) => apiClient.get(`/trips/${tripId}/share-link`).then(r => r.data),
  createLink: (tripId: number | string, perms?: Record<string, boolean>) => apiClient.post(`/trips/${tripId}/share-link`, perms || {}).then(r => r.data),
  deleteLink: (tripId: number | string) => apiClient.delete(`/trips/${tripId}/share-link`).then(r => r.data),
  getSharedTrip: (token: string) => apiClient.get(`/shared/${token}`).then(r => r.data),
  cloneTrip: (token: string) => apiClient.post(`/shared/${token}/clone`).then(r => r.data),
  getCollabInvite: (tripId: number | string) => apiClient.get(`/trips/${tripId}/collab-invite`).then(r => r.data),
  createCollabInvite: (tripId: number | string) => apiClient.post(`/trips/${tripId}/collab-invite`).then(r => r.data),
  revokeCollabInvite: (tripId: number | string) => apiClient.delete(`/trips/${tripId}/collab-invite`).then(r => r.data),
  updateCollabInvite: (tripId: number | string, data: { visible_to_members: boolean }) => apiClient.patch(`/trips/${tripId}/collab-invite`, data).then(r => r.data),
  previewCollabInvite: (token: string) => apiClient.get(`/invite/trip/${token}`).then(r => r.data),
  joinTripViaInvite: (token: string) => apiClient.post(`/invite/trip/${token}/join`).then(r => r.data),
}

export const notificationsApi = {
  getPreferences: () => apiClient.get('/notifications/preferences').then(r => r.data),
  updatePreferences: (prefs: Record<string, Record<string, boolean>>) => apiClient.put('/notifications/preferences', prefs).then(r => r.data),
  testSmtp: (email?: string) => apiClient.post('/notifications/test-smtp', { email }).then(r => r.data),
  testWebhook: (url?: string) => apiClient.post('/notifications/test-webhook', { url }).then(r => r.data),
  testNtfy: (payload: { topic?: string; server?: string | null; token?: string | null }) => apiClient.post('/notifications/test-ntfy', payload).then(r => r.data),
}

export const inAppNotificationsApi = {
  list: (params?: { limit?: number; offset?: number; unread_only?: boolean }) =>
    apiClient.get('/notifications/in-app', { params }).then(r => r.data),
  unreadCount: () =>
    apiClient.get('/notifications/in-app/unread-count').then(r => r.data),
  markRead: (id: number) =>
    apiClient.put(`/notifications/in-app/${id}/read`).then(r => r.data),
  markUnread: (id: number) =>
    apiClient.put(`/notifications/in-app/${id}/unread`).then(r => r.data),
  markAllRead: () =>
    apiClient.put('/notifications/in-app/read-all').then(r => r.data),
  delete: (id: number) =>
    apiClient.delete(`/notifications/in-app/${id}`).then(r => r.data),
  deleteAll: () =>
    apiClient.delete('/notifications/in-app/all').then(r => r.data),
  respond: (id: number, response: 'positive' | 'negative') =>
    apiClient.post(`/notifications/in-app/${id}/respond`, { response }).then(r => r.data),
}

export const groupsApi = {
  list: () => apiClient.get('/addons/groups').then(r => r.data),
  create: (data: { name: string; description?: string; cover_image?: string }) =>
    apiClient.post('/addons/groups', data).then(r => r.data),
  get: (id: number) => apiClient.get(`/addons/groups/${id}`).then(r => r.data),
  update: (id: number, data: { name?: string; description?: string | null; cover_image?: string | null }) =>
    apiClient.put(`/addons/groups/${id}`, data).then(r => r.data),
  delete: (id: number) => apiClient.delete(`/addons/groups/${id}`).then(r => r.data),

  addMember: (id: number, userId: number, role?: string) =>
    apiClient.post(`/addons/groups/${id}/members`, { user_id: userId, role }).then(r => r.data),
  removeMember: (id: number, userId: number) =>
    apiClient.delete(`/addons/groups/${id}/members/${userId}`).then(r => r.data),
  leaveGroup: (id: number, newAdminId?: number) =>
    apiClient.post(`/addons/groups/${id}/leave`, { new_admin_id: newAdminId }).then(r => r.data),
  updateMemberRole: (id: number, userId: number, role: string) =>
    apiClient.put(`/addons/groups/${id}/members/${userId}/role`, { role }).then(r => r.data),

  addTrip: (id: number, tripId: number) =>
    apiClient.post(`/addons/groups/${id}/trips`, { trip_id: tripId }).then(r => r.data),
  removeTrip: (id: number, tripId: number) =>
    apiClient.delete(`/addons/groups/${id}/trips/${tripId}`).then(r => r.data),

  searchUsers: (q: string) => apiClient.get('/addons/groups/users/search', { params: { q } }).then(r => r.data),

  createInviteLink: (id: number, data?: { role?: string; max_uses?: number; expires_in_days?: number }) =>
    apiClient.post(`/addons/groups/${id}/invite-link`, data || {}).then(r => r.data),
  getInviteLink: (id: number) => apiClient.get(`/addons/groups/${id}/invite-link`).then(r => r.data),
  deleteInviteLink: (id: number) => apiClient.delete(`/addons/groups/${id}/invite-link`).then(r => r.data),
  validateInvite: (token: string) => apiClient.get(`/addons/groups/join/${token}`).then(r => r.data),
  joinWithToken: (token: string) => apiClient.post(`/addons/groups/join/${token}`).then(r => r.data),

  // Polls
  listPolls: (tripId: number | string) => apiClient.get(`/addons/groups/polls/${tripId}`).then(r => r.data),
  createPoll: (tripId: number | string, data: { title: string; description?: string; type?: string; deadline?: string; anonymous?: boolean; allow_guest_votes?: boolean }) =>
    apiClient.post(`/addons/groups/polls/${tripId}`, data).then(r => r.data),
  addPollOption: (tripId: number | string, pollId: string, data: { label: string; description?: string; lat?: number; lng?: number; image_url?: string }) =>
    apiClient.post(`/addons/groups/polls/${tripId}/${pollId}/options`, data).then(r => r.data),
  deletePollOption: (tripId: number | string, pollId: string, optionId: string) =>
    apiClient.delete(`/addons/groups/polls/${tripId}/${pollId}/options/${optionId}`).then(r => r.data),
  vote: (tripId: number | string, pollId: string, optionId: string) =>
    apiClient.post(`/addons/groups/polls/${tripId}/${pollId}/vote`, { option_id: optionId }).then(r => r.data),
  closePoll: (tripId: number | string, pollId: string, status: 'closed' | 'decided', decidedOptionId?: string) =>
    apiClient.patch(`/addons/groups/polls/${tripId}/${pollId}`, { status, decided_option_id: decidedOptionId }).then(r => r.data),
  submitRankedVote: (tripId: number | string, pollId: string, rankings: Array<{ option_id: string; rank: number }>) =>
    apiClient.post(`/addons/groups/polls/${tripId}/${pollId}/ranked-vote`, { rankings }).then(r => r.data),
  swipeVote: (tripId: number | string, pollId: string, optionId: string, swipeValue: string) =>
    apiClient.post(`/addons/groups/polls/${tripId}/${pollId}/swipe`, { option_id: optionId, swipe_value: swipeValue }).then(r => r.data),
  getSwipeMatches: (tripId: number | string, pollId: string) =>
    apiClient.get(`/addons/groups/polls/${tripId}/${pollId}/matches`).then(r => r.data),
  createGuestLink: (tripId: number | string, pollId: string) =>
    apiClient.post(`/addons/groups/polls/${tripId}/${pollId}/guest-link`).then(r => r.data),
}

export const exploreApi = {
  getFeaturedTrips: (limit?: number) =>
    apiClient.get('/addons/explore/trips/featured', { params: limit ? { limit } : undefined }).then(r => r.data),
  listTrips: (params?: {
    filter?: 'all' | 'curated' | 'community'
    q?: string
    minPrice?: number
    maxPrice?: number
    destination?: string
    difficulty?: string
    tag?: string
    sort?: 'newest' | 'popular' | 'rating' | 'price_asc' | 'price_desc'
    page?: number
    limit?: number
  }) =>
    apiClient.get('/addons/explore/trips', { params: params || undefined }).then(r => r.data),
  getTrip: (id: number | string) => apiClient.get(`/addons/explore/trips/${id}`).then(r => r.data),
  publishTrip: (id: number | string, price: number, descriptions?: Record<string, string>, community_enabled?: boolean) =>
    apiClient.post(`/addons/explore/trips/${id}/publish`, { price, descriptions, community_enabled }).then(r => r.data),
  publishUpdate: (id: number | string, descriptions?: Record<string, string>) =>
    apiClient.post(`/addons/explore/trips/${id}/publish-update`, { descriptions }).then(r => r.data),
  unpublishTrip: (id: number | string) => apiClient.post(`/addons/explore/trips/${id}/unpublish`).then(r => r.data),
  purchaseTrip: (id: number | string, data: { title: string }) => apiClient.post(`/addons/explore/trips/${id}/purchase`, data).then(r => r.data),
  syncTrip: (tripId: number | string) => apiClient.post(`/addons/explore/trips/${tripId}/sync`).then(r => r.data),
  getSyncStatus: (tripId: number | string) => apiClient.get(`/addons/explore/trips/${tripId}/sync-status`).then(r => r.data),
  getCommunityPlaces: (sourceTripId: number | string) =>
    apiClient.get(`/addons/explore/trips/${sourceTripId}/community-places`).then(r => r.data),
  contributeCommunityPlace: (sourceTripId: number | string, data: Record<string, unknown>) =>
    apiClient.post(`/addons/explore/trips/${sourceTripId}/community-places`, data).then(r => r.data),
  deleteCommunityPlace: (sourceTripId: number | string, placeId: number | string) =>
    apiClient.delete(`/addons/explore/trips/${sourceTripId}/community-places/${placeId}`).then(r => r.data),
  // Creator submission flow
  submitTrip: (id: number | string, data: {
    price?: number;
    descriptions?: Record<string, string>;
    community_enabled?: boolean;
    listing_title?: string;
    tagline?: string;
    tags?: string[];
    destination?: string;
    country_code?: string;
    difficulty?: string;
    best_season?: string[];
  }) =>
    apiClient.post(`/addons/explore/trips/${id}/submit`, data).then(r => r.data),
  getMySubmissions: () => apiClient.get('/addons/explore/my-submissions').then(r => r.data),
  withdrawSubmission: (submissionId: number | string) => apiClient.delete(`/addons/explore/submissions/${submissionId}`).then(r => r.data),
  // Creator updates to published listings
  pushUpdate: (id: number | string, changelog?: string) =>
    apiClient.post(`/addons/explore/trips/${id}/push-update`, { changelog }).then(r => r.data),
  resubmitForReview: (id: number | string, message?: string) =>
    apiClient.post(`/addons/explore/trips/${id}/resubmit-for-review`, { message }).then(r => r.data),
  getPublicationStatus: (id: number | string) =>
    apiClient.get(`/addons/explore/trips/${id}/publication-status`).then(r => r.data),
  // Admin submission management
  getSubmissions: (status?: 'pending' | 'approved' | 'rejected') =>
    apiClient.get('/addons/explore/submissions', { params: status ? { status } : undefined }).then(r => r.data),
  getAdminSubmissions: (status?: 'pending' | 'approved' | 'rejected' | 'all') =>
    apiClient.get('/addons/explore/submissions', { params: status && status !== 'all' ? { status } : undefined }).then(r => r.data),
  approveSubmission: (submissionId: number | string, data: { auto_approve?: boolean; price?: number; descriptions?: Record<string, string>; community_enabled?: boolean }) =>
    apiClient.post(`/addons/explore/submissions/${submissionId}/approve`, data).then(r => r.data),
  rejectSubmission: (submissionId: number | string, data?: { notes?: string }) =>
    apiClient.post(`/addons/explore/submissions/${submissionId}/reject`, data || {}).then(r => r.data),
  // Version history & suspension
  getVersionHistory: (tripId: number | string) =>
    apiClient.get(`/addons/explore/version-history/${tripId}`).then(r => r.data),
  suspendListing: (submissionId: number | string, data: { reason?: string }) =>
    apiClient.post(`/addons/explore/submissions/${submissionId}/suspend`, data).then(r => r.data),
  unsuspendListing: (submissionId: number | string) =>
    apiClient.post(`/addons/explore/submissions/${submissionId}/unsuspend`, {}).then(r => r.data),
  suspendCreator: (creatorId: number | string, data: { reason?: string }) =>
    apiClient.post(`/addons/explore/creators/${creatorId}/suspend`, data).then(r => r.data),
  unsuspendCreator: (creatorId: number | string) =>
    apiClient.post(`/addons/explore/creators/${creatorId}/unsuspend`, {}).then(r => r.data),
  // Fork deltas (tracking changes in forked trips)
  getForkDeltas: (sourceId: number | string, forkedId: number | string) =>
    apiClient.get(`/addons/explore/fork-deltas/${sourceId}/${forkedId}`).then(r => r.data),
  // Reviews & Ratings
  getReviews: (sourceTripId: number | string, sortBy?: 'recent' | 'helpful' | 'rating_high' | 'rating_low') =>
    apiClient.get(`/addons/explore/trips/${sourceTripId}/reviews`, { params: sortBy ? { sortBy } : undefined }).then(r => r.data),
  createReview: (sourceTripId: number | string, data: { rating: number; title?: string; content: string }) =>
    apiClient.post(`/addons/explore/trips/${sourceTripId}/reviews`, data).then(r => r.data),
  deleteReview: (reviewId: number | string) =>
    apiClient.delete(`/addons/explore/reviews/${reviewId}`).then(r => r.data),
  markReviewHelpful: (reviewId: number | string, isHelpful: boolean) =>
    apiClient.post(`/addons/explore/reviews/${reviewId}/helpful`, { is_helpful: isHelpful }).then(r => r.data),
  removeReviewHelpful: (reviewId: number | string) =>
    apiClient.delete(`/addons/explore/reviews/${reviewId}/helpful`).then(r => r.data),
  // Configuration
  getConfig: () =>
    apiClient.get('/addons/explore/config').then(r => r.data),
  // Creator profile
  applyCreator: (data: { display_name: string; slug: string; bio?: string; avatar?: string; social_links?: Record<string, string> }) =>
    apiClient.post('/addons/explore/creators/apply', data).then(r => r.data),
  getCreatorProfile: () =>
    apiClient.get('/addons/explore/creators/me').then(r => r.data),
  checkSlugAvailability: (slug: string) =>
    apiClient.get(`/addons/explore/creators/check-slug/${slug}`).then(r => r.data),
  getCreatorStorefront: (slug: string) =>
    apiClient.get(`/addons/explore/creators/${slug}`).then(r => r.data),
  // Payments
  createPayment: (id: number | string) =>
    apiClient.post(`/addons/explore/payments/trips/${id}/create-payment`).then(r => r.data),
  getEarnings: () =>
    apiClient.get('/addons/explore/payments/earnings').then(r => r.data),
  getDetailedEarnings: () =>
    apiClient.get('/addons/explore/payments/earnings/detailed').then(r => r.data),
  // Admin
  toggleFeatured: (listingId: number | string, is_featured: boolean) =>
    apiClient.patch(`/admin/explore/listings/${listingId}/featured`, { is_featured }).then(r => r.data),
}

export const mollieApi = {
  getStatus: () => apiClient.get('/mollie/status').then(r => r.data),
}

export const worldmapApi = {
  getCountries: () => apiClient.get('/addons/worldmap/countries').then(r => r.data),
  getEntries: (country?: string) =>
    apiClient.get('/addons/worldmap/entries', { params: country ? { country } : undefined }).then(r => r.data),
  addEntry: (data: { country_code: string; name: string; description?: string; category?: string; lat?: number; lng?: number }) =>
    apiClient.post('/addons/worldmap/entries', data).then(r => r.data),
  deleteEntry: (id: number) => apiClient.delete(`/addons/worldmap/entries/${id}`).then(r => r.data),
}

export const atlasApi = {
  listResidency: () => apiClient.get('/addons/atlas/residency').then(r => r.data),
  createResidency: (data: Record<string, unknown>) => apiClient.post('/addons/atlas/residency', data).then(r => r.data),
  deleteResidency: (id: number) => apiClient.delete(`/addons/atlas/residency/${id}`).then(r => r.data),
  listVolunteering: () => apiClient.get('/addons/atlas/volunteering').then(r => r.data),
  createVolunteering: (data: Record<string, unknown>) => apiClient.post('/addons/atlas/volunteering', data).then(r => r.data),
  deleteVolunteering: (id: number) => apiClient.delete(`/addons/atlas/volunteering/${id}`).then(r => r.data),
}

export default apiClient
