import { useEffect, useMemo, useState } from 'react'
import { buildApiUrl } from './services/api.js'
import GoogleFleetMap from './GoogleFleetMap.jsx'
import { benchmarkTheme4, createAdminAlert, generateTheme4Scenario, getAdminState, getRecoveryCandidates, getSimulationState, getTheme4Evaluation, injectTheme4Failure, migrateAdminTasks, migrateTasks, resetTheme4, runTheme4Scenario, updateSimulationControl } from './services/simulation.js'
import { AlertCard, AlertBell, AlertSummary, normalizeAlerts, UserMenu } from './AlertCenter.jsx'
import useSimulationData from './hooks/useSimulationData.js'

const API_URL = buildApiUrl('')
const robots = Array.from({ length: 10 }, (_, index) => ({ id: `R-${String(index + 1).padStart(3, '0')}`, type: ['Scout', 'Carrier', 'Inspector', 'Heavy'][index % 4], health: index === 3 ? 38 : 80 + (index * 7) % 20, battery: 35 + (index * 11) % 64, status: index === 3 ? 'Critical' : index % 5 === 0 ? 'Warning' : 'Healthy' }))
const missions = [{ name: 'Harbor perimeter sweep', priority: 'Critical', progress: 78, status: 'Active', robots: '6 / 8' }, { name: 'Emergency medical delivery', priority: 'Critical', progress: 92, status: 'Active', robots: '4 / 6' }, { name: 'Thermal leak survey', priority: 'High', progress: 51, status: 'Rebalancing', robots: '4 / 6' }]
const events = [{ time: '12:41:52', type: 'Recovery', severity: 'High', robot: 'R-004', mission: 'Harbor sweep', description: 'Recovery plan staged and task migrations queued', status: 'Open' }, { time: '12:40:08', type: 'Prediction', severity: 'Critical', robot: 'R-004', mission: 'Harbor sweep', description: 'Motor anomaly detected before mission impact', status: 'Investigating' }, { time: '12:38:44', type: 'Resource', severity: 'Medium', robot: 'R-009', mission: 'Medical delivery', description: 'Battery reserve rebalanced across active fleet', status: 'Resolved' }]

export function Shell({ title: pageTitle, eyebrow: pageEyebrow, navigate, children, user, onLogout, className = '' }) {
  const currentPath = window.location.pathname
  const title = currentPath === '/judge' ? 'Judge Mode' : pageTitle
  const eyebrow = currentPath === '/judge' ? 'HACKFUSION 2026 · THEME 4' : pageEyebrow
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem('sentinel-theme') === 'dark')
  const { state: simulation, status: connectionStatus } = useSimulationData()
  useEffect(() => { window.localStorage.setItem('sentinel-theme', darkMode ? 'dark' : 'light'); document.documentElement.dataset.sentinelTheme = darkMode ? 'dark' : 'light' }, [darkMode])
  useEffect(() => {
    const indicator = document.querySelector('.shell-live')
    if (indicator) indicator.textContent = connectionStatus === 'live' ? 'LIVE' : connectionStatus === 'offline' ? 'OFFLINE' : 'RECONNECTING'
  }, [connectionStatus])
  const alerts = normalizeAlerts(simulation)
  const commandRoutes = [['Command Center', '/', '⌂'], ['Summary', '/summary', '◫'], ['Robot Fleet', '/fleet', '◇'], ['Missions', '/missions', '◎'], ['Failure Analysis', '/failure-analysis', '△'], ['Recovery', '/recovery', '↻'], ['Digital Twin', '/digital-twin', '▦'], ['Fleet Alerts', '/alerts', '◌']]
  const simulationRoute = ['Live Fleet Simulation', '/simulation', '◉']
  const publicSiteRoute = ['Public Website', '/', '◈']
  return <div className={`app-shell authenticated-shell ${darkMode ? 'dark-operations' : ''} ${className}`}><aside className="sidebar"><button className="brand-lockup brand-home" onClick={() => navigate('/')} aria-label="Sentinel Robotics home"><span className="brand-mark">S</span><span className="brand-copy"><strong>SENTINEL</strong><small>ROBOTICS</small></span></button><div className="sidebar-label">COMMAND CENTER</div><nav className="sidebar-nav">{commandRoutes.map(([label, path, icon]) => <button key={path} className={`nav-item ${currentPath === path ? 'active' : ''}`} onClick={() => navigate(path)}><span className="nav-icon" aria-hidden="true">{icon}</span><span>{label}</span><span className="nav-arrow">›</span></button>)}</nav><div className="sidebar-label sidebar-section-label">SIMULATION</div><nav className="sidebar-nav">{simulationRoute && <button className={`nav-item ${currentPath === simulationRoute[1] ? 'active' : ''}`} onClick={() => navigate(simulationRoute[1])}><span className="nav-icon" aria-hidden="true">{simulationRoute[2]}</span><span>{simulationRoute[0]}</span><span className="nav-arrow">›</span></button>}<button className={`nav-item ${currentPath === publicSiteRoute[1] ? 'active' : ''}`} onClick={() => navigate(publicSiteRoute[1])}><span className="nav-icon" aria-hidden="true">{publicSiteRoute[2]}</span><span>{publicSiteRoute[0]}</span><span className="nav-arrow">›</span></button></nav><div className="sidebar-bottom"><div className="system-status"><span className="pulse-dot" />SYSTEM MONITORING</div><button className="theme-toggle" onClick={() => setDarkMode((value) => !value)} aria-label={`Switch to ${darkMode ? 'light' : 'dark'} operations`}><span aria-hidden="true">{darkMode ? '☀' : '◐'}</span>{darkMode ? 'Light operations' : 'Dark operations'}</button></div></aside><main className="main-content"><header className="topbar"><div><div className="breadcrumb">SENTINEL ROBOTICS <span>/</span> {eyebrow}</div><h1>{title}</h1><p className="command-subtitle">Theme 4 robot fleet recovery under cascading failures</p></div><div className="top-actions"><span className="shell-live"><i /> SYSTEM ONLINE</span><span className="shell-stat">{simulation ? `${simulation.robots?.length || 0} ROBOTS` : 'SIMULATION'}</span><AlertBell alerts={alerts} navigate={navigate} /><UserMenu user={user} navigate={navigate} onLogout={onLogout} /></div></header>{children}</main></div>
}

export function CommandCenterPage({ navigate, user, onLogout }) {
  const { state, evaluation } = useSimulationData()
  const metrics = evaluation || {}
  const [selectedId, setSelectedId] = useState('R-003')
  const [message, setMessage] = useState('')
  const robots = (state?.robots || []).slice(0, 10)
  const selectedRobot = robots.find((robot) => robot.id === selectedId) || robots[0]
  const activeCount = robots.filter((robot) => ['healthy', 'recovering'].includes(robot.status)).length
  const degradedCount = robots.filter((robot) => ['warning', 'critical'].includes(robot.status)).length
  const failedCount = robots.filter((robot) => robot.status === 'failed').length
  const chargingCount = robots.filter((robot) => robot.status === 'charging').length
  const activeTasks = Object.values(state?.tasks || {}).filter((task) => !['COMPLETED', 'FAILED'].includes(task.status))
  const atRiskCount = activeTasks.filter((task) => task.status === 'AT RISK').length
  const alerts = (state?.notifications || []).slice(0, 4)

  return <Shell title="Command Center" eyebrow="FLEET RECOVERY OPERATIONS" navigate={navigate} user={user} onLogout={onLogout}>
    <section className="metric-grid"><Metric label="Robots" value={robots.length || '—'} detail="authoritative fleet" /><Metric label="Active / degraded" value={`${activeCount} / ${degradedCount}`} detail="live status" /><Metric label="Failed / charging" value={`${failedCount} / ${chargingCount}`} detail="capacity impact" /><Metric label="Tasks at risk" value={atRiskCount} detail={`${activeTasks.length} active tasks`} /><Metric label="Mission continuity" value={metrics.mission_preservation === undefined ? '—' : `${metrics.mission_preservation}%`} detail="derived from task ownership" /><Metric label="Mission completion" value={metrics.mission_completion_rate === undefined ? '—' : `${metrics.mission_completion_rate}%`} detail="average task progress" /><Metric label="Failure risk" value={state?.predictions?.length ? `${state.predictions[state.predictions.length - 1].probability}%` : '—'} detail="latest telemetry prediction" /></section>
    {message && <p className="profile-message" role="status">{message}</p>}
    <div className="command-overview-grid"><section className="panel command-map-panel"><div className="panel-heading"><div><h2>Live fleet map</h2><p>{robots.length} authoritative robots · position and routes</p></div></div><GoogleFleetMap robots={robots} selectedRobot={selectedRobot} onSelect={(robot) => { window.sessionStorage.setItem('sentinel-selected-robot', robot.id); navigate('/digital-twin') }} onMessage={setMessage} /></section><section className="panel command-alert-panel"><div className="panel-heading"><div><h2>Recovery status</h2><p>{state?.migrations?.length ? `${state.migrations.length} task migration(s) recorded` : 'No active task migration'}</p></div><div className="command-panel-actions"><button className="outline-button" onClick={() => navigate('/judge')}>Judge Mode</button><button className="outline-button" onClick={() => navigate('/simulation')}>Open simulation</button></div></div><div className="data-list"><div><strong>Latest task migration</strong><span>{state?.migrations?.at(-1)?.status || 'Standby'}</span></div><div><strong>Current mission preservation</strong><span>{metrics.mission_preservation === undefined ? '—' : `${metrics.mission_preservation}%`}</span></div></div><div className="command-recent-alerts"><h3>Recent alerts</h3>{alerts.map((alert, index) => <div key={`${alert.timestamp || alert.title}-${index}`}><strong>{alert.title || alert.type || 'Fleet event'}</strong><span>{alert.message || alert.robot || 'No details supplied'}</span></div>)}{!alerts.length && <p>No active alerts.</p>}<button className="text-button" onClick={() => navigate('/alerts')}>View fleet alerts →</button></div></section></div>
  </Shell>
}

