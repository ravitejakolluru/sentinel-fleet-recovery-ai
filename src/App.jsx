import { useEffect, useMemo, useRef, useState } from 'react'
import Landing from './LandingRedesign.jsx'
import SimulationPage from './SimulationPage.jsx'
import Profile from './Profile.jsx'
import { buildApiUrl } from './services/api.js'
import { AdminManagementPage, CommandCenterPage, DigitalTwinPage, FailureAnalysisPage, FleetPage, GenericPublicPage, JudgeModePage, MissionsPage, NotificationsPage, RecoveryPage } from './Pages.jsx'
import { auth, authErrorMessage, completeGoogleRedirect, createAccount, resetPassword, signInWithEmail, signInWithGoogle, signOutUser, subscribeToAuthState } from './services/auth.js'
import { getSimulationState, migrateTasks } from './services/simulation.js'

const baseMissions = [
  { name: 'Harbor perimeter sweep', icon: '⌁', priority: 'P0', status: 'Active', progress: 78, robots: '12 / 14', eta: '18 min', color: 'orange' },
  { name: 'Thermal leak survey', icon: '◌', priority: 'P1', status: 'Rebalancing', progress: 51, robots: '8 / 10', eta: '34 min', color: 'blue' },
  { name: 'Debris corridor mapping', icon: '⌗', priority: 'P1', status: 'Active', progress: 64, robots: '6 / 8', eta: '41 min', color: 'green' },
  { name: 'Substation inspection', icon: '⌂', priority: 'P2', status: 'Standby', progress: 22, robots: '3 / 6', eta: '1 h 12', color: 'purple' },
]

const initialRobots = [
  { id: 'R-001', type: 'Scout', battery: 82, health: 96, state: 'Active', task: 'Perimeter sweep', assigned_tasks: ['T-101'], probability: 12, zone: 'North dock', x: 27, y: 27 },
  { id: 'R-002', type: 'Scout', battery: 74, health: 92, state: 'Active', task: 'Thermal survey', zone: 'North dock', x: 36, y: 34 },
  { id: 'R-003', type: 'Carrier', battery: 68, health: 87, state: 'Active', task: 'Material transfer', zone: 'East grid', x: 52, y: 44 },
  { id: 'R-004', type: 'Inspector', battery: 38, health: 57, state: 'Recovering', task: 'Motor inspection', assigned_tasks: ['T-014'], probability: 93, zone: 'West yard', x: 42, y: 45 },
  { id: 'R-005', type: 'Heavy', battery: 46, health: 74, state: 'Warning', task: 'Debris mapping', zone: 'West yard', x: 35, y: 66 },
  { id: 'R-006', type: 'Scout', battery: 91, health: 99, state: 'Active', task: 'Perimeter sweep', zone: 'South gate', x: 74, y: 73 },
  { id: 'R-007', type: 'Carrier', battery: 71, health: 92, state: 'Active', task: 'Lift support', zone: 'West yard', x: 50, y: 54 },
  { id: 'R-008', type: 'Scout', battery: 63, health: 83, state: 'Warning', task: 'Route inspection', assigned_tasks: [], probability: 18, zone: 'East grid', x: 82, y: 27 },
  { id: 'R-009', type: 'Heavy', battery: 77, health: 95, state: 'Reserve', task: 'Available', zone: 'Charging bay', x: 16, y: 80 },
  { id: 'R-010', type: 'Inspector', battery: 81, health: 90, state: 'Active', task: 'Asset check', zone: 'South gate', x: 65, y: 62 },
]

const routeAliases = {
  '/command-center': '/',
  '/operations': '/simulation',
  '/theme4': '/judge',
  '/evaluation': '/judge',
  '/analytics': '/judge',
  '/notifications': '/alerts',
  '/events': '/alerts',
  '/developers': '/',
  '/resources': '/',
}

function canonicalPath(path) {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path
  return routeAliases[normalized] || normalized
}

function normalizeRobotId(robotId) {
  return String(robotId ?? '').trim().toUpperCase()
}

function findRobotById(robots, robotId) {
  if (!robotId || !Array.isArray(robots)) return null
  const normalized = normalizeRobotId(robotId)
  return robots.find((robot) => {
    const candidates = [robot.id, ...(robot.aliases || [])]
    return candidates.some((candidate) => normalizeRobotId(candidate) === normalized)
  }) || null
}

