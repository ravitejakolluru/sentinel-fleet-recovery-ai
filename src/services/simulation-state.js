import { apiRequest, resolveWebSocketBaseUrl } from './api.js'

const listeners = new Set()
let snapshot = { state: null, evaluation: null, status: 'idle', error: null }
let socket = null
let pollTimer = null
let reconnectTimer = null
let reconnectAttempt = 0
let requestInFlight = false
let hasLiveState = false

function emit(next) {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((listener) => listener())
}

export function publishSimulationData(state, evaluation) {
  if (!state || !Array.isArray(state.robots)) return
  emit({ state, evaluation: evaluation || snapshot.evaluation, error: null })
}

async function pollState() {
  if (requestInFlight || !listeners.size || document.visibilityState === 'hidden') return
  requestInFlight = true
  try {
    const [state, report] = await Promise.all([
      apiRequest('/api/simulation/state'),
      apiRequest('/api/theme4/evaluation'),
    ])
    emit({ state, evaluation: report.evaluation, status: hasLiveState && socket?.readyState === WebSocket.OPEN ? 'live' : 'reconnecting', error: null })
  } catch (error) {
    emit({ status: 'offline', error: error.message })
  } finally {
    requestInFlight = false
  }
}

function startPolling() {
  if (pollTimer || !listeners.size) return
  pollState()
  pollTimer = window.setInterval(pollState, 5000)
}

function stopPolling() {
  if (pollTimer) window.clearInterval(pollTimer)
  pollTimer = null
}

function scheduleReconnect() {
  if (reconnectTimer || !listeners.size) return
  const delay = Math.min(15000, 500 * (2 ** Math.min(reconnectAttempt, 5)))
  reconnectAttempt += 1
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    connectSocket()
  }, delay)
}

function connectSocket() {
  if (!listeners.size || socket?.readyState === WebSocket.CONNECTING || socket?.readyState === WebSocket.OPEN) return
  const base = resolveWebSocketBaseUrl()
  if (!base) {
    emit({ status: 'offline', error: 'WebSocket URL is not configured.' })
    startPolling()
    return
  }
  emit({ status: snapshot.state ? 'reconnecting' : 'connecting' })
  try {
    socket = new WebSocket(`${base.replace(/\/$/, '')}/ws`)
  } catch (error) {
    emit({ status: 'offline', error: 'Unable to open the live simulation connection.' })
    startPolling()
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    reconnectAttempt = 0
    emit({ status: 'reconnecting', error: 'Waiting for the live simulation state frame.' })
    startPolling()
  }
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      if (message.type === 'STATE') {
        hasLiveState = true
        publishSimulationData(message.state, message.evaluation)
        emit({ status: 'live', error: null })
        stopPolling()
      }
    } catch {
      emit({ status: 'live', error: 'Received an invalid simulation update.' })
    }
  }
  socket.onerror = () => emit({ status: 'reconnecting', error: 'Live updates disconnected; retrying.' })
  socket.onclose = () => {
    socket = null
    hasLiveState = false
    emit({ status: 'reconnecting', error: 'Live updates disconnected; retrying.' })
    startPolling()
    scheduleReconnect()
  }
}

function start() {
  if (listeners.size !== 1) return
  startPolling()
  connectSocket()
  document.addEventListener('visibilitychange', onVisibilityChange)
}

function stop() {
  if (listeners.size) return
  stopPolling()
  if (reconnectTimer) window.clearTimeout(reconnectTimer)
  reconnectTimer = null
  document.removeEventListener('visibilitychange', onVisibilityChange)
  const activeSocket = socket
  socket = null
  hasLiveState = false
  if (activeSocket && activeSocket.readyState < WebSocket.CLOSING) activeSocket.close()
  emit({ status: 'idle' })
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    if (socket?.readyState === WebSocket.OPEN) return
    pollState()
    connectSocket()
  }
}

export function subscribeSimulationData(listener) {
  listeners.add(listener)
  if (listeners.size === 1) start()
  return () => {
    listeners.delete(listener)
    stop()
  }
}

export function getSimulationDataSnapshot() {
  return snapshot
}