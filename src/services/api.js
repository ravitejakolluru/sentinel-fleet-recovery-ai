export function resolveApiBaseUrl() {
  const explicitUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL
  if (typeof explicitUrl === 'string' && explicitUrl.trim()) {
    return explicitUrl.trim().replace(/\/+$/, '')
  }

  if (typeof window === 'undefined') {
    return import.meta.env.DEV ? 'http://localhost:8000' : ''
  }

  const { protocol, hostname, port } = window.location
  if (!/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(hostname)) {
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`.replace(/\/+$/, '')
  }

  return import.meta.env.DEV ? 'http://localhost:8000' : ''
}

export function resolveWebSocketBaseUrl() {
  const explicitUrl = import.meta.env.VITE_WS_BASE_URL || import.meta.env.VITE_WS_URL
  if (typeof explicitUrl === 'string' && explicitUrl.trim()) {
    return explicitUrl.trim().replace(/\/+$/, '')
  }

  const apiBaseUrl = resolveApiBaseUrl()
  if (apiBaseUrl.startsWith('https://')) {
    return `wss://${apiBaseUrl.replace(/^https:\/\//, '').replace(/\/+$/, '')}`
  }
  return `ws://${apiBaseUrl.replace(/^http:\/\//, '').replace(/\/+$/, '')}`
}

export function buildApiUrl(path) {
  const normalizedPath = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  return `${resolveApiBaseUrl()}${normalizedPath}`
}