function Operations({ onLogout, user, navigate, path }) {
  const [intelligenceTab, setIntelligenceTab] = useState('Overview')
  const [selectedRobot, setSelectedRobot] = useState(null)
  const [migrationBusy, setMigrationBusy] = useState(false)
  const [migrationResult, setMigrationResult] = useState(null)
  const [authoritativeState, setAuthoritativeState] = useState(null)
  useEffect(() => {
    getSimulationState().then((snapshot) => {
      setAuthoritativeState(snapshot)
      setRobots((current) => current.map((robot) => {
        const authoritative = findRobotById(snapshot.robots, robot.id)
        if (!authoritative) return robot
        const statusMap = { healthy: 'Active', warning: 'Warning', critical: 'Critical', recovering: 'Recovering', failed: 'Critical' }
        return { ...robot, id: robot.id, canonical_id: authoritative.id, aliases: [...new Set([...(robot.aliases || []), ...(authoritative.aliases || [])])], health: authoritative.health, battery: authoritative.battery, state: statusMap[authoritative.status] || robot.state, task: authoritative.task || robot.task, assigned_tasks: authoritative.assigned_tasks || [] }
      }))
    }).catch(() => null)
  }, [])
  const [running, setRunning] = useState(false)
  const [scenario, setScenario] = useState('Cascade forecast')
  const [robots, setRobots] = useState(initialRobots)
  const [toast, setToast] = useState('')
  const [missionTick, setMissionTick] = useState(0)

  const healthyCount = robots.filter((robot) => robot.state === 'Active' || robot.state === 'Reserve').length
  const healthAverage = Math.round(robots.reduce((total, robot) => total + robot.health, 0) / robots.length)
  const systemRisk = useMemo(() => running ? 63 : 28, [running])

  const runRecovery = () => {
    setRunning(true)
    setMissionTick((tick) => tick + 1)
    setRobots((current) => current.map((robot) => {
      if (robot.state === 'Critical') return { ...robot, state: 'Recovering', task: 'Returning to dock', health: Math.min(100, robot.health + 5) }
      if (robot.state === 'Reserve') return { ...robot, state: 'Active', task: 'Perimeter sweep' }
      return { ...robot, battery: Math.max(18, robot.battery - 3) }
    }))
    setToast('Recovery plan deployed · 4 tasks migrated')
    window.setTimeout(() => setToast(''), 3200)
  }

  const injectFailure = () => {
    setRunning(true)
    setScenario('Live incident')
    setRobots((current) => current.map((robot) => robot.id === 'SV-117' ? { ...robot, state: 'Critical', health: 24, task: 'Signal lost' } : robot))
    setToast('Failure injected at Sector 4 · propagation analysis started')
    window.setTimeout(() => setToast(''), 3200)
  }

  const migrateSelected = async () => {
    if (!selectedRobot) return
    setMigrationBusy(true)
    setMigrationResult(null)
    try {
      const canonicalRobot = findRobotById(authoritativeState?.robots || robots, selectedRobot.id) || selectedRobot
      const response = await migrateTasks(canonicalRobot.id)
      const nextState = response.state || authoritativeState
      setAuthoritativeState(nextState)
      setMigrationResult(response.migration)
      const nextRobots = Array.isArray(nextState?.robots) ? nextState.robots : robots
      setRobots(nextRobots.map((robot) => {
        const mapped = findRobotById(initialRobots, robot.id) || robot
        const statusMap = { healthy: 'Active', warning: 'Warning', critical: 'Critical', recovering: 'Recovering', failed: 'Critical' }
        return {
          ...mapped,
          id: mapped.id || robot.id,
          canonical_id: robot.id,
          aliases: [...new Set([...(mapped.aliases || []), ...(robot.aliases || [])])],
          type: robot.type || mapped.type,
          health: robot.health,
          battery: robot.battery,
          state: statusMap[robot.status] || robot.status,
          task: robot.task || mapped.task,
          assigned_tasks: robot.assigned_tasks || [],
          probability: robot.probability || mapped.probability,
          zone: robot.zone || mapped.zone,
        }
      }))
      setSelectedRobot(findRobotById(nextRobots, canonicalRobot.id) || findRobotById(nextRobots, selectedRobot.id) || selectedRobot)
    } catch (error) {
      setMigrationResult({ status: 'blocked', reason: error.message })
    } finally { setMigrationBusy(false) }
  }

  return (
    <div className="app-shell authenticated-shell">
      <aside className="sidebar">
        <button className="brand-lockup brand-home" onClick={() => navigate('/')} aria-label="Sentinel Robotics home"><span className="brand-mark">S</span><span className="brand-copy"><strong>SENTINEL</strong><small>ROBOTICS</small></span></button>
        <div className="sidebar-label">COMMAND CENTER</div>
        <nav className="sidebar-nav">
          {[['Command center', '/operations', '⌂'], ['Robot fleet', '/fleet', '◇'], ['Missions', '/missions', '◎'], ['Failure analysis', '/failure-analysis', '△'], ['Recovery', '/recovery', '↻'], ['Theme 4 evaluation', '/theme4', '✓']].map(([item, destination, icon]) => <button key={item} className={path === destination ? 'nav-item active' : 'nav-item'} onClick={() => navigate(destination)}><span className="nav-icon" aria-hidden="true">{icon}</span><span>{item}</span><span className="nav-arrow">›</span></button>)}
        </nav>
        <div className="sidebar-bottom"><div className="system-status"><span className="pulse-dot" />SYSTEM NOMINAL<span className="status-time">12:42:08 UTC</span></div><button className="operator" onClick={() => navigate('/profile')}><div className="avatar">{user?.photoURL ? <img src={user.photoURL} alt="" /> : (user?.name?.slice(0, 2).toUpperCase() || 'AR')}</div><div className="operator-copy"><strong>{user?.name || 'Alex Rivera'}</strong><small>{user?.role || user?.email || 'Profile'}</small></div></button><button className="sidebar-logout" onClick={onLogout}><span aria-hidden="true">↪</span> Logout</button></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><div className="breadcrumb">SENTINEL ROBOTICS <span>/</span> {path === '/operations' ? 'COMMAND CENTER' : path.slice(1).toUpperCase()}</div><h1>{path === '/operations' ? 'Recovery Command Center' : 'Fleet operations'}</h1><p className="command-subtitle">Robot fleet recovery under cascading failures</p></div><div className="top-actions"><span className="shell-live"><i /> SYSTEM LIVE</span><span className="shell-stat">10 ROBOTS</span><button className="icon-button" aria-label="Notifications">♧<span className="notification-dot" /></button><button className="outline-button" onClick={() => setToast('System report exported')}>⇩ Export report</button><button className="primary-button" onClick={runRecovery}>Run recovery plan <span>↗</span></button></div></header>
        <section className="scenario-bar"><div className="scenario-title"><span className="live-indicator">●</span><div><strong>{scenario}</strong><small>Model updated 14 seconds ago</small></div></div><div className="scenario-controls"><label>Scenario</label><select value={scenario} onChange={(event) => setScenario(event.target.value)}><option>Cascade forecast</option><option>Live incident</option><option>Battery stress test</option></select><button className="ghost-button" onClick={() => setToast('Simulation reset to baseline')}>↻ Reset</button></div></section>

        <IntelligencePanel tab={intelligenceTab} robots={authoritativeState?.robots || robots} onRobot={(robot) => setSelectedRobot(findRobotById(authoritativeState?.robots || robots, robot.id) || robot)} onTabChange={setIntelligenceTab} missionContinuity={authoritativeState?.performance?.recovered ?? 0} />

        <section className="metric-grid"><Metric label="Mission performance" value={running ? '91.8%' : '94.6%'} change={running ? '-2.8%' : '+1.4%'} detail="vs. baseline" tone={running ? 'warning' : 'positive'} /><Metric label="Fleet availability" value={running ? '82 / 100' : '94 / 100'} change={running ? '-12' : '+3'} detail="units operational" tone={running ? 'warning' : 'positive'} /><Metric label="Propagation risk" value={`${systemRisk}%`} change={running ? '+35%' : '-8%'} detail="next 30 min" tone={running ? 'danger' : 'positive'} /><Metric label="Energy reserve" value={running ? '68%' : '74%'} change={running ? '-6%' : '+2%'} detail="fleet weighted" tone={running ? 'warning' : 'positive'} /></section>

        <section className="content-grid"><div className="map-panel panel"><div className="panel-heading"><div><h2>Live fleet map</h2><p>Port Meridian · 10 units tracked</p></div><div className="map-legend"><span><i className="legend-dot active-dot" /> Active</span><span><i className="legend-dot warn-dot" /> At risk</span><span><i className="legend-dot reserve-dot" /> Reserve</span></div></div><div className="map-canvas"><div className="map-grid-lines" /><div className="zone zone-a">NORTH DOCK</div><div className="zone zone-b">WEST YARD</div><div className="zone zone-c">EAST GRID</div><div className="route route-one" /><div className="route route-two" />{robots.map((robot) => <button key={robot.id} className={`robot-pin ${robot.state.toLowerCase()}`} style={{ left: `${robot.x}%`, top: `${robot.y}%` }} onClick={() => setSelectedRobot(robot)} aria-label={robot.id}><span>{robot.type === 'Heavy' ? '◆' : '✦'}</span><small>{robot.id}</small></button>)}<div className="map-scale">N<br /><span>↑</span><small>500 m</small></div></div><div className="map-footer"><span><strong>{healthyCount}</strong> active units</span><span><strong>{10 - healthyCount}</strong> reserve / degraded</span><span className="coverage"><i /> 98.2% telemetry coverage</span></div></div>

          <div className="risk-panel panel"><div className="panel-heading"><div><h2>Propagation analysis</h2><p>Predicted cascade path</p></div><button className="small-icon" onClick={() => setToast('Risk model details opened')}>↗</button></div><div className="risk-score"><div className="risk-ring" style={{ '--risk': `${systemRisk * 3.6}deg` }}><span>{systemRisk}<small>/100</small></span></div><div><strong>{running ? 'Elevated risk' : 'Low risk'}</strong><p>{running ? 'Active propagation detected' : 'No active propagation'}</p></div></div><div className="risk-list"><RiskRow label="Signal degradation" value={running ? 'High' : 'Low'} progress={running ? 72 : 24} tone={running ? 'red' : 'green'} /><RiskRow label="Battery cascade" value="Moderate" progress={46} tone="amber" /><RiskRow label="Task overload" value="Contained" progress={31} tone="blue" /></div><button className="text-button" onClick={injectFailure}>Inject failure event <span>→</span></button></div></section>

        <section className="lower-grid"><div className="missions-panel panel"><div className="panel-heading"><div><h2>Mission continuity</h2><p>Recovery-aware task allocation</p></div><button className="filter-button">All missions⌄</button></div><div className="mission-table"><div className="table-header"><span>Mission</span><span>Status</span><span>Progress</span><span>Fleet</span><span>ETA</span></div>{baseMissions.map((mission) => <div className="mission-row" key={mission.name}><div className="mission-name"><span className={`mission-icon ${mission.color}`}>{mission.icon}</span><div><strong>{mission.name}</strong><small>{mission.priority} priority</small></div></div><div><span className={`status-pill ${mission.status.toLowerCase().replace(' ', '-')}`}>{mission.status}</span></div><div className="progress-cell"><div className="progress-track"><span style={{ width: `${Math.min(100, mission.progress + missionTick * 2)}%` }} /></div><small>{Math.min(100, mission.progress + missionTick * 2)}%</small></div><span className="fleet-count">{mission.robots}</span><span className="eta">{mission.eta}</span></div>)}</div></div>
          <div className="event-panel panel"><div className="panel-heading"><div><h2>Event stream</h2><p>Last 30 minutes</p></div><span className="live-badge">LIVE</span></div><div className="event-list"><Event time="12:41:52" title="Recovery plan staged" detail="4 task migrations queued" tone="green" /><Event time="12:40:08" title="SV-117 health declining" detail="Sector 4 · 24% predicted in 8 min" tone="red" /><Event time="12:38:44" title="Battery rebalancing" detail="12 units routed to charging bay" tone="amber" /><Event time="12:34:19" title="Mission priority updated" detail="Harbor sweep promoted to P0" tone="blue" /></div><button className="text-button view-all" onClick={() => setToast('Full event stream opened')}>View all events <span>→</span></button></div></section>
        <footer><span>Sentinel autonomy layer v2.4.1</span><span>Decision latency <strong>142 ms</strong></span><span>Last sync <strong>12:42:08 UTC</strong></span></footer>
      </main>
      {selectedRobot && <div className="modal-backdrop" onClick={() => setSelectedRobot(null)}><section className="digital-twin panel" onClick={(event) => event.stopPropagation()}><button className="small-icon" onClick={() => setSelectedRobot(null)} aria-label="Close digital twin">×</button><span className="public-kicker">DIGITAL TWIN</span><h2>{selectedRobot.id}</h2><p>{selectedRobot.type} · {selectedRobot.state}</p><div className="metric-grid"><Metric label="Health" value={`${selectedRobot.health}%`} change="" detail="current" tone="positive" /><Metric label="Battery" value={`${selectedRobot.battery}%`} change="" detail="reserve" tone="positive" /><Metric label="Risk" value={selectedRobot.id === 'R-004' ? '93%' : '18%'} change="" detail="prediction" tone="warning" /></div>{migrationResult && <div className={`migration-result ${migrationResult.status === 'blocked' ? 'blocked' : ''}`}><strong>{migrationResult.status === 'blocked' ? 'MIGRATION BLOCKED' : 'TASK MIGRATION COMPLETE'}</strong><p>{migrationResult.status === 'blocked' ? migrationResult.reason : `Source: ${migrationResult.source_robot} · Destination: ${migrationResult.destination_robot} · Tasks: ${migrationResult.task_ids.join(', ')}`}</p></div>}<div className="profile-actions"><button className="primary-button" onClick={migrateSelected} disabled={migrationBusy || migrationResult?.status === 'completed'}>{migrationBusy ? 'Migrating...' : migrationResult?.status === 'completed' ? 'Migration complete' : 'Migrate current tasks'}</button><button className="outline-button" onClick={() => setSelectedRobot(null)}>Close</button></div></section></div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  )
}

function Metric({ label, value, change, detail, tone }) { return <div className="metric-card"><span className="metric-label">{label}</span><div className="metric-value">{value}</div><div className={`metric-change ${tone}`}>{change} <span>{detail}</span></div></div> }
function RiskRow({ label, value, progress, tone }) { return <div className="risk-row"><div><span>{label}</span><strong className={tone}>{value}</strong></div><div className="risk-progress"><span className={tone} style={{ width: `${progress}%` }} /></div></div> }
function Event({ time, title, detail, tone }) { return <div className="event-row"><span className={`event-marker ${tone}`} /><div><strong>{title}</strong><small>{detail}</small></div><time>{time}</time></div> }

function OperationsKpi({ label, value, detail, tone, icon, visual }) { return <article className={`operations-kpi ${tone}`}><div className="operations-kpi-icon" aria-hidden="true">{icon}</div><div className="operations-kpi-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div><div className={`operations-kpi-visual ${visual}`} aria-hidden="true"><i /><i /><i /><i /><i /></div></article> }

function IntelligencePanel({ tab, robots, onRobot, onTabChange, missionContinuity }) {
  const healthy = robots.filter((robot) => robot.state === 'Active' || robot.state === 'Reserve').length
  const critical = robots.filter((robot) => robot.state === 'Critical' || robot.state === 'Recovering').length
  const content = {
    Overview: <div className="operations-kpi-grid"><OperationsKpi label="Fleet health" value={`${Math.round(robots.reduce((sum, robot) => sum + robot.health, 0) / robots.length)}%`} detail="authoritative state" tone="blue" icon="♥" visual="wave" /><OperationsKpi label="Active robots" value={healthy} detail="operational" tone="teal" icon="▣" visual="bars" /><OperationsKpi label="Warning / critical" value={`${robots.filter((robot) => robot.state === 'Warning').length} / ${critical}`} detail="requires review" tone="rose" icon="!" visual="risk" /><OperationsKpi label="Mission continuity" value={`${missionContinuity}%`} detail="recovery-aware" tone="violet" icon="◎" visual="wave" /></div>,
    Failures: <div className="data-list">{robots.filter((robot) => robot.state === 'Critical' || robot.state === 'Recovering').map((robot) => <button key={robot.id} onClick={() => onRobot(robot)}><strong>{robot.id} · {robot.task}</strong><span className="critical">{robot.id === 'R-004' ? '93% risk' : 'elevated risk'}</span><small>Motor overheating · mission protection required</small></button>)}</div>,
    Recovery: <div className="data-list"><div><strong>Current phase</strong><span>Task migration</span><small>{critical} affected robots · recovery state active</small></div><div><strong>Recovery actions</strong><span>Predict · contain · migrate</span><small>Replacement capacity is evaluated by health, battery, workload, and risk.</small></div></div>,
    Missions: <div className="data-list">{['Harbor perimeter sweep', 'Emergency medical delivery', 'Thermal leak survey'].map((mission, index) => <button key={mission} onClick={() => onRobot(robots[index % robots.length])}><strong>{mission}</strong><span>{index === 0 ? 'Critical' : 'High'} · {78 + index * 7}%</span><small>{index + 1} active task groups · recovery protected</small></button>)}</div>,
  }
  return <section className="intelligence-panel panel"><div className="panel-heading"><div><span className="public-kicker">AI FLEET INTELLIGENCE</span><h2>Situation room</h2></div><span className="live-badge">MONITORING</span></div><div className="intelligence-tabs" role="tablist">{Object.keys(content).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => onTabChange(item)}>{item.toUpperCase()}</button>)}</div><div className="intelligence-content">{content[tab]}</div></section>
}