function Panel({ title, children }) { return <section className="panel page-panel summary-card-panel"><div className="panel-heading"><h2>{title}</h2></div>{children}</section> }
function Metric({ label, value, detail }) { return <div className="metric-card"><span className="metric-label">{label}</span><div className="metric-value">{value}</div><div className="metric-change positive">{detail}</div></div> }
function DigitalTwin({ robot, onClose, onMigrate }) { const [busy, setBusy] = useState(false); const [result, setResult] = useState(null); if (!robot) return null; const migrate = async () => { setBusy(true); setResult(null); try { const response = await migrateTasks(robot.id); setResult(response.migration); onMigrate?.(response.state); } catch (error) { setResult({ status: 'blocked', reason: error.message, code: error.code }); } finally { setBusy(false) } }; const risk = robot.probability === undefined ? 'Not available' : `${robot.probability}%`; return <div className="modal-backdrop" onClick={onClose}><section className="digital-twin panel" onClick={(event) => event.stopPropagation()}><button className="small-icon" onClick={onClose} aria-label="Close digital twin">×</button><span className="public-kicker">DIGITAL TWIN · SIMULATION</span><h2>{robot.id}</h2><p>{robot.type} · {robot.status}</p><div className="metric-grid"><Metric label="Health" value={`${robot.health}%`} detail="authoritative state" /><Metric label="Battery" value={`${robot.battery}%`} detail="authoritative state" /><Metric label="Risk" value={risk} detail="prediction record" /></div>{result && <div className={`migration-result ${result.status === 'blocked' ? 'blocked' : ''}`}><strong>{result.status === 'blocked' ? 'MIGRATION BLOCKED' : 'TASK MIGRATION COMPLETE'}</strong>{result.status === 'blocked' ? <p>{result.reason}{result.code ? ` (${result.code})` : ''}</p> : <p>Source: {result.source_robot}<br />Destination: {result.destination_robot}<br />Tasks migrated: {result.task_ids.join(', ')}<br />Reason: {result.reason}<br />Mission impact: Protected</p>}</div>}<div className="profile-actions"><button className="primary-button" onClick={migrate} disabled={busy || result?.status === 'completed'}>{busy ? 'Migrating...' : result?.status === 'completed' ? 'Migration complete' : 'Migrate current tasks'}</button><button className="outline-button" onClick={onClose}>Close</button></div></section></div> }

export function FleetPage({ navigate, user, onLogout }) { const [query, setQuery] = useState(''); const [status, setStatus] = useState('All'); const [selected, setSelected] = useState(null); const [state, setState] = useState(null); const [error, setError] = useState(''); useEffect(() => { getSimulationState().then(setState).catch((requestError) => setError(requestError.message)) }, []); const fleet = state?.robots || []; const filtered = fleet.filter((robot) => robot.id.includes(query.toUpperCase()) && (status === 'All' || robot.status.toLowerCase() === status.toLowerCase())); return <Shell title="Fleet intelligence" eyebrow="FLEET" navigate={navigate} user={user} onLogout={onLogout}><div className="metric-grid"><Metric label="Total robots" value={state ? fleet.length : '—'} detail="authoritative fleet" /><Metric label="Healthy" value={state ? fleet.filter((r) => r.status.toLowerCase() === 'healthy').length : '—'} detail="operational" /><Metric label="Critical" value={state ? fleet.filter((r) => r.status.toLowerCase() === 'critical').length : '—'} detail="action required" /></div><Panel title="Robot fleet"><div className="table-tools"><input className="profile-input" placeholder="Search robot" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="filter-button" value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>Healthy</option><option>Warning</option><option>Critical</option></select></div>{error && <div className="profile-message" role="alert">Fleet state unavailable: {error}</div>}{!state && !error && <div className="profile-message">Loading authoritative fleet state...</div>}<div className="fleet-grid">{filtered.map((robot) => <button className="fleet-robot" key={robot.id} onClick={() => setSelected(robot)}><strong>{robot.id}</strong><span>{robot.type}</span><small className={robot.status.toLowerCase()}>{robot.status} · {robot.health}%</small></button>)}</div></Panel><DigitalTwin robot={selected} onClose={() => setSelected(null)} onMigrate={(nextState) => setState(nextState)} /></Shell> }

export function AnalyticsPage({ navigate, user, onLogout }) { const healthy = robots.filter((robot) => robot.status === 'Healthy').length; return <Shell title="Analytics" eyebrow="ANALYTICS" navigate={navigate} user={user} onLogout={onLogout}><div className="metric-grid"><Metric label="Fleet health" value={`${healthy}%`} detail="healthy units" /><Metric label="Mission continuity" value="89.7%" detail="recovered" /><Metric label="Predicted failures" value="1" detail="high confidence" /><Metric label="Resource reserve" value="74%" detail="fleet weighted" /></div><Panel title="Recovery performance"><div className="chart-bars">{[98, 54, 72, 89, 94].map((value, index) => <div key={index}><span style={{ height: `${value}%` }} /><small>{['Before', 'Cascade', 'Migrate', 'Recover', 'Now'][index]}</small></div>)}</div></Panel><Panel title="Operational signals"><div className="data-list">{['Battery trends', 'Failure prediction confidence', 'Mission continuity', 'Task migration capacity', 'Cascade containment'].map((item, index) => <div key={item}><strong>{item}</strong><span>{[74, 93, 89, 91, 67][index]}%</span></div>)}</div></Panel></Shell> }

export function EventsPage({ navigate, user, onLogout }) { const [query, setQuery] = useState(''); const [type, setType] = useState('All'); const [open, setOpen] = useState(null); const filtered = events.filter((event) => (type === 'All' || event.type === type) && `${event.description} ${event.robot}`.toLowerCase().includes(query.toLowerCase())); return <Shell title="Event intelligence" eyebrow="EVENTS" navigate={navigate} user={user} onLogout={onLogout}><Panel title="System events"><div className="table-tools"><input className="profile-input" placeholder="Search events" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="filter-button" value={type} onChange={(event) => setType(event.target.value)}><option>All</option><option>Recovery</option><option>Prediction</option><option>Resource</option></select></div><div className="event-list">{filtered.map((event) => <button className="event-row event-button" key={event.time} onClick={() => setOpen(open === event.time ? null : event.time)}><span className="event-marker red" /><div><strong>{event.type} · {event.robot}</strong><small>{event.description}</small>{open === event.time && <small>{event.mission} · {event.status} · {event.severity}</small>}</div><time>{event.time}</time></button>)}</div></Panel></Shell> }

