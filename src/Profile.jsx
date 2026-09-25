import { useEffect, useState } from 'react'
import { loadProfile, saveProfile } from './services/profile.js'

function saveError(error) {
  if (error.message === 'NOT_AUTHENTICATED' || error.status === 401) return 'Your session has expired. Please sign in again.'
  if (error.status === 403) return 'You do not have permission to update this profile.'
  if (error.status === 404) return 'Profile record not found.'
  if (error.status === 422) return 'Please check the profile details and try again.'
  if (error.status >= 500) return 'Profile could not be saved. Please try again.'
  return 'Unable to reach the server. Check that the backend is running.'
}

export default function Profile({ user, navigate, onLogout, onProfileChange }) {
  const isDemo = user?.provider === 'demo'
  const [form, setForm] = useState({ name: user?.name || '', dateOfBirth: user?.dateOfBirth || '', phoneNumber: user?.phoneNumber || '' })
  const [loading, setLoading] = useState(!isDemo)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(isDemo ? 'Demo Mode profile changes are not persistent.' : '')

  useEffect(() => {
    if (isDemo) return
    loadProfile().then((profile) => {
      setForm({ name: profile.name || '', dateOfBirth: profile.dateOfBirth || '', phoneNumber: profile.phoneNumber || '' })
      onProfileChange(profile)
    }).catch((error) => setMessage(saveError(error))).finally(() => setLoading(false))
  }, [isDemo, onProfileChange])

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const save = async (event) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) { setMessage('Name is required.'); return }
    if (isDemo) { setMessage('Demo Mode profile changes are not persistent.'); return }
    setSaving(true)
    setMessage('Saving...')
    try {
      const profile = await saveProfile({ ...form, name })
      setForm({ name: profile.name, dateOfBirth: profile.dateOfBirth || '', phoneNumber: profile.phoneNumber || '' })
      onProfileChange(profile)
      setMessage('Profile saved successfully.')
    } catch (error) {
      setMessage(saveError(error))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="auth-loading">Loading profile...</div>
  return <div className="profile-screen authenticated-shell"><section className="profile-card"><span className="failure-kicker">SENTINEL ROBOTICS / PROFILE</span><button className="profile-back" onClick={() => navigate('/')}>← Back to command center</button><h1>Your profile</h1><p className="command-subtitle">Identity and operator settings for the fleet intelligence platform.</p><div className="profile-identity">{user?.photoURL ? <img src={user.photoURL} alt="" /> : <span>{form.name.slice(0, 2).toUpperCase() || 'S'}</span>}<div><input className="profile-input profile-name-input" value={form.name} onChange={(event) => update('name', event.target.value)} aria-label="Name" /><p>{user?.email}</p></div></div><form onSubmit={save}><div className="profile-details"><label><small>Date of birth</small><input className="profile-input" type="date" value={form.dateOfBirth} onChange={(event) => update('dateOfBirth', event.target.value)} /></label><label><small>Phone number</small><input className="profile-input" type="tel" value={form.phoneNumber} onChange={(event) => update('phoneNumber', event.target.value)} /></label></div>{message && <div className="profile-message" role="status">{message}</div>}<div className="profile-actions"><button className="primary-button" type="submit" disabled={saving || isDemo}>{saving ? 'Saving...' : 'Save changes'}</button><button className="outline-button" type="button" onClick={() => navigate('/')}>Cancel</button><button className="outline-button" type="button" onClick={() => window.print()}>Print</button><button className="outline-button" type="button" onClick={onLogout}>Logout</button></div></form></section></div>
}