function LoginExperience({ navigate, onGoogleLogin, onEmailLogin, onDemoLogin, onAdminLogin, onCreateAccount, onResetPassword }) {
  const [mode, setMode] = useState('sign-in')
  const [adminMode, setAdminMode] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const submit = async (event) => { event.preventDefault(); setFeedback(''); setBusy(true); try { if (adminMode) { await onAdminLogin(adminUsername.trim(), adminPassword); return } if (mode === 'create') { if (password !== confirmPassword) throw new Error('Passwords do not match.'); await onCreateAccount(name, email.trim(), password); return } await onEmailLogin(email.trim(), password) } catch (error) { setFeedback(error.message || 'Authentication failed.'); setBusy(false) } }
  const reset = async () => { if (!email.trim()) { setFeedback('Enter your email first.'); return } setBusy(true); try { await onResetPassword(email.trim()); setFeedback('Reset link sent. Check your email.'); } catch (error) { setFeedback(error.message || 'Password reset is unavailable.'); } finally { setBusy(false) } }
  return <div className="login-screen integrated-login"><div className="login-atmosphere" aria-hidden="true"><span className="login-orbit orbit-one" /><span className="login-orbit orbit-two" /><span className="login-signal signal-one">10 ROBOTS</span><span className="login-signal signal-two">RECOVERY READY</span></div><div className="login-layout"><section className="login-visual"><button className="login-brand" onClick={() => navigate('/')} aria-label="Sentinel Robotics home"><span className="login-brand-mark">S</span><span><strong>SENTINEL</strong><em>ROBOTICS</em></span></button><div className="login-visual-copy"><span>FLEET RECOVERY AI</span><h1>Keep the mission moving.</h1><p>Intelligent fleet recovery under cascading failures.</p></div><div className="login-visual-board"><div className="login-board-grid" />{Array.from({ length: 10 }, (_, index) => <i key={index} style={{ left: `${12 + ((index * 19) % 76)}%`, top: `${18 + ((index * 31) % 64)}%` }} />)}<strong>LIVE FLEET<br />RECOVERY</strong></div><div className="login-visual-metrics"><span><b>10</b><small>ROBOTS</small></span><span><b>LIVE</b><small>MONITORING</small></span><span><b>READY</b><small>RECOVERY</small></span></div></section><section className="login-card integrated-login-card" aria-labelledby="login-heading"><span className="login-status"><i /> SYSTEM ONLINE</span><h1 id="login-heading">Welcome back</h1><p className="login-intro">Sign in to Fleet Command and monitor mission continuity.</p><div className="auth-mode-tabs"><button className={mode === 'sign-in' && !adminMode ? 'active' : ''} onClick={() => { setMode('sign-in'); setAdminMode(false) }}>SIGN IN</button><button className={mode === 'create' && !adminMode ? 'active' : ''} onClick={() => { setMode('create'); setAdminMode(false) }}>CREATE ACCOUNT</button><button className={adminMode ? 'active' : ''} onClick={() => setAdminMode(true)}>ADMIN LOGIN</button></div><form onSubmit={submit}>{adminMode ? <><label className="login-field"><span>Admin Username</span><input className="profile-input" value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} autoComplete="username" /></label><label className="login-field"><span>Admin Password</span><input className="profile-input" type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoComplete="current-password" /></label></> : <><label className="login-field"><span>{mode === 'create' ? 'Full Name' : 'Email / User ID'}</span>{mode === 'create' && <input className="profile-input" placeholder="Alex Rivera" value={name} onChange={(event) => setName(event.target.value)} />}</label><label className="login-field"><span>Email</span><input className="profile-input" type="email" placeholder="operator@example.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label className="login-field"><span>Password</span><input className="profile-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} /></label>{mode === 'create' && <label className="login-field"><span>Confirm Password</span><input className="profile-input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>}</>}<button className="admin-submit" type="submit" disabled={busy}>{busy ? 'Working...' : adminMode ? 'Admin Sign In' : mode === 'create' ? 'Create Account' : 'Sign In'} <span>↗</span></button></form>{!adminMode && mode === 'sign-in' && <><button className="google-button integrated-google" onClick={onGoogleLogin} disabled={busy}><span className="google-g">G</span>Continue with Google</button><button className="login-link-button" onClick={reset}>Forgot Password?</button></>}{feedback && <div className="login-feedback" role="alert">{feedback}</div>}<button className="demo-login" onClick={onDemoLogin} disabled={busy}>ENTER DEMO MODE <span>↗</span></button><button className="login-back" onClick={() => navigate('/')}>Back to Sentinel Robotics <span>↗</span></button></section></div></div>
}