export function NotificationsPage({ navigate, user, onLogout }) { const [state, setState] = useState(null); const [filter, setFilter] = useState('all'); useEffect(() => { getSimulationState().then(setState).catch(() => setState({ notifications: [], events: [] })) }, []); const alerts = normalizeAlerts(state); const filtered = filter === 'all' ? alerts : alerts.filter((alert) => alert.tone === filter); return <Shell title="Fleet Alert Center" eyebrow="NOTIFICATIONS" navigate={navigate} user={user} onLogout={onLogout}><div className="fleet-alert-page"><header className="fleet-alert-page-head"><div><span className="failure-kicker">FLEET ALERT CENTER</span><h2>Operational alerts, failure propagation, and recovery events.</h2></div><AlertBell alerts={alerts} navigate={navigate} /></header><AlertSummary alerts={alerts} /><div className="fleet-alert-filters">{['all', 'critical', 'warning', 'recovery', 'resolved'].map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="fleet-alert-grid">{filtered.length ? filtered.map((alert) => <AlertCard key={alert.id} alert={alert} onAction={() => navigate(alert.tone === 'critical' ? '/failure-analysis' : alert.tone === 'recovery' ? '/recovery' : '/fleet')} />) : <div className="fleet-alert-empty"><strong>No active fleet alerts</strong><span>Awaiting robot failure, cascade, migration, or recovery events.</span></div>}</div></div></Shell> }

export function MissionsPage({ navigate, user, onLogout }) { const [selected, setSelected] = useState(null); const [state, setState] = useState(null); const [error, setError] = useState(''); useEffect(() => { getSimulationState().then(setState).catch((requestError) => setError(requestError.message)) }, []); const activeMissions = state?.missions || []; return <Shell title="Mission continuity" eyebrow="MISSIONS" navigate={navigate} user={user} onLogout={onLogout}><Panel title="Mission control"><p className="panel-copy">Mission priority, task dependencies, and recovery state from the authoritative simulation.</p>{error && <div className="profile-message" role="alert">Mission state unavailable: {error}</div>}{!state && !error && <div className="profile-message">Loading authoritative mission state...</div>}<div className="data-list">{activeMissions.map((mission) => <button className="mission-row mission-button" key={mission.name} onClick={() => setSelected(mission)}><strong>{mission.name}</strong><span>{mission.priority || 'Unclassified'} · {mission.progress ?? '—'}%</span><small>{mission.tasks?.length || 0} active tasks · {mission.status || 'Simulation state'}</small></button>)}</div>{state && !activeMissions.length && <div className="fleet-alert-empty"><strong>No active missions</strong><span>The authoritative simulation has no mission records available.</span></div>}</Panel>{selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><section className="digital-twin panel" onClick={(event) => event.stopPropagation()}><button className="small-icon" onClick={() => setSelected(null)} aria-label="Close mission detail">×</button><span className="public-kicker">MISSION DETAIL</span><h2>{selected.name}</h2><p>{selected.priority || 'Unclassified'} priority · {selected.status || 'Simulation state'}</p><Metric label="Progress" value={selected.progress === undefined ? '—' : `${selected.progress}%`} detail="authoritative state" /><Metric label="Tasks" value={selected.tasks?.length ?? '—'} detail="active dependencies" /><button className="outline-button" onClick={() => navigate('/failure-analysis')}>Open failure analysis</button></section></div>}</Shell> }

function LegacyRecoveryPage({ navigate, user, onLogout }) { return <Shell title="Recovery center" eyebrow="RECOVERY" navigate={navigate} user={user} onLogout={onLogout}><Panel title="Recovery workspace"><button className="primary-button" onClick={() => navigate('/simulation')}>Open live simulation</button></Panel></Shell> }
export function RecoveryPage({ navigate, user, onLogout }) {
  const [state, setState] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [selected, setSelected] = useState('')
  const [message, setMessage] = useState('')
  const refresh = () => getSimulationState().then((next) => { setState(next); const failed = next.failures?.at(-1)?.robot_id; return failed ? getRecoveryCandidates(failed).then((result) => setCandidates(result.candidates || [])) : setCandidates([]) }).catch((error) => setMessage(error.message))
  useEffect(() => { refresh() }, [])
  const failedRobot = state?.failures?.at(-1)?.robot_id || 'No active failure'
  const migrate = async () => { if (!selected || failedRobot === 'No active failure') return; try { const result = await migrateTasks(failedRobot, '', selected); setMessage(`TASK MIGRATED · ${result.migration.source_robot} → ${result.migration.destination_robot}`); await refresh() } catch (error) { setMessage(error.message) } }
  return <Shell title="Recovery operations" eyebrow="RECOVERY" navigate={navigate} user={user} onLogout={onLogout}><div className="recovery-workspace"><header className="failure-hero"><div><span className="failure-kicker">ACTIVE RECOVERY DECISIONS</span><h2>Recover the mission, not just the robot.</h2><p>Candidate ranking is derived from health, battery, capacity, workload, distance, and deadline feasibility.</p></div><div className="failure-live"><span><i /> AUTHORITATIVE STATE</span><strong>{state ? `${state.robots.length} robots` : 'Loading'}</strong><small>{state?.migrations?.length || 0} completed migrations</small></div></header><div className="metric-grid"><Metric label="Active incident" value={failedRobot} detail="source robot" /><Metric label="Tasks at risk" value={state?.missions?.[0]?.tasks?.length ?? '—'} detail="current mission state" /><Metric label="Candidates" value={candidates.length || '—'} detail="ranked recovery options" /><Metric label="Mission continuity" value={state?.performance?.recovered === undefined ? '—' : `${state.performance.recovered}%`} detail="simulation state" /></div><section className="failure-grid middle-grid"><FailureAnalysisCard eyebrow="RECOVERY PLAN" title={`${failedRobot} → candidate`} subtitle="Preview selection before mutating authoritative state."><div className="cascade-chain"><strong>FAILED ROBOT · {failedRobot}</strong><i>↓ TASK MIGRATION</i><strong>{state?.missions?.[0]?.tasks?.join(' / ') || 'No active task recorded'}</strong><i>↓ NEW ROUTE</i><strong>{selected || 'Select a recovery candidate'}</strong></div><div className="profile-actions"><button className="primary-button" onClick={migrate} disabled={!selected}>Execute migration</button><button className="outline-button" onClick={() => navigate('/digital-twin')}>Preview on digital twin</button></div></FailureAnalysisCard><FailureAnalysisCard eyebrow="RECOVERY CANDIDATES" title="Suitability ranking" subtitle="Transparent recovery score, not an AI claim."><div className="risk-list-analytics">{candidates.map((candidate) => <button key={candidate.robot_id} className={selected === candidate.robot_id ? 'selected' : ''} onClick={() => setSelected(candidate.robot_id)}><span className="risk-robot-id">{candidate.robot_id}</span><strong>{candidate.score}</strong><small>{candidate.battery}% battery · {candidate.capacity}% capacity · {candidate.deadline}</small><span className="risk-arrow">›</span></button>)}{!candidates.length && <div className="profile-message">No eligible recovery candidates are currently available.</div>}</div></FailureAnalysisCard></section>{message && <div className="profile-message" role="status">{message}</div>}</div></Shell>
}

function fleetSelectors(state) {
  const fleet = state?.robots || []
  const failures = fleet.filter((robot) => ['failed', 'critical', 'recovering'].includes(String(robot.status).toLowerCase()))
  const warnings = fleet.filter((robot) => String(robot.status).toLowerCase() === 'warning')
  const healthy = fleet.filter((robot) => ['healthy', 'active', 'reserve'].includes(String(robot.status).toLowerCase()))
  const predictions = state?.predictions || []
  const risks = fleet.map((robot) => {
    const prediction = predictions.find((item) => item.robot_id === robot.id)
    return { ...robot, probability: prediction?.probability, subsystem: prediction?.subsystem, confidence: prediction?.confidence }
  }).sort((first, second) => (second.probability ?? -1) - (first.probability ?? -1))
  const failureEvents = (state?.events || []).filter((event) => /failure|anomaly|migration|recovery/i.test(`${event.type} ${event.message}`))
  const causes = [...new Set((state?.failures || []).map((failure) => failure.subsystem || 'other'))].map((cause) => ({ label: `${cause[0].toUpperCase()}${cause.slice(1)} anomaly`, count: (state.failures || []).filter((failure) => failure.subsystem === cause).length }))
  return { fleet, failures, warnings, healthy, risks, failureEvents, causes: causes.length ? causes : [{ label: 'No recorded causes', count: 0 }] }
}

function DonutChart({ failures, warnings, healthy, total }) {
  const failurePercent = total ? Math.round((failures / total) * 100) : 0
  const warningPercent = total ? Math.round((warnings / total) * 100) : 0
  const gradient = `conic-gradient(#f05d78 0 ${failurePercent}%, #f4a34f ${failurePercent}% ${failurePercent + warningPercent}%, #45d2a1 ${failurePercent + warningPercent}% 100%)`
  return <div className="failure-donut-wrap"><div className="failure-donut" style={{ background: gradient }} role="img" aria-label={`Fleet health: ${failures} failures, ${warnings} warnings, ${healthy} healthy`}><div><strong>{total}</strong><small>ROBOTS</small></div></div><div className="failure-legend"><span><i className="legend-failure" />Failures <b>{failurePercent}%</b></span><span><i className="legend-warning" />Warnings <b>{warningPercent}%</b></span><span><i className="legend-healthy" />Healthy <b>{total ? 100 - failurePercent - warningPercent : 0}%</b></span></div></div>
}

function FailureAnalysisCard({ eyebrow, title, subtitle, children, className = '' }) { return <section className={`failure-card ${className}`}><div className="failure-card-heading"><div><span>{eyebrow}</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section> }

function LegacyFailureAnalysisPage({ navigate, user, onLogout }) {
  const [state, setState] = useState(null)
  const [selected, setSelected] = useState(null)
  useEffect(() => { getSimulationState().then(setState).catch(() => setState({ robots: [], failures: [], predictions: [], events: [], migrations: [] })) }, [])
  useEffect(() => { document.title = 'Failure Analysis | Sentinel Robotics'; return () => { document.title = 'Sentinel Robotics' } }, [])
  const selectors = fleetSelectors(state)
  const total = selectors.fleet.length
  const trend = [0, 1, 2, 3, 4].map((index) => ({ label: `T-${4 - index}`, failures: selectors.failures.length + (index === 4 ? 0 : 1), warnings: selectors.warnings.length + (index % 2) }))
  const highRisk = selectors.risks.slice(0, 5)
  const topRisk = highRisk[0]
  if (!state) return <Shell title="Failure analysis" eyebrow="FLEET INTELLIGENCE" navigate={navigate} user={user} onLogout={onLogout} className="failure-analysis-shell"><div className="failure-loading"><span /><span /><span /><p>Loading fleet intelligence...</p></div></Shell>
  return <Shell title="Failure analysis" eyebrow="FLEET INTELLIGENCE" navigate={navigate} user={user} onLogout={onLogout} className="failure-analysis-shell"><div className="failure-dashboard"><header className="failure-hero"><div><span className="failure-kicker">FLEET INTELLIGENCE</span><h2>Failure Analysis</h2><p>Real-time failure detection, prediction, and risk analysis across the entire fleet.</p></div><div className="failure-live"><span><i /> Simulation live</span><strong>{total} Robots / {state.missions?.length || 0} Missions</strong><small>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · synchronized state</small></div></header><div className="failure-kpis"><div className="failure-kpi kpi-danger"><span>FAILURES</span><strong>{selectors.failures.length}</strong><small>↑ {selectors.failureEvents.length} detected events</small></div><div className="failure-kpi kpi-warning"><span>WARNINGS</span><strong>{selectors.warnings.length}</strong><small>↑ active attention</small></div><div className="failure-kpi kpi-healthy"><span>HEALTHY</span><strong>{selectors.healthy.length}</strong><small>operational units</small></div><div className="failure-kpi kpi-total"><span>TOTAL ROBOTS</span><strong>{total}</strong><small>live fleet</small></div></div><div className="failure-grid top-grid"><FailureAnalysisCard eyebrow="FLEET STATUS" title="Fleet Health Distribution" subtitle="Current robot status across the fleet"><DonutChart failures={selectors.failures.length} warnings={selectors.warnings.length} healthy={selectors.healthy.length} total={total} /></FailureAnalysisCard><FailureAnalysisCard eyebrow="PREDICTION HISTORY" title="Failure Trends" subtitle="Failures and warnings over time"><div className="trend-chart" role="img" aria-label="Failure and warning trend chart">{trend.map((point) => <div className="trend-column" key={point.label}><div className="trend-bars"><span className="trend-failure" style={{ height: `${Math.max(12, point.failures * 13)}%` }} /><span className="trend-warning" style={{ height: `${Math.max(15, point.warnings * 13)}%` }} /></div><small>{point.label}</small><div className="chart-hover"><b>{point.label}</b><br />Failures: {point.failures}<br />Warnings: {point.warnings}</div></div>)}</div><div className="trend-legend"><span><i className="legend-failure" />Failures</span><span><i className="legend-warning" />Warnings</span></div></FailureAnalysisCard></div><div className="failure-grid middle-grid"><FailureAnalysisCard eyebrow="ROOT CAUSE SIGNALS" title="Failure Causes" subtitle="Top detected failure types"><div className="cause-list">{selectors.causes.map((cause, index) => <div className="cause-row" key={cause.label}><div><span>{cause.label}</span><b>{cause.count}</b></div><i><em style={{ width: `${Math.min(100, Math.max(8, cause.count / Math.max(1, selectors.failures.length) * 100))}%`, background: ['#a77bff', '#4ea8ff', '#ec6bb5', '#f4a34f'][index % 4] }} /></i></div>)}</div></FailureAnalysisCard><FailureAnalysisCard eyebrow="RISK QUEUE" title="High Risk Robots" subtitle="Robots with highest failure probability" className="risk-card"><div className="risk-list-analytics">{highRisk.map((robot) => <button key={robot.id} onClick={() => setSelected(robot)}><span className="risk-robot-id">{robot.id}</span><strong>{robot.probability}%</strong><small>{robot.subsystem} detected</small><span className="risk-arrow">›</span></button>)}</div><button className="failure-view-all" onClick={() => navigate('/fleet')}>View all fleet <span>↗</span></button></FailureAnalysisCard></div><FailureAnalysisCard eyebrow="AI PREDICTION ENGINE" title="Risk Prediction" subtitle="AI-powered failure probability forecast" className="risk-prediction-card"><div className="prediction-layout"><div className="prediction-visual"><div className="prediction-grid" /><div className="prediction-wave wave-one" /><div className="prediction-wave wave-two" /><span className="prediction-point point-one" /><span className="prediction-point point-two" /><span className="prediction-point point-three" /><div className="prediction-badge"><i /> AI ACTIVE</div></div><div className="prediction-stats"><div><span>Failure risk</span><strong>{topRisk?.probability || 0}%</strong><small>{topRisk?.id || 'No high-risk robot'}</small></div><div><span>Confidence</span><strong>{topRisk?.confidence || 0}%</strong><small>prediction confidence</small></div><div><span>Estimated time</span><strong>{topRisk ? '08m' : '--'}</strong><small>to intervention</small></div></div></div></FailureAnalysisCard><FailureAnalysisCard eyebrow="LIVE TELEMETRY" title="Fleet Status Map" subtitle="Real-time robot status visualization" className="fleet-map-card"><div className="analytics-map"><div className="analytics-map-grid" />{selectors.fleet.slice(0, 40).map((robot, index) => { const status = String(robot.status).toLowerCase(); const tone = status === 'warning' ? 'warning' : ['critical', 'failed', 'recovering'].includes(status) ? 'failure' : status === 'reserve' ? 'reserve' : 'healthy'; return <button key={robot.id} className={`analytics-node ${tone}`} style={{ left: `${8 + (index * 37) % 84}%`, top: `${13 + (index * 53) % 72}%` }} onClick={() => setSelected(robot)} aria-label={`${robot.id} ${tone}`}><span /><small>{robot.id}</small><div className="map-tooltip"><b>{robot.id}</b><br />{robot.probability || (robot.id === 'R-004' ? 93 : 18)}% risk<br />{robot.id === 'R-004' ? 'Motor anomaly detected' : status}</div></button> })}</div><div className="analytics-map-legend"><span><i className="legend-healthy" />Healthy</span><span><i className="legend-warning" />Warning</span><span><i className="legend-failure" />Failure</span><span><i className="legend-reserve" />Reserve</span></div></FailureAnalysisCard>{selected && <DigitalTwin robot={selected} onClose={() => setSelected(null)} />}</div></Shell>
}
export function FailureAnalysisPage({ navigate, user, onLogout }) {
  const [state, setState] = useState(null)
  const [selected, setSelected] = useState(null)
  useEffect(() => { getSimulationState().then(setState).catch(() => setState({ robots: [], missions: [], failures: [], predictions: [], migrations: [], events: [] })) }, [])
  const failures = state?.failures || []
  const predictions = state?.predictions || []
  const affectedRobot = failures[failures.length - 1]?.robot_id
  const robot = state?.robots?.find((item) => item.id === affectedRobot)
  const prediction = predictions.find((item) => item.robot_id === affectedRobot)
  return <Shell title="Failure analysis" eyebrow="PROPAGATION ANALYSIS" navigate={navigate} user={user} onLogout={onLogout}><div className="failure-dashboard"><header className="failure-hero"><div><span className="failure-kicker">SIMULATION-BASED FAILURE ANALYSIS</span><h2>Trace the active cascade.</h2><p>Follow the authoritative chain from failed robot to task dependency, mission impact, and recovery action.</p></div><div className="failure-live"><span><i /> SIMULATION STATE</span><strong>{state ? `${state.robots.length} robots` : 'Loading'}</strong><small>{failures.length} recorded failure{failures.length === 1 ? '' : 's'}</small></div></header><div className="failure-grid middle-grid"><FailureAnalysisCard eyebrow="SOURCE FAILURE" title={affectedRobot || 'No active failure'} subtitle={robot ? `${robot.type} · ${robot.status} · ${robot.health}% health` : 'Awaiting a failure event'}><div className="cascade-chain"><strong>{affectedRobot || 'Awaiting failure'}</strong><small>{failures[failures.length - 1]?.subsystem || 'No subsystem recorded'}</small><i>↓ TASK DEPENDENCY</i><strong>{state?.missions?.[0]?.tasks?.join(' / ') || 'No affected task recorded'}</strong><small>Mission work linked in authoritative state</small><i>↓ MISSION IMPACT</i><strong>{state?.missions?.[0]?.name || 'No affected mission recorded'}</strong><small>{state?.missions?.[0]?.priority || 'Priority unavailable'}</small></div></FailureAnalysisCard><FailureAnalysisCard eyebrow="SIMULATION-BASED RISK ESTIMATE" title="Prediction record" subtitle="No trained-model claim is made."><div className="data-list"><div><strong>Risk</strong><span>{prediction?.probability === undefined ? 'Not available' : `${prediction.probability}%`}</span></div><div><strong>Confidence</strong><span>{prediction?.confidence === undefined ? 'Not available' : `${Math.round(prediction.confidence * 100)}%`}</span></div><div><strong>Subsystem</strong><span>{prediction?.subsystem || 'Not available'}</span></div><div><strong>Recovery options</strong><button className="outline-button" onClick={() => navigate('/recovery')}>Open recovery workspace</button></div></div></FailureAnalysisCard></div><FailureAnalysisCard eyebrow="PROPAGATION CHAIN" title="Robot → task → mission → recovery" subtitle="Each stage is derived from the current simulation snapshot."><div className="theme4-sequence"><span>{affectedRobot || 'Robot unavailable'}</span><span>{state?.missions?.[0]?.tasks?.join(' / ') || 'Task dependency unavailable'}</span><span>{state?.missions?.[0]?.name || 'Mission impact unavailable'}</span><span>{state?.migrations?.[0]?.destination_robot || 'Recovery candidate pending'}</span></div><div className="profile-actions"><button className="primary-button" onClick={() => navigate('/recovery')}>Review recovery</button><button className="outline-button" onClick={() => setSelected(robot)} disabled={!robot}>Open robot detail</button></div></FailureAnalysisCard></div>{selected && <DigitalTwin robot={selected} onClose={() => setSelected(null)} />}</Shell>
}
export function ResourcesPage({ navigate, user, onLogout }) { return <Shell title="Resources" eyebrow="RESOURCES" navigate={navigate} user={user} onLogout={onLogout}><Panel title="Sentinel resources"><div className="data-list"><button onClick={() => navigate('/developers')}><strong>Developer workspace</strong><small>Meet the team and platform owners.</small></button><button onClick={() => navigate('/events')}><strong>Event intelligence</strong><small>Review the operational timeline.</small></button><button onClick={() => navigate('/analytics')}><strong>Analytics center</strong><small>Inspect fleet and recovery performance.</small></button></div></Panel></Shell> }

export function Theme4Page({ navigate, user, onLogout }) {
  const [evaluation, setEvaluation] = useState(null)
  const [robotId, setRobotId] = useState('R-004')
  const [failureType, setFailureType] = useState('motor')
  const [severity, setSeverity] = useState('critical')
  const [timing, setTiming] = useState('immediate')
  const [count, setCount] = useState(4)
  const [seed, setSeed] = useState(48291)
  const [scenario, setScenario] = useState(null)
  const [benchmark, setBenchmark] = useState(null)
  const [message, setMessage] = useState('')
  const refresh = () => getTheme4Evaluation().then(setEvaluation).catch((error) => setMessage(error.message))
  useEffect(() => { refresh() }, [])
  const action = async (operation, success) => { try { const result = await operation(); if (result.evaluation) setEvaluation({ ...result, evaluation: result.evaluation, requirements: evaluation?.requirements || [] }); setMessage(success); await refresh(); return result } catch (error) { setMessage(error.message) } }
  const exportResults = () => { const blob = new Blob([JSON.stringify(evaluation, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${evaluation?.scenario_id || 'theme4-evaluation'}.json`; link.click(); URL.revokeObjectURL(link.href) }
  const metrics = evaluation?.evaluation
  return <Shell title="Theme 4 Evaluation" eyebrow="EVALUATION DASHBOARD" navigate={navigate} user={user} onLogout={onLogout}><div className="theme4-dashboard"><div className="theme4-intro"><div><span className="failure-kicker">HACKFUSION 2026 · THEME 4</span><h2>Fleet Recovery Under Cascading Failures</h2><p>Live evaluation of the authoritative simulation state. Prediction is explicitly labeled simulation-based.</p></div><div className="theme4-actions"><button className="outline-button" onClick={exportResults} disabled={!evaluation}>Export JSON</button><button className="outline-button" onClick={() => action(resetTheme4, 'Simulation reset')}>Reset</button></div></div><section className="theme4-controls panel"><div className="panel-heading"><div><h2>Failure injection center</h2><p>Inject independent failures while the mission is running.</p></div></div><div className="theme4-form"><label>Robot<input className="profile-input" value={robotId} onChange={(event) => setRobotId(event.target.value.toUpperCase())} /></label><label>Failure type<select className="filter-button" value={failureType} onChange={(event) => setFailureType(event.target.value)}>{['motor', 'sensor', 'communication', 'battery', 'cpu', 'temperature', 'navigation', 'power', 'custom'].map((item) => <option key={item}>{item}</option>)}</select></label><label>Severity<select className="filter-button" value={severity} onChange={(event) => setSeverity(event.target.value)}><option>warning</option><option>critical</option><option>failed</option></select></label><label>Timing<select className="filter-button" value={timing} onChange={(event) => setTiming(event.target.value)}><option>immediate</option><option>delayed</option><option>progressive</option></select></label><button className="primary-button" onClick={() => action(() => injectTheme4Failure({ robot_id: robotId, failure_type: failureType, severity, timing }), `${robotId} failure injected`)}>Inject failure</button></div></section><section className="theme4-controls panel"><div className="panel-heading"><div><h2>Adaptive failure scenario generator</h2><p>Seeded, reproducible sequences handle combinations the demo did not predefine.</p></div></div><div className="theme4-form"><label>Failures<input className="profile-input" type="number" min="1" max="20" value={count} onChange={(event) => setCount(Number(event.target.value))} /></label><label>Seed<input className="profile-input" type="number" value={seed} onChange={(event) => setSeed(event.target.value)} /></label><button className="outline-button" onClick={() => action(() => generateTheme4Scenario(count, seed), 'Scenario generated').then(setScenario)}>Generate sequence</button><button className="primary-button" onClick={() => action(() => runTheme4Scenario(count, seed), 'Scenario executed')}>Run sequence</button><button className="outline-button" onClick={() => action(() => benchmarkTheme4(count, seed), 'Benchmark completed').then(setBenchmark)}>Run benchmark</button></div>{scenario && <div className="theme4-sequence"><strong>{scenario.scenario_id} · seed {scenario.seed}</strong>{scenario.sequence.map((item) => <span key={item.order}>{item.order}. {item.robot_id} · {item.failure_type} · {item.severity} · {item.timing}</span>)}</div>}</section>{metrics && <div className="metric-grid"><Metric label="Mission preservation" value={`${metrics.mission_preservation}%`} detail="recovered / achievable" /><Metric label="Fleet availability" value={`${metrics.active} / ${metrics.robots}`} detail="authoritative state" /><Metric label="Cascade depth" value={metrics.cascade_depth} detail="derived graph hops" /><Metric label="Tasks migrated" value={metrics.tasks_migrated} detail="actual migrations" /></div>}<div className="theme4-columns"><Panel title="Requirement matrix"><div className="data-list">{(evaluation?.requirements || []).map((item) => <div key={item.name}><strong>{item.name}</strong><span className={item.passed ? 'healthy' : 'critical'}>{item.passed ? 'PASS' : 'PENDING'}</span></div>)}</div></Panel><Panel title="Recovery effectiveness"><div className="data-list"><div><strong>Containment</strong><span>{metrics?.cascade_containment ?? 0}%</span></div><div><strong>Battery efficiency</strong><span>{metrics?.battery_efficiency ?? 0}% average reserve</span></div><div><strong>Migration efficiency</strong><span>{metrics?.migration_efficiency ?? 0}%</span></div><div><strong>Prediction evaluation</strong><span>{metrics?.prediction_evaluation?.population ? `F1 ${metrics.prediction_evaluation.f1}` : 'Not statistically valid yet'}</span></div></div></Panel></div>{benchmark && <Panel title="Recovery benchmark"><div className="theme4-benchmark"><div><strong>Without recovery</strong><span>{benchmark.baseline.mission_preservation}% preservation · {benchmark.baseline.tasks_failed} tasks failed</span></div><div><strong>With Sentinel recovery</strong><span>{benchmark.sentinel_recovery.mission_preservation}% preservation · {benchmark.sentinel_recovery.tasks_failed} tasks failed · {benchmark.sentinel_recovery.tasks_migrated} migrated</span></div></div></Panel>}{message && <div className="profile-message" role="status">{message}</div>}</div></Shell>
}
export function JudgeModePage({ navigate, user, onLogout }) {
  const [report, setReport] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Live evidence is read from the authoritative simulation.')

  const refresh = async () => {
    const [nextReport, nextCandidates] = await Promise.all([
      getTheme4Evaluation(),
      getRecoveryCandidates('R-003'),
    ])
    setReport(nextReport)
    setCandidates(nextCandidates.candidates || [])
  }

  useEffect(() => { refresh().catch((error) => setMessage(error.message)) }, [])

  const startJudgeDemo = async () => {
    setBusy(true)
    setMessage('Resetting to the deterministic 10-robot baseline...')
    try {
      await resetTheme4()
      await updateSimulationControl({ running: true })
      setMessage('Advancing the normal fleet to capture live task progress...')
      await new Promise((resolve) => window.setTimeout(resolve, 2100))
      await getSimulationState()
      setMessage('Prediction warning: injecting progressive motor failure on R-003...')
      await injectTheme4Failure({ robot_id: 'R-003', failure_type: 'motor', severity: 'critical', timing: 'progressive' })
      const candidateData = await getRecoveryCandidates('R-003')
      setCandidates(candidateData.candidates || [])
      setMessage('R-003 task at risk: migrating the preserved task to R-007...')
      await migrateTasks('R-003', '', 'R-007')
      setMessage('Task migrated: injecting a second progressive failure on R-005...')
      await injectTheme4Failure({ robot_id: 'R-005', failure_type: 'communication', severity: 'critical', timing: 'progressive' })
      setMessage('R-007 is traveling the recovery route; allowing the live simulation to advance...')
      await new Promise((resolve) => window.setTimeout(resolve, 8200))
      await getSimulationState()
      setReport(await getTheme4Evaluation())
      setMessage('Scenario complete. Recovery and performance values below reflect the live simulation snapshot.')
    } catch (error) {
      setMessage(`Demo stopped: ${error.message}`)
      try { await refresh() } catch { /* retain the last available evidence */ }
    } finally {
      setBusy(false)
    }
  }

  const state = report?.state
  const metrics = report?.evaluation || {}
  const lastFailure = state?.failures?.[state.failures.length - 1]
  const migration = state?.migrations?.[state.migrations.length - 1]
  const recoveryFailure = state?.failures?.find((item) => item.robot_id === migration?.source_robot) || lastFailure
  const recoveryPrediction = state?.predictions?.find((item) => item.robot_id === recoveryFailure?.robot_id) || state?.predictions?.[state.predictions.length - 1]
  const predictionTimeline = (state?.events || []).slice().reverse().filter((event) => ['WARNING', 'HIGH_RISK', 'PREDICTION', 'PROPAGATION', 'FAILURE'].includes(event.type)).slice(-10)
  const protectedTask = state?.tasks?.[migration?.task_ids?.[0] || 'T-003']
  const protectedMission = state?.missions?.find((mission) => mission.tasks?.includes(protectedTask?.id))
  const affectedRobots = [...new Set((state?.failures || []).map((failure) => failure.robot_id))]
  const propagationNodes = [recoveryFailure?.robot_id, protectedTask?.id, protectedTask?.mission_id, migration?.destination_robot].filter(Boolean)
  const batteryCost = state?.baseline_average_battery === undefined || metrics.average_battery === undefined ? undefined : Math.round((state.baseline_average_battery - metrics.average_battery) * 10) / 10
  const display = (value, suffix = '') => value === null || value === undefined ? '—' : `${value}${suffix}`

  return <Shell title="Judge Mode" eyebrow="HACKFUSION 2026 · THEME 4" navigate={navigate} user={user} onLogout={onLogout}>
    <section className="judge-demo-bar panel">
      <div><span className="failure-kicker">DETERMINISTIC LIVE SCENARIO</span><strong>From prediction warning to mission recovery</strong><p role="status">{message}</p></div>
      <button className="primary-button" onClick={startJudgeDemo} disabled={busy}>{busy ? 'Running scenario…' : 'START JUDGE DEMO'}</button>
    </section>
    <div className="judge-sections">
      <section className="judge-section panel summary-card-panel"><span className="failure-kicker">01 · FAILURE DETECTION &amp; PREDICTION</span><h2>Risk before impact</h2><div className="data-list"><div><strong>Robot health</strong><span>{display(state?.robots?.find((robot) => robot.id === recoveryPrediction?.robot_id)?.health, '%')}</span></div><div><strong>Predicted failure</strong><span>{recoveryPrediction ? `${recoveryPrediction.robot_id} · ${recoveryPrediction.subsystem}` : 'No recorded prediction'}</span></div><div><strong>Risk / confidence</strong><span>{recoveryPrediction ? `${recoveryPrediction.probability}% / ${Math.round(recoveryPrediction.confidence * 100)}%` : '—'}</span></div><div><strong>Actual failure</strong><span>{recoveryFailure ? `${recoveryFailure.robot_id} · ${recoveryFailure.subsystem}` : 'No recorded failure'}</span></div><div><strong>Prediction timeline</strong><span>{predictionTimeline.length ? predictionTimeline.map((event) => `${event.robot || 'Fleet'} ${event.type}`).join(' → ') : 'No recorded prediction timeline'}</span></div></div></section>
      <section className="judge-section panel summary-card-panel"><span className="failure-kicker">02 · FAILURE PROPAGATION &amp; IMPACT</span><h2>Impact chain</h2><div className="judge-propagation-graph" aria-label="Live failure propagation chain">{propagationNodes.length ? propagationNodes.map((node, index) => <span key={`${node}-${index}`}>{index > 0 && <i aria-hidden="true">→</i>}<strong>{node}</strong></span>) : <span>Awaiting failure propagation</span>}</div><div className="data-list"><div><strong>Failed source / severity</strong><span>{recoveryFailure ? `${recoveryFailure.robot_id} · ${recoveryFailure.severity}` : '—'}</span></div><div><strong>Affected task / mission</strong><span>{protectedTask?.id || '—'} / {protectedTask?.mission_id || '—'}</span></div><div><strong>Affected robots</strong><span>{affectedRobots.length ? affectedRobots.join(', ') : '—'}</span></div><div><strong>Fleet capacity active / total</strong><span>{display(metrics.active)} / {display(metrics.robots)}</span></div><div><strong>Cascade depth</strong><span>{display(metrics.cascade_depth)}</span></div><div><strong>Affected / contained nodes</strong><span>{display(metrics.affected_nodes)} / {display(metrics.contained_nodes)}</span></div></div></section>
      <section className="judge-section panel summary-card-panel"><span className="failure-kicker">03 · TASK REALLOCATION &amp; FLEET REBALANCING</span><h2>Replacement candidates</h2><div className="judge-candidates">{candidates.filter((candidate, index) => index < 3 || candidate.robot_id === migration?.destination_robot).map((candidate) => <div key={candidate.robot_id} className={candidate.robot_id === migration?.destination_robot ? 'selected' : ''}><strong>{candidate.robot_id}{candidate.robot_id === migration?.destination_robot ? ' · SELECTED' : ''}</strong><span>Score {candidate.score} · Health {candidate.health}% · Battery {candidate.battery}%</span><small>Distance {candidate.distance} · Capacity {candidate.capacity}% · {candidate.deadline}</small></div>)}{!candidates.length && <p>Candidate scores appear after simulation data loads.</p>}</div><p className="judge-evidence-line">Replacement: {migration?.destination_robot || 'No task migration recorded'}</p></section>
      <section className="judge-section panel summary-card-panel"><span className="failure-kicker">04 · MISSION CONTINUITY &amp; RECOVERY</span><h2>Protected task</h2><div className="data-list"><div><strong>Assigned robot</strong><span>{protectedTask?.assigned_robot || '—'}</span></div><div><strong>Task status</strong><span>{protectedTask?.status || '—'}</span></div><div><strong>Mission status</strong><span>{protectedMission ? `${protectedMission.status || 'IN PROGRESS'} · ${protectedMission.progress}%` : '—'}</span></div><div><strong>Progress / remaining</strong><span>{display(protectedTask?.progress, '%')} / {display(protectedTask?.remaining_progress, '%')}</span></div><div><strong>Progress preserved at interruption</strong><span>{display(protectedTask?.recovery_start_progress, '%')}</span></div><div><strong>Recovery time</strong><span>{display(protectedTask?.recovery_time_seconds, ' seconds')}</span></div><div><strong>Additional travel</strong><span>{display(protectedTask?.additional_travel_units, ' map units')}</span></div><div><strong>Interruption point</strong><span>{protectedTask?.interruption_point ? `${protectedTask.interruption_point.x}, ${protectedTask.interruption_point.y}` : 'Not recorded'}</span></div></div></section>
      <section className="judge-section panel summary-card-panel"><span className="failure-kicker">05 · TECHNICAL IMPLEMENTATION &amp; PERFORMANCE</span><h2>Measured simulation output</h2><div className="data-list"><div><strong>Mission preservation</strong><span>{display(metrics.mission_preservation, '%')}</span></div><div><strong>Baseline / recovered performance</strong><span>{display(metrics.baseline_performance, '%')} / {display(metrics.recovered_performance, '%')}</span></div><div><strong>Tasks migrated / failed</strong><span>{display(metrics.tasks_migrated)} / {display(metrics.tasks_failed)}</span></div><div><strong>Battery used / fleet utilization</strong><span>{display(batteryCost, ' pp')} / {display(metrics.fleet_utilization_after, '%')}</span></div></div></section>
    </div>
  </Shell>
}

export function DigitalTwinPage({ navigate, user, onLogout }) {
  const { state } = useSimulationData()
  const [selectedId, setSelectedId] = useState(() => window.sessionStorage.getItem('sentinel-selected-robot') || 'R-003')

  const robots = state?.robots || []
  const robot = robots.find((item) => item.id === selectedId) || robots[0]
  const task = robot && state?.tasks?.[robot.task_id || robot.current_task]
  const failures = (state?.failures || []).filter((item) => item.robot_id === robot?.id)
  const prediction = (state?.predictions || []).find((item) => item.robot_id === robot?.id)
  const mission = state?.missions?.find((item) => item.id === robot?.mission_id)
  const subsystemStatus = (subsystem) => failures.find((item) => item.subsystem === subsystem)?.severity || 'No recorded event'

  return <Shell title="Digital Twin" eyebrow="ROBOT TELEMETRY" navigate={navigate} user={user} onLogout={onLogout}>
    <div className="digital-twin-page-grid">
      <Panel title="Active fleet">
        <div className="digital-twin-robot-list">{robots.map((item) => <button key={item.id} className={item.id === robot?.id ? 'selected' : ''} onClick={() => { setSelectedId(item.id); window.sessionStorage.setItem('sentinel-selected-robot', item.id) }}><strong>{item.id}</strong><span>{item.status} · {item.battery}% battery</span></button>)}</div>
      </Panel>
      {robot ? <Panel title={`${robot.id} · ${robot.type}`}>
        <GoogleFleetMap robots={robots} selectedRobot={robot} onSelect={(item) => setSelectedId(item.id)} />
        <div className="metric-grid"><Metric label="Health" value={`${robot.health}%`} detail={robot.status} /><Metric label="Battery" value={`${robot.battery}%`} detail={robot.charging_state || 'current reserve'} /><Metric label="Speed" value={`${robot.speed || 0} map units/s`} detail="backend telemetry" /><Metric label="Task progress" value={task ? `${task.progress || 0}%` : '—'} detail={task?.status || 'No active task'} /><Metric label="Failure risk" value={prediction ? `${prediction.probability}%` : 'Not available'} detail={prediction?.model || 'No prediction record'} /></div>
        <div className="digital-twin-detail-grid">
          <div className="dashcard">
            <div className="dashcard-header">Mission overview</div>
            <div className="dashcard-grid">
              <div className="dashcard-item"><span>Task / mission</span><strong>{robot.task_id || robot.current_task || 'Unassigned'} / {mission?.name || task?.mission_id || robot.mission_id || '—'}</strong></div>
              <div className="dashcard-item"><span>Mission status</span><strong>{mission?.status || 'Not assigned'}</strong></div>
              <div className="dashcard-item"><span>Position</span><strong>{robot.position ? `${robot.position.x}, ${robot.position.y}` : 'Not reported'}</strong></div>
              <div className="dashcard-item"><span>Destination</span><strong>{robot.destination || task?.destination || 'Not assigned'}</strong></div>
              <div className="dashcard-item"><span>Route</span><strong>{(robot.route || []).join(' → ') || 'No active route'}</strong></div>
              <div className="dashcard-item"><span>Failure point</span><strong>{robot.failure_position ? `${robot.failure_position.x}, ${robot.failure_position.y}` : 'Not recorded'}</strong></div>
              <div className="dashcard-item"><span>Interruption point</span><strong>{task?.interruption_point ? `${task.interruption_point.x}, ${task.interruption_point.y}` : 'Not recorded'}</strong></div>
              <div className="dashcard-item"><span>Telemetry evidence</span><strong>{prediction ? `${prediction.subsystem || 'general'} · health ${prediction.indicators?.health ?? robot.health}% · battery ${prediction.indicators?.battery ?? robot.battery}%` : 'No recorded prediction indicators'}</strong></div>
              <div className="dashcard-item"><span>Recovery state</span><strong>{robot.recovery_state || robot.operating_state || 'Not reported'}</strong></div>
              <div className="dashcard-item"><span>Last update</span><strong>{robot.last_update || 'Not reported'}</strong></div>
            </div>
          </div>

          <div className="dashcard">
            <div className="dashcard-header">Subsystem health</div>
            <div className="dashcard-grid compact">
              {['motor', 'navigation', 'communication', 'sensor'].map((item) => (
                <div key={item} className="dashcard-item mini">
                  <span>{item}</span>
                  <strong>{subsystemStatus(item)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="dashcard dashcard-wide">
            <div className="dashcard-header">Route waypoints</div>
            <div className="dashcard-grid compact">
              {(robot.waypoints || []).map((point, index) => (
                <div key={`${point.x}-${point.y}-${index}`} className="dashcard-item mini">
                  <span>{index === 0 ? 'Current / origin' : `Waypoint ${index}`}</span>
                  <strong>{point.x}, {point.y}</strong>
                </div>
              ))}
              {!robot.waypoints?.length && <div className="dashcard-item"><span>Route</span><strong>No route reported.</strong></div>}
            </div>
          </div>
        </div>
      </Panel> : <Panel title="Robot telemetry"><p>Waiting for authoritative fleet state.</p></Panel>}
    </div>
  </Shell>
}

export function GenericPublicPage({ title, navigate, user, onLogout, children }) { return <Shell title={title} eyebrow={title.toUpperCase()} navigate={navigate} user={user} onLogout={onLogout}><Panel title={title}>{children || <p>Sentinel Robotics operational intelligence for resilient fleet recovery.</p>}</Panel></Shell> }

export function SummaryPage({ navigate, user, onLogout }) {
  const { state, evaluation } = useSimulationData()
  const metrics = evaluation || {}
  const robots = state?.robots || []
  const activeRobots = robots.filter((robot) => ['healthy', 'warning', 'recovering', 'active'].includes(String(robot.status).toLowerCase())).length
  const failedRobots = robots.filter((robot) => ['failed', 'critical'].includes(String(robot.status).toLowerCase())).length
  const chargingRobots = robots.filter((robot) => String(robot.status).toLowerCase() === 'charging').length
  const atRiskTasks = Object.values(state?.tasks || {}).filter((task) => task.status === 'AT RISK' || task.status === 'RECOVERING').length
  const missionContinuity = metrics.mission_preservation ?? 0
  const missionRecords = state?.missions || []
  const failureRecords = state?.failures || []
  const predictionRecords = state?.predictions || []
  const recentFailure = failureRecords[failureRecords.length - 1]
  const latestPrediction = predictionRecords[predictionRecords.length - 1]

  return <Shell title="Summary" eyebrow="PROJECT SUMMARY" navigate={navigate} user={user} onLogout={onLogout}>
    <section className="summary-page">
      <header className="summary-hero panel">
        <div>
          <span className="failure-kicker">SENTINEL ROBOTICS</span>
          <h2>Keep the mission moving.</h2>
          <p>Intelligent fleet recovery under cascading failures.</p>
        </div>
        <button className="primary-button" onClick={() => navigate('/simulation')}>Open live simulation</button>
      </header>

      <div className="metric-grid">
        <Metric label="Robots" value={state ? robots.length : '—'} detail="authoritative active fleet" />
        <Metric label="Active Robots" value={activeRobots} detail="operational" />
        <Metric label="Failed Robots" value={failedRobots} detail="active failures" />
        <Metric label="Charging Robots" value={chargingRobots} detail="battery recovery" />
        <Metric label="Tasks at Risk" value={atRiskTasks} detail="protect operations" />
        <Metric label="Mission Continuity" value={state ? `${missionContinuity}%` : '—'} detail="derived from mission task states" />
      </div>

      <section className="summary-section panel summary-card-panel">
        <div className="summary-section-label">LIVE FLEET DATA</div>
        <div className="summary-live-grid">
          <div className="summary-data-panel">
            <h3>Mission continuity</h3>
            <div className="data-list">
              {missionRecords.length ? missionRecords.map((mission) => (
                <div key={mission.id || mission.name}>
                  <strong>{mission.name || mission.id || 'Mission'}</strong>
                  <span>{mission.status || 'SIMULATION STATE'} · {mission.progress ?? '—'}%</span>
                  <small>{mission.priority || 'Priority unavailable'} · {mission.tasks?.length || 0} active tasks</small>
                </div>
              )) : <div><strong>No mission records</strong><span>Awaiting live simulation state</span></div>}
            </div>
          </div>
          <div className="summary-data-panel">
            <h3>Failure and recovery state</h3>
            <div className="data-list">
              <div>
                <strong>Latest failure</strong>
                <span>{recentFailure ? `${recentFailure.robot_id || 'Robot'} · ${recentFailure.subsystem || 'system'}` : 'No recorded failure'}</span>
                <small>{recentFailure ? `Severity: ${recentFailure.severity || 'unknown'}` : 'Awaiting incident'}</small>
              </div>
              <div>
                <strong>Latest prediction</strong>
                <span>{latestPrediction ? `${latestPrediction.robot_id || 'Robot'} · ${latestPrediction.probability ?? '—'}% risk` : 'No prediction available'}</span>
                <small>{latestPrediction ? `Confidence: ${Math.round((latestPrediction.confidence ?? 0) * 100)}%` : 'Awaiting risk signal'}</small>
              </div>
              <div>
                <strong>Recovery snapshots</strong>
                <span>{state?.migrations?.length ? `${state.migrations.length} task migrations` : 'No recovery event'}</span>
                <small>{state?.migrations?.at(-1)?.status || 'Standby'}</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="summary-section panel summary-card-panel">
        <div className="summary-section-label">THE PROBLEM</div>
        <div className="summary-card-feature">
          <h3>Large robot fleets can experience cascading failures that propagate across tasks, missions, and fleet capacity.</h3>
          <p>Sentinel detects failures, predicts risk, analyzes impact, reassigns work, rebalances capacity, and preserves mission continuity under degraded robot health.</p>
        </div>
      </section>

      <section className="summary-section panel summary-card-panel">
        <div className="summary-section-label">RECOVERY FLOW</div>
        <div className="summary-flow summary-flow-cards">
          <div className="summary-flow-card"><strong>Telemetry</strong><span>↓</span></div>
          <div className="summary-flow-card"><strong>Failure Detection</strong><span>↓</span></div>
          <div className="summary-flow-card"><strong>Failure Prediction</strong><span>↓</span></div>
          <div className="summary-flow-card"><strong>Impact Analysis</strong><span>↓</span></div>
          <div className="summary-flow-card"><strong>Task Reallocation</strong><span>↓</span></div>
          <div className="summary-flow-card"><strong>Fleet Rebalancing</strong><span>↓</span></div>
          <div className="summary-flow-card highlight"><strong>Mission Recovery</strong></div>
        </div>
      </section>

      <section className="summary-section panel summary-card-panel">
        <div className="summary-section-label">THEME 4 CATEGORIES</div>
        <div className="summary-cards">
          <article className="summary-category-card"><span>01</span><h4>Failure Detection & Prediction</h4><small>Simulation-based risk detection and forecasting</small></article>
          <article className="summary-category-card"><span>02</span><h4>Failure Propagation & Impact Analysis</h4><small>Task and mission dependency tracing</small></article>
          <article className="summary-category-card"><span>03</span><h4>Dynamic Task Reallocation & Fleet Rebalancing</h4><small>Candidate ranking and live migration logic</small></article>
          <article className="summary-category-card"><span>04</span><h4>Mission Continuity & Recovery</h4><small>Interruption-point continuation and preservation</small></article>
          <article className="summary-category-card"><span>05</span><h4>Technical Implementation, Simulation & Performance</h4><small>FastAPI, React, Vite, real-time state, and deterministic scenarios</small></article>
        </div>
      </section>

      <section className="summary-section panel summary-card-panel">
        <div className="summary-section-label">HOW RECOVERY WORKS</div>
        <ol className="summary-steps summary-steps-cards">
          <li>Detect abnormal robot telemetry.</li>
          <li>Predict failure risk and confidence.</li>
          <li>Analyze the affected tasks and mission impact.</li>
          <li>Reallocate to a healthy available robot.</li>
          <li>Rebalance fleet workload and battery capacity.</li>
          <li>Continue the remaining task and recover the mission.</li>
        </ol>
      </section>

      <section className="summary-section panel summary-card-panel">
        <div className="summary-section-label">TECHNOLOGY</div>
        <div className="summary-tech-grid">
          <div className="summary-tech-card"><strong>Frontend</strong><span>React · Vite</span></div>
          <div className="summary-tech-card"><strong>Backend</strong><span>FastAPI · Python</span></div>
          <div className="summary-tech-card"><strong>Realtime</strong><span>WebSocket</span></div>
          <div className="summary-tech-card"><strong>Authentication</strong><span>Firebase Authentication</span></div>
          <div className="summary-tech-card"><strong>Deployment</strong><span>Vercel · Render</span></div>
          <div className="summary-tech-card"><strong>Simulation</strong><span>Authoritative fleet simulation engine</span></div>
        </div>
      </section>

      <section className="summary-section panel summary-card-panel">
        <div className="summary-section-label">JUDGE DEMO FLOW</div>
        <ol className="summary-steps summary-steps-cards">
          <li>Open Command Center.</li>
          <li>View 10 robots and live state.</li>
          <li>Start simulation.</li>
          <li>Observe routes and telemetry.</li>
          <li>Inject a robot failure.</li>
          <li>Review prediction, propagation, and task impact.</li>
          <li>Allow automatic recovery to select a replacement.</li>
          <li>Track the remaining task and mission continuity.</li>
        </ol>
        <button className="primary-button summary-primary-button" onClick={() => navigate('/simulation')}>Open live simulation</button>
      </section>
    </section>
  </Shell>
}

export function AdminPage({ navigate, admin, onLogout }) { const [tab, setTab] = useState('Overview'); const [query, setQuery] = useState(''); const filtered = robots.filter((robot) => robot.id.includes(query.toUpperCase())); return <Shell title="Admin control center" eyebrow="ADMIN" navigate={navigate} user={{ name: admin?.username || 'Administrator' }} onLogout={onLogout}><div className="admin-tabs">{['Overview', 'Users', 'Fleet', 'Alerts', 'Analytics', 'Activity', 'System', 'Settings'].map((item) => <button className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</div>{tab === 'Overview' && <><div className="metric-grid"><Metric label="Users" value="1" detail="active" /><Metric label="Robots" value="100" detail="simulated fleet" /><Metric label="Missions" value="3" detail="active" /><Metric label="Alerts" value="2" detail="requires review" /></div><Panel title="Recent activity"><div className="data-list">{events.map((event) => <div key={event.time}><strong>{event.type} · {event.robot}</strong><span>{event.status}</span><small>{event.description}</small></div>)}</div></Panel></>}{tab === 'Users' && <Panel title="Users"><div className="table-tools"><input className="profile-input" placeholder="Search users" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="data-list"><div><strong>Authenticated operators</strong><span>{query ? 'No matching users' : '1 active user'}</span></div></div></Panel>}{tab === 'Fleet' && <Panel title="Fleet"><div className="fleet-grid">{robots.slice(0, 20).map((robot) => <div className="fleet-robot" key={robot.id}><strong>{robot.id}</strong><span>{robot.type}</span><small>{robot.status} · {robot.health}%</small></div>)}</div></Panel>}{['Alerts', 'Analytics', 'Activity', 'System', 'Settings'].includes(tab) && <Panel title={tab}><div className="data-list"><div><strong>{tab} data</strong><span>Connected</span><small>Authoritative Sentinel Robotics simulation state.</small></div></div></Panel>}</Shell> }

export function AdminManagementPage({ navigate, admin, onLogout }) {
  const [tab, setTab] = useState('Overview')
  const [state, setState] = useState(null)
  const [query, setQuery] = useState('')
  const [alertTitle, setAlertTitle] = useState('')
  const [alertMessage, setAlertMessage] = useState('')
  const token = admin?.access_token
  useEffect(() => { getAdminState(token).then(setState).catch(() => onLogout()) }, [token])
  const fleet = state?.robots || robots
  const refresh = () => getAdminState(token).then(setState)
  const submitAlert = async (event) => { event.preventDefault(); await createAdminAlert({ recipient: 'all', severity: 'warning', title: alertTitle, message: alertMessage }, token); setAlertTitle(''); setAlertMessage(''); await refresh() }
  const content = {
    Overview: <><div className="metric-grid"><Metric label="Users" value="1" detail="authoritative" /><Metric label="Robots" value={fleet.length} detail="live simulation" /><Metric label="Missions" value={state?.missions?.length || 0} detail="active" /><Metric label="Recovery events" value={state?.events?.length || 0} detail="recorded" /></div><Panel title="Recent activity"><div className="data-list">{(state?.activity || state?.events || []).slice(0, 8).map((event, index) => <div key={`${event.timestamp || event.time}-${index}`}><strong>{event.type}</strong><small>{event.message}</small></div>)}</div></Panel></>,
    Users: <Panel title="Users"><div className="table-tools"><input className="profile-input" placeholder="Search users" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="data-list"><div><strong>Public visitor</strong><span>{query && !'Public visitor'.toLowerCase().includes(query.toLowerCase()) ? 'No match' : 'Public access'}</span><small>preview@sentinel.local</small></div></div></Panel>,
    Fleet: <Panel title="Fleet management"><div className="fleet-grid">{fleet.filter((robot) => robot.id.includes(query.toUpperCase())).map((robot) => <button className="fleet-robot" key={robot.id} onClick={async () => { if (robot.id === 'R-004') { await migrateAdminTasks(robot.id, token); await refresh() } }}><strong>{robot.id}</strong><span>{robot.type}</span><small>{robot.status} · {robot.health}%</small></button>)}</div></Panel>,
    Alerts: <Panel title="Create alert"><form className="admin-alert-form" onSubmit={submitAlert}><input className="profile-input" placeholder="Alert title" value={alertTitle} onChange={(event) => setAlertTitle(event.target.value)} required /><textarea className="profile-input" placeholder="Message" value={alertMessage} onChange={(event) => setAlertMessage(event.target.value)} required /><button className="primary-button" type="submit">Send alert</button></form><div className="data-list">{(state?.notifications || []).map((alert, index) => <div key={`${alert.alert_id || alert.timestamp}-${index}`}><strong>{alert.title}</strong><small>{alert.message}</small></div>)}</div></Panel>,
    Analytics: <Panel title="Analytics"><div className="data-list"><div><strong>Healthy robots</strong><span>{fleet.filter((robot) => robot.status === 'healthy').length}</span></div><div><strong>Task migrations</strong><span>{state?.migrations?.length || 0}</span></div><div><strong>Recorded events</strong><span>{state?.events?.length || 0}</span></div></div></Panel>,
    Activity: <Panel title="Activity"><div className="data-list">{(state?.activity || []).map((event, index) => <div key={`${event.timestamp}-${index}`}><strong>{event.type}</strong><small>{event.message}</small><span>{event.timestamp}</span></div>)}</div></Panel>,
    System: <Panel title="System"><div className="data-list"><div><strong>Backend status</strong><span>Connected</span></div><div><strong>Simulation state</strong><span>Authoritative</span></div></div></Panel>,
    Settings: <Panel title="Settings"><div className="data-list"><div><strong>Environment</strong><span>Simulation</span><small>Server-managed configuration</small></div></div></Panel>,
  }
  return <Shell title="Admin control center" eyebrow="ADMIN" navigate={navigate} user={{ name: 'Administrator', role: admin?.user?.username || admin?.username || 'Admin account' }} onLogout={onLogout}><div className="admin-tabs">{Object.keys(content).map((item) => <button className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</div>{content[tab]}</Shell>
}
