const FALLBACK_RENDER_API = 'https://sentinel-fleet-recovery-ai-api.onrender.com'
const FALLBACK_RENDER_WS = 'wss://sentinel-fleet-recovery-ai-api.onrender.com'

export function resolveApiBaseUrl() {
  const explicitUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL
  if (typeof explicitUrl === 'string' && explicitUrl.trim()) {
    return explicitUrl.trim().replace(/\/+$/, '')
  }

  if (typeof window === 'undefined') {
    return import.meta.env.DEV ? 'http://localhost:8002' : FALLBACK_RENDER_API
  }

  const { hostname } = window.location
  const isLocalhost = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(hostname)
  if (isLocalhost) {
    return import.meta.env.DEV ? 'http://localhost:8002' : FALLBACK_RENDER_API
  }

  return FALLBACK_RENDER_API
}

export function resolveWebSocketBaseUrl() {
  const explicitUrl = import.meta.env.VITE_WS_BASE_URL || import.meta.env.VITE_WS_URL
  if (typeof explicitUrl === 'string' && explicitUrl.trim()) {
    return explicitUrl.trim().replace(/\/+$/, '')
  }

  const apiBaseUrl = resolveApiBaseUrl()
  if (apiBaseUrl.startsWith('https://')) {
    return apiBaseUrl.replace(/^https:/, 'wss:')
  }
  return `ws://${apiBaseUrl.replace(/^http:\/\//, '').replace(/\/+$/, '')}`
}

export function buildApiUrl(path) {
  const normalizedPath = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  return `${resolveApiBaseUrl()}${normalizedPath}`
}

export class ApiError extends Error {
  constructor(message, { status, code, cause } = {}) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const retryDelay = (attempt) => new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)))

export async function apiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const url = buildApiUrl(path)
  const retryableMethod = method === 'GET'
  const maxAttempts = retryableMethod ? 3 : 1
  let lastError

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 12000)
    try {
      const response = await fetch(url, {
        ...options,
        method,
        signal: options.signal || controller.signal,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        const detail = body.detail
        const message = typeof detail === 'object' ? detail.message : detail
        const error = new ApiError(message || `Sentinel request failed (${response.status}).`, {
          status: response.status,
          code: typeof detail === 'object' ? detail.error : undefined,
        })
        if (!retryableMethod || ![408, 429, 502, 503, 504].includes(response.status) || attempt === maxAttempts - 1) throw error
        lastError = error
      } else {
        return body
      }
    } catch (error) {
      if (error instanceof ApiError && (!retryableMethod || ![408, 429, 502, 503, 504].includes(error.status) || attempt === maxAttempts - 1)) throw error
      if (error instanceof ApiError) lastError = error
      else if (error.name === 'AbortError') lastError = new ApiError('Backend connection timed out. Please retry in a moment.', { cause: error })
      else lastError = new ApiError('Backend connection unavailable. The fleet service may be offline or the production API URL may be misconfigured.', { cause: error })
      if (attempt === maxAttempts - 1) throw lastError
    } finally {
      window.clearTimeout(timeoutId)
    }
    await retryDelay(attempt)
  }

  throw lastError || new ApiError('The Sentinel API request failed.')
}