function Login({ navigate, onGoogleLogin, onEmailLogin, onDemoLogin, onAdminLogin, onCreateAccount, onResetPassword }) {
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const googleLogin = async () => {
    setBusy(true)
    setFeedback('')
    try {
      await onGoogleLogin()
    } catch (error) {
      setFeedback(authErrorMessage(error))
      setBusy(false)
    }
  }

  const adminLogin = async (event) => { event.preventDefault(); if (!adminUsername.trim() || !adminPassword) { setFeedback('Enter your admin username and password.'); return } setBusy(true); setFeedback(''); try { await onAdminLogin(adminUsername.trim(), adminPassword) } catch (error) { setFeedback(error.message); setBusy(false) } }
  const emailLogin = async (event) => { event.preventDefault(); if (!email.trim() || !password) { setFeedback('Enter your email and password.'); return } setBusy(true); setFeedback(''); try { await onEmailLogin(email.trim(), password) } catch (error) { setFeedback(authErrorMessage(error)); setBusy(false) } }
  return <div className="login-screen"><div className="login-atmosphere" aria-hidden="true"><span className="login-orbit orbit-one" /><span className="login-orbit orbit-two" /><span className="login-signal signal-one">S / 027</span><span className="login-signal signal-two">98.2% LINK</span><span className="login-shape shape-one" /><span className="login-shape shape-two" /></div><div className="login-layout"><div className="login-robot" aria-hidden="true"><div className="robot-aura" /><div className="robot-antenna" /><div className="robot-head"><span className="robot-eye" /><span className="robot-eye" /></div><div className="robot-body"><span className="robot-badge">S</span><span className="robot-panel-line" /><span className="robot-panel-line short" /></div><div className="robot-arm arm-left" /><div className="robot-arm arm-right" /></div><section className="login-card" aria-labelledby="login-heading"><button className="login-brand" onClick={() => navigate('/')} aria-label="Sentinel Robotics home"><span className="login-brand-mark">S</span><span><strong>SENTINEL</strong><em>ROBOTICS</em></span></button><span className="login-status"><i /> SYSTEM ONLINE</span><h1 id="login-heading">Fleet Recovery Command Center</h1><p className="login-intro">Sign in to monitor failures, analyze cascades, migrate missions, and recover fleet performance.</p><div className="login-divider"><span>GOOGLE LOGIN</span></div><button className="google-button" onClick={googleLogin} disabled={busy}><span className="google-g" aria-hidden="true">G</span>{busy ? 'Signing in...' : 'Continue with Google'}</button><div className="login-divider"><span>EMAIL LOGIN</span></div><form onSubmit={emailLogin}><label className="login-field"><span>Email</span><input className="profile-input" type="email" placeholder="operator@example.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label className="login-field"><span>Password</span><input className="profile-input" type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label><button className="admin-submit" type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Email Login'} <span>↗</span></button></form><div className="login-divider admin-divider"><span>ADMIN LOGIN</span></div><form onSubmit={adminLogin}><label className="login-field"><span>Admin username</span><input className="profile-input" placeholder="Admin username" value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} autoComplete="username" /></label><label className="login-field"><span>Password</span><div className="password-wrap"><input className="profile-input" type={showPassword ? 'text' : 'password'} placeholder="Password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoComplete="current-password" /><button className="password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'Hide' : 'Show'}</button></div></label><button className="admin-submit" type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Admin Login'} <span>↗</span></button></form><button className="demo-login" onClick={onDemoLogin} disabled={busy}>Demo Simulation <span>↗</span></button>{feedback && <div className="login-feedback" role="alert">{feedback}</div>}<button className="login-back" onClick={() => navigate('/')}>Back to Sentinel Robotics <span>↗</span></button></section></div><p className="login-footnote">SENTINEL ROBOTICS · ROBOT FLEET RECOVERY UNDER CASCADING FAILURES</p></div>
}

