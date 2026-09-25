import { useMemo, useState } from 'react'
import { clearSimulationNotifications } from './services/simulation.js'

const eventLabels = {
  FAILURE_INJECTION: 'Failure injected',
  PREDICTION: 'Failure risk elevated',
  FAILURE: 'Robot failure detected',
  TASK_MIGRATION: 'Task migration completed',
  REBALANCE: 'Fleet rebalanced',
  RECOVERY: 'Mission recovery verified',
}

function toneFor(item) {
  const type = String(item.type || '').toUpperCase()
  const severity = String(item.severity || '').toLowerCase()
  if (severity === 'critical' || /FAILURE|ANOMALY/.test(type)) return 'critical'
  if (severity === 'warning' || /PREDICTION|BATTERY/.test(type)) return 'warning'
  if (/MIGRATION|RECOVERY|REBALANCE/.test(type)) return 'recovery'
  return 'resolved'
}

export function normalizeAlerts(state) {
  const items = [...(state?.notifications || []), ...(state?.events || [])]
  const clearedAt = state?.alerts_cleared_at ? Date.parse(state.alerts_cleared_at) : 0
  return items.filter((item) => (!clearedAt || Date.parse(item.timestamp || item.time || '') > clearedAt) && /failure|prediction|migration|recovery|rebalanc|battery|cascade|anomaly/i.test(`${item.type} ${item.title} ${item.message} ${item.description}`)).map((item, index) => {
    const type = String(item.type || '').toUpperCase()
    const tone = toneFor(item)
    const robot = item.robot || item.robot_id || item.source_robot || 'Fleet'
    const message = item.message || item.description || eventLabels[type] || 'Operational event recorded'
    return { id: `${item.timestamp || item.time || index}-${index}`, tone, label: tone.toUpperCase(), subject: robot, title: eventLabels[type] || item.title || 'Operational alert', message, impact: item.mission || (tone === 'critical' ? 'Mission impact under analysis' : 'Simulation state updated'), time: item.timestamp || item.time || 'just now', action: tone === 'critical' ? 'View failure analysis' : tone === 'recovery' ? 'View recovery' : 'View fleet', rawType: type }
  })
}

export function AlertDrawer({ alerts, navigate, onClose, onClear, clearing }) {
  const active = alerts.filter((item) => item.tone !== 'resolved')
  return <div className="fleet-alert-drawer" role="dialog" aria-label="Fleet alerts"><div className="fleet-alert-drawer-head"><div><span>FLEET ALERTS</span><strong>{active.length} active</strong></div><button onClick={onClose} aria-label="Close alerts">×</button></div><div className="fleet-alert-drawer-items">{active.slice(0, 4).map((alert) => <AlertCard key={alert.id} alert={alert} compact onAction={() => { onClose(); navigate(alert.tone === 'critical' ? '/failure-analysis' : alert.tone === 'recovery' ? '/recovery' : '/fleet') }} />)}{!active.length && <div className="fleet-alert-empty"><strong>No active fleet alerts</strong><span>Awaiting failure or recovery events.</span></div>}</div><div className="fleet-alert-drawer-actions"><button onClick={onClear} disabled={clearing}>{clearing ? 'Clearing...' : 'Clear all'}</button><button className="fleet-alert-view-all" onClick={() => { onClose(); navigate('/notifications') }}>View all alerts ↗</button></div></div>
}

export function AlertBell({ alerts, navigate }) {
  const [open, setOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [localCleared, setLocalCleared] = useState(false)
  const visibleAlerts = localCleared ? [] : alerts
  const active = visibleAlerts.filter((item) => item.tone !== 'resolved')
  const clearAll = async () => { setClearing(true); try { await clearSimulationNotifications(); setLocalCleared(true); setOpen(false) } finally { setClearing(false) } }
  return <div className="fleet-alert-anchor"><button className="fleet-alert-bell" aria-label={`Fleet alerts${active.length ? `, ${active.length} active` : ''}`} onClick={() => setOpen((value) => !value)}>♧{active.length > 0 && <b>{active.length}</b>}</button>{open && <AlertDrawer alerts={visibleAlerts} navigate={navigate} onClose={() => setOpen(false)} onClear={clearAll} clearing={clearing} />}</div>
}

export function UserMenu({ user, navigate, onLogout }) {
  const [open, setOpen] = useState(false)
  return <div className="fleet-user-anchor"><button className="fleet-user-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span>{user?.name?.slice(0, 2).toUpperCase() || 'AR'}</span><strong>{user?.name || 'Alex Rivera'}</strong><i>⌄</i></button>{open && <div className="fleet-user-menu"><strong>{user?.name || 'Alex Rivera'}</strong><small>{user?.email || 'alex.rivera@sentinel.example'}</small><hr /><button onClick={() => navigate('/profile')}>Profile</button><button onClick={() => navigate('/profile')}>Account settings</button><button onClick={onLogout}>Logout</button></div>}</div>
}

export function AlertCard({ alert, compact = false, onAction }) {
  return <article className={`fleet-alert-card ${alert.tone} ${compact ? 'compact' : ''}`}><div className="fleet-alert-card-top"><span>{alert.label}</span><small>{alert.time}</small></div><strong>{alert.subject}</strong><h3>{alert.title}</h3><p>{alert.message}</p><small className="fleet-alert-impact">{alert.impact}</small>{onAction && <button onClick={onAction}>{alert.action} ↗</button>}</article>
}

export function AlertSummary({ alerts }) {
  const counts = useMemo(() => alerts.reduce((result, alert) => { result[alert.tone] += 1; return result }, { critical: 0, warning: 0, recovery: 0, resolved: 0 }), [alerts])
  return <div className="fleet-alert-summary"><div><span>ACTIVE ALERTS</span><strong>{counts.critical + counts.warning + counts.recovery}</strong></div><div className="critical"><span>CRITICAL</span><strong>{counts.critical}</strong></div><div className="warning"><span>WARNING</span><strong>{counts.warning}</strong></div><div className="recovery"><span>RECOVERY</span><strong>{counts.recovery}</strong></div><div className="resolved"><span>RESOLVED</span><strong>{counts.resolved}</strong></div></div>
}
