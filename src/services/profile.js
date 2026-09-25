import { getAuthToken } from './auth.js'
import { buildApiUrl } from './api.js'

const API_URL = buildApiUrl('')

async function request(path, options = {}) {
  const token = await getAuthToken()
  if (!token) throw new Error('NOT_AUTHENTICATED')
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (!response.ok) {
    const error = new Error(`PROFILE_${response.status}`)
    error.status = response.status
    throw error
  }
  return response.json()
}

export async function loadProfile() {
  const result = await request('/api/profile')
  return result.profile
}

export async function saveProfile(profile) {
  const result = await request('/api/profile', {
    method: 'PUT',
    body: JSON.stringify({ name: profile.name, date_of_birth: profile.dateOfBirth, phone: profile.phoneNumber }),
  })
  return result.profile
}