function App() {
  const [path, setPath] = useState(() => canonicalPath(window.location.pathname))
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [demoMode, setDemoMode] = useState(false)
  const demoModeRef = useRef(false)
  const [authLoading, setAuthLoading] = useState(Boolean(auth))
  const [admin, setAdmin] = useState(() => { try { return JSON.parse(sessionStorage.getItem('adminSession') || 'null') } catch { return null } })

  useEffect(() => {
    const currentPath = canonicalPath(window.location.pathname)
    if (currentPath !== window.location.pathname) window.history.replaceState({}, '', currentPath)
    const onPopState = () => {
      const nextPath = canonicalPath(window.location.pathname)
      if (nextPath !== window.location.pathname) window.history.replaceState({}, '', nextPath)
      setPath(nextPath)
    }
    window.addEventListener('popstate', onPopState)
    let active = true
    completeGoogleRedirect().catch(() => null).then((redirectUser) => {
      if (active && redirectUser) {
        setUser(redirectUser)
        setProfile(redirectUser)
        setDemoMode(false)
        navigate('/')
      }
    })
    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        setProfile(firebaseUser)
        setDemoMode(false)
      } else if (!demoModeRef.current) { setUser(null); setProfile(null) }
      setAuthLoading(false)
    })
    return () => { active = false; window.removeEventListener('popstate', onPopState); unsubscribe() }
  }, [])

  const navigate = (nextPath) => {
    const destination = canonicalPath(nextPath)
    window.history.pushState({}, '', destination)
    setPath(destination)
  }

  const googleLogin = async () => {
    const authenticatedUser = await signInWithGoogle()
    if (!authenticatedUser) return
    setUser(authenticatedUser)
    setProfile(authenticatedUser)
    setDemoMode(false)
    demoModeRef.current = false
    navigate('/')
  }

  const emailLogin = async (email, password) => {
    const authenticatedUser = await signInWithEmail(email, password)
    setUser(authenticatedUser)
    setProfile(authenticatedUser)
    setDemoMode(false)
    demoModeRef.current = false
    navigate('/simulation')
  }

  const accountCreate = async (name, email, password) => {
    const authenticatedUser = await createAccount(name, email, password)
    setUser(authenticatedUser)
    setProfile(authenticatedUser)
    setDemoMode(false)
    demoModeRef.current = false
    navigate('/simulation')
  }

  const passwordReset = (email) => resetPassword(email)

  const startDemo = () => {
    const demoUser = { name: 'Alex Rivera', email: 'alex.rivera@sentinel.example', photoURL: '', provider: 'demo' }
    setUser(demoUser)
    setProfile(demoUser)
    setDemoMode(true)
    demoModeRef.current = true
    navigate('/simulation')
  }

  const adminLogin = async (username, password) => {
    let response
    try { response = await fetch(buildApiUrl('/auth/admin/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }) } catch { throw new Error('Unable to connect to the Sentinel server.') }
    if (!response.ok) throw new Error(response.status === 401 ? 'Invalid admin credentials.' : response.status === 403 ? 'Administrator access required.' : response.status >= 500 ? 'Admin authentication service is temporarily unavailable.' : 'Admin sign-in is unavailable.')
    const session = await response.json()
    sessionStorage.setItem('adminSession', JSON.stringify(session))
    setAdmin(session)
    navigate('/admin')
  }

  const adminLogout = () => { sessionStorage.removeItem('adminSession'); setAdmin(null); navigate('/') }

  const logout = async () => {
    try {
      await signOutUser()
    } finally {
      setUser(null)
      setProfile(null)
      setDemoMode(false)
      demoModeRef.current = false
      navigate('/')
    }
  }

  const robots = initialRobots
  const risk = 28
  const protectedUser = user || demoMode || admin
  const displayUser = profile || user || (admin ? { name: 'Administrator', role: admin.user?.username || admin.username } : null)
  if (authLoading) return <div className="auth-loading">Checking authentication...</div>
  if (path === '/login') return <LoginExperience navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} onAdminLogin={adminLogin} onCreateAccount={accountCreate} onResetPassword={passwordReset} />
  if (path === '/profile') return user ? <Profile user={profile || user} navigate={navigate} onLogout={logout} onProfileChange={setProfile} /> : admin ? <GenericPublicPage title="Administrator profile" navigate={navigate} user={{ name: 'Administrator', role: admin.user?.username || admin.username }} onLogout={adminLogout}><p>Administrator access is managed by the protected Sentinel server.</p></GenericPublicPage> : <Login navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} />
  if (path === '/admin') return admin ? <AdminManagementPage admin={admin} navigate={navigate} onLogout={adminLogout} /> : <Login navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} onAdminLogin={adminLogin} />
  if (path === '/simulation') return protectedUser ? <SimulationPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} /> : <Login navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} onAdminLogin={adminLogin} />
  if (path === '/fleet') return protectedUser ? <FleetPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} /> : <Login navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} onAdminLogin={adminLogin} />
  if (path === '/missions') return protectedUser ? <MissionsPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} /> : <Login navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} onAdminLogin={adminLogin} />
  if (path === '/recovery') return protectedUser ? <RecoveryPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} /> : <Login navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} onAdminLogin={adminLogin} />
  if (path === '/failure-analysis') return protectedUser ? <FailureAnalysisPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} /> : <Login navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} onAdminLogin={adminLogin} />
  if (path === '/digital-twin') return protectedUser ? <DigitalTwinPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} /> : <Login navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} onAdminLogin={adminLogin} />
  if (path === '/judge') return protectedUser ? <JudgeModePage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} /> : <Login navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} onAdminLogin={adminLogin} />
  if (path === '/alerts') return protectedUser ? <NotificationsPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} /> : <Login navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} onAdminLogin={adminLogin} />
  if (path === '/' && protectedUser) return <CommandCenterPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} />
  return <Landing robots={robots} risk={risk} navigate={navigate} startDemo={startDemo} user={profile} />
}

export default App
