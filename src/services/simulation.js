import { apiRequest } from './api.js'
import { publishSimulationData } from './simulation-state.js'

async function request(path, options = {}) {
  const result = await apiRequest(path, options)
  if (result?.state) publishSimulationData(result.state, result.evaluation)
  return result
}

export function getSimulationState() {
  return request('/api/simulation/state')
}

export function updateSimulationControl(control) {
  return request('/api/simulation/control', { method: 'POST', body: JSON.stringify(control) })
}

export function getRecoveryCandidates(robotId) {
  return request(`/api/recovery/candidates/${robotId}`)
}

export function clearSimulationNotifications() {
  return request('/api/simulation/notifications/clear', { method: 'POST' })
}

export function migrateTasks(robotId, token = '', targetRobot = '') {
  return request(`/api/fleet/robots/${robotId}/migrate-tasks`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(targetRobot ? { target_robot: targetRobot } : {}),
  })
}

export function assignTask(robotId, task = {}) {
  return request(`/api/fleet/robots/${robotId}/assign-task`, { method: 'POST', body: JSON.stringify(task) })
}

export function getAdminState(token) {
  return request('/api/admin/state', { headers: { Authorization: `Bearer ${token}` } })
}

export function migrateAdminTasks(robotId, token) {
  return request(`/api/admin/robots/${robotId}/migrate-tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function createAdminAlert(alert, token) {
  return request('/api/admin/alerts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(alert),
  })
}

export function getTheme4Evaluation() { return request('/api/theme4/evaluation') }

export function injectTheme4Failure(failure) {
  return request('/api/theme4/failures/inject', { method: 'POST', body: JSON.stringify(failure) })
}

export function generateTheme4Scenario(failure_count, seed) {
  return request('/api/theme4/scenarios/generate', { method: 'POST', body: JSON.stringify({ failure_count, seed: seed === '' ? null : Number(seed) }) })
}

export function runTheme4Scenario(failure_count, seed) {
  return request('/api/theme4/scenarios/run', { method: 'POST', body: JSON.stringify({ failure_count, seed: seed === '' ? null : Number(seed) }) })
}

export function benchmarkTheme4(failure_count, seed) {
  return request('/api/theme4/benchmark', { method: 'POST', body: JSON.stringify({ failure_count, seed: seed === '' ? null : Number(seed) }) })
}

export function resetTheme4() { return request('/api/theme4/reset', { method: 'POST' }) }
