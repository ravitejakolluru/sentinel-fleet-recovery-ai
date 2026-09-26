import { useEffect, useMemo, useState } from 'react'
import GoogleFleetMap from './GoogleFleetMap.jsx'
import useSimulationData from './hooks/useSimulationData.js'
import { injectTheme4Failure, getRecoveryCandidates, migrateTasks, resetTheme4, updateSimulationControl } from './services/simulation.js'
import { getSimulationDataSnapshot, subscribeSimulationData } from './services/simulation-state.js'
import { Shell } from './Pages.jsx'

function LiveMetric({ label, value, detail }) {
  return <div className="metric-card"><span className="metric-label">{label}</span><div className="metric-value">{value}</div><div className="metric-change">{detail}</div></div>
}

function StateMessage({ state, status }) {
  if (state) return null
  return <p role="status">{status === 'offline' ? 'Simulation backend is offline.' : 'Connecting to authoritative simulation…'}</p>
}

const fleetFilters = ['All', 'Active', 'Idle', 'Charging', 'Degraded', 'Failed', 'Recovering']

function matchesFleetFilter(robot, filter) {
  const status = String(robot.status || '').toLowerCase()
  if (filter === 'All') return true
  if (filter === 'Active') return ['healthy', 'active'].includes(status)
  if (filter === 'Degraded') return ['warning', 'critical'].includes(status)
  return status === filter.toLowerCase()
}

export function LiveFleetPage({ navigate, user, onLogout }) {
  const { state, status } = useSimulationData()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [message, setMessage] = useState('')
  const robots = state?.robots || []
  const tasks = state?.tasks || {}
  const filtered = useMemo(() => robots.filter((robot) => robot.id.includes(query.trim().toUpperCase()) && matchesFleetFilter(robot, filter)), [robots, query, filter])
  const failRobot = async (event, robot) => {
    event.stopPropagation()
    try {
      await injectTheme4Failure({ robot_id: robot.id, failure_type: 'motor', severity: 'failed', timing: 'immediate' })
      setMessage(`${robot.id} failure recorded in the backend simulation.`)
    } catch (error) {
      setMessage(error.message)
    }
  }
  return <Shell title="Robot Fleet" eyebrow="FLEET" navigate={navigate} user={user} onLogout={onLogout}>
    <StateMessage state={state} status={status} />
    <div className="metric-grid"><LiveMetric label="Total robots" value={state ? robots.length : '—'} detail="authoritative fleet" /><LiveMetric label="Active" value={robots.filter((robot) => ['healthy', 'active'].includes(robot.status)).length} detail="moving or assigned" /><LiveMetric label="Charging" value={robots.filter((robot) => robot.status === 'charging').length} detail="battery recovery" /><LiveMetric label="Failed" value={robots.filter((robot) => robot.status === 'failed').length} detail="stopped at failure position" /></div>
    <section className="panel page-panel summary-card-panel"><div className="panel-heading"><h2>Fleet roster</h2></div><div className="table-tools"><input className="profile-input" placeholder="Search robot ID" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="filter-button" value={filter} onChange={(event) => setFilter(event.target.value)}>{fleetFilters.map((item) => <option key={item}>{item}</option>)}</select></div>{message && <p role="status">{message}</p>}<div className="table-scroll"><table className="fleet-live-table"><thead><tr><th>Robot</th><th>Status</th><th>Health</th><th>Battery</th><th>Task / progress</th><th>Mission</th><th>Risk</th><th>Position</th><th>Action</th></tr></thead><tbody>{filtered.map((robot) => { const task = tasks[robot.current_task]; const prediction = state?.predictions?.find((item) => item.robot_id === robot.id); const healthValue = Math.max(0, Math.min(100, Number(robot.health) || 0)); const batteryValue = Math.max(0, Math.min(100, Number(robot.battery) || 0)); const statusTone = String(robot.status || '').toLowerCase(); return <tr key={robot.id} className={`fleet-row fleet-row--${statusTone}`} onClick={() => { sessionStorage.setItem('sentinel-selected-robot', robot.id); navigate('/digital-twin') }}><td className="fleet-identity"><strong>{robot.id}</strong><small>{robot.type}</small></td><td className="fleet-status-cell"><span className={`fleet-status-pill status-${statusTone}`}>{robot.status}</span></td><td className="fleet-metric-cell"><div className="fleet-meter"><span className="fleet-meter-fill health" style={{ width: `${healthValue}%` }} /></div><strong>{robot.health}%</strong></td><td className="fleet-metric-cell"><div className="fleet-meter battery"><span className="fleet-meter-fill battery" style={{ width: `${batteryValue}%` }} /></div><strong>{robot.battery}%</strong></td><td className="fleet-task-cell">{task ? <><strong>{task.id}</strong><small>{task.progress}%</small></> : 'Unassigned'}</td><td>{robot.mission_id || '—'}</td><td>{prediction ? `${prediction.probability}%` : '—'}</td><td>{robot.position ? `${robot.position.x}, ${robot.position.y}` : '—'}</td><td><button className="fleet-fail-button" onClick={(event) => failRobot(event, robot)} disabled={['failed', 'critical'].includes(robot.status)}>Fail</button></td></tr> })}</tbody></table>{state && !filtered.length && <p>No robots match this filter.</p>}</div></section>
  </Shell>
}

export function LiveMissionsPage({ navigate, user, onLogout }) {
  const { state, status } = useSimulationData()
  const missions = state?.missions || []
  const tasks = state?.tasks || {}
  return <Shell title="Missions" eyebrow="MISSION CONTINUITY" navigate={navigate} user={user} onLogout={onLogout}>
    <StateMessage state={state} status={status} />
    <div className="mission-chatboard">{missions.map((mission) => {
      const records = (mission.tasks || []).map((id) => tasks[id]).filter(Boolean)
      const atRisk = records.filter((task) => ['AT RISK', 'FAILED'].includes(task.status)).length
      const progress = records.length ? Math.round(records.reduce((total, task) => total + (task.progress || 0), 0) / records.length) : 0
      const continuity = mission.status === 'AT RISK' ? 'At risk' : mission.status === 'RECOVERING' ? 'Recovery in progress' : mission.status
      return <section className="mission-chat-panel" key={mission.id}>
        <header className="mission-chat-header">
          <div>
            <span className="mission-chip">{mission.id}</span>
            <h3>{mission.name}</h3>
          </div>
          <strong>{progress}%</strong>
        </header>
        <div className="mission-chat-meta">
          <span>{mission.priority} priority</span>
          <span>{continuity}</span>
        </div>
        <div className="mission-progress-track"><span style={{ width: `${progress}%` }} /></div>
        <div className="mission-summary-grid">
          <div><label>Tasks</label><strong>{records.length}</strong></div>
          <div><label>Affected</label><strong>{atRisk}</strong></div>
          <div><label>Continuity</label><strong>{continuity}</strong></div>
        </div>
        <div className="mission-task-feed">{records.map((task) => (
          <article key={task.id} className="mission-task-row">
            <div className="mission-task-head">
              <strong>{task.id}</strong>
              <span>{task.status}</span>
            </div>
            <p>{task.progress}% complete · {task.remaining_progress}% remaining</p>
            <small>{task.assigned_robot || 'Unassigned'} · {task.origin} → {task.destination}</small>
          </article>
        ))}</div>
      </section>
    })}{state && !missions.length && <p>No mission records in backend state.</p>}</div>
  </Shell>
}

export function LiveFailureAnalysisPage({ navigate, user, onLogout }) {
  const { state, status, evaluation } = useSimulationData()
  const failure = state?.failures?.at(-1)
  const prediction = failure && state?.predictions?.find((item) => item.robot_id === failure.robot_id)
  const task = failure?.task_id ? state?.tasks?.[failure.task_id] : null
  const mission = failure?.mission_id ? state?.missions?.find((item) => item.id === failure.mission_id) : null
  const propagation = state?.propagation || []
  const robot = failure && state?.robots?.find((item) => item.id === failure.robot_id)
  const riskLabel = prediction ? `${prediction.probability}% risk` : 'Not available'
  return <Shell title="Failure Analysis" eyebrow="PROPAGATION ANALYSIS" navigate={navigate} user={user} onLogout={onLogout}>
    <StateMessage state={state} status={status} />
    <section className="failure-hero">
      <div>
        <span className="failure-kicker">SIMULATION-BASED TELEMETRY RULES</span>
        <h2>{failure ? `${failure.robot_id} · ${failure.subsystem}` : 'No recorded failure'}</h2>
        <p>{failure ? `Stopped at ${failure.position?.x ?? '—'}, ${failure.position?.y ?? '—'} with ${failure.progress ?? 0}% task progress preserved.` : 'Failure analysis appears when a real simulation event is recorded.'}</p>
      </div>
      <div className="failure-live"><strong>{state ? `${state.robots.length} robots` : 'Loading'}</strong><small>{state?.failures?.length || 0} failures recorded</small></div>
    </section>

    <div className="failure-chatboard">
      <section className="failure-chat-panel">
        <div className="failure-chat-header">
          <span>FAILURE PREDICTION</span>
          <strong>{riskLabel}</strong>
        </div>
        <div className="failure-prop-grid">
          <div><label>Cause</label><strong>{prediction?.subsystem || 'No prediction record'}</strong></div>
          <div><label>Model</label><strong>{prediction?.model || 'Simulation-based telemetry rule'}</strong></div>
          <div><label>Prediction time</label><strong>{prediction?.predicted_at || '—'}</strong></div>
          <div><label>Lead time</label><strong>{prediction?.lead_time_seconds == null ? 'Not measured' : `${prediction.lead_time_seconds}s`}</strong></div>
          <div><label>Robot health / battery</label><strong>{robot ? `${robot.health}% / ${robot.battery}%` : '—'}</strong></div>
          <div><label>Telemetry evidence</label><strong>{prediction?.indicators ? JSON.stringify(prediction.indicators) : 'No evidence recorded'}</strong></div>
        </div>
      </section>

      <section className="failure-chat-panel">
        <div className="failure-chat-header">
          <span>PROPAGATION FROM LIVE ENTITIES</span>
          <strong>{propagation.length ? propagation.map((node) => node.id).filter(Boolean).join(' → ') : 'No active propagation'}</strong>
        </div>
        <div className="failure-prop-grid">
          <div><label>Affected task</label><strong>{task?.id || '—'} · {task?.status || '—'}</strong></div>
          <div><label>Affected mission</label><strong>{mission?.id || '—'} · {mission?.status || '—'}</strong></div>
          <div><label>Fleet impact</label><strong>{evaluation?.failed ?? '—'} failed · {evaluation?.available_capacity ?? '—'} available capacity</strong></div>
          <div><label>Recovery recommendation</label><strong>{task?.recovery_recommendation ? `${task.recovery_recommendation.robot_id} · ${task.recovery_recommendation.reason}` : 'Awaiting candidate evaluation'}</strong></div>
        </div>
      </section>
    </div>
  </Shell>
}

export function LiveRecoveryPage({ navigate, user, onLogout }) {
  const { state, status, evaluation } = useSimulationData()
  const [candidates, setCandidates] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [message, setMessage] = useState('')
  const failure = state?.failures?.at(-1)
  const sourceId = failure?.robot_id
  const task = failure?.task_id ? state?.tasks?.[failure.task_id] : null
  const migration = state?.migrations?.findLast((item) => item.source_robot === sourceId)
  useEffect(() => {
    let active = true
    if (!sourceId) { setCandidates([]); setSelectedId(''); return () => { active = false } }
    getRecoveryCandidates(sourceId).then((result) => {
      if (!active) return
      const nextCandidates = result.candidates || []
      setCandidates(nextCandidates)
      const preferred = nextCandidates.find((item) => item.eligible)?.robot_id || nextCandidates[0]?.robot_id || ''
      setSelectedId((current) => current && nextCandidates.some((item) => item.robot_id === current) ? current : preferred)
    }).catch((error) => { if (active) setMessage(error.message) })
    return () => { active = false }
  }, [sourceId])
  const migrate = async (automatic = false) => {
    if (!sourceId) return
    try {
      const result = await migrateTasks(sourceId, '', automatic ? '' : selectedId)
      setMessage(`${result.migration.task_ids.join(', ')} · ${result.migration.destination_robot} · ${result.migration.status}`)
    } catch (error) {
      setMessage(error.message)
    }
  }
  const eligibleCandidates = candidates.filter((item) => item.eligible)
  const routePoints = migration?.recovery_route?.map((point) => `${point.x},${point.y}`) || ['12,18', '28,20', '36,30', '72,38']
  return <Shell title="Recovery" eyebrow="RECOVERY OPERATIONS" navigate={navigate} user={user} onLogout={onLogout}>
    <StateMessage state={state} status={status} />
    <div className="metric-grid"><LiveMetric label="Failed robot" value={sourceId || 'None'} detail="failure source" /><LiveMetric label="Interrupted task" value={task?.id || '—'} detail={task ? `${task.progress}% preserved` : 'No task affected'} /><LiveMetric label="Remaining work" value={task ? `${task.remaining_progress}%` : '—'} detail={task?.status || 'No recovery active'} /><LiveMetric label="Recovery status" value={migration?.status || task?.status || 'Standby'} detail={evaluation?.available_capacity == null ? 'capacity unavailable' : `${evaluation.available_capacity} robots available`} /></div>
    <section className="recovery-route-panel">
      <div className="recovery-route-title">Recovery route</div>
      <div className="recovery-route-points">{routePoints.join(' → ')}</div>
      <div className="recovery-route-list">
        {eligibleCandidates.map((candidate) => (
          <label key={candidate.robot_id} className={`recovery-route-option ${selectedId === candidate.robot_id ? 'selected' : ''}`}>
            <input type="radio" name="recovery-candidate" checked={selectedId === candidate.robot_id} onChange={() => setSelectedId(candidate.robot_id)} />
            <span className="recovery-route-copy">
              <span className="recovery-route-robot">{candidate.robot_id}</span>
              <span className="recovery-route-score"> · score {Number(candidate.score).toFixed(1)}</span>
              <span className="recovery-route-meta"> map units to interruption; {candidate.battery}% battery; {candidate.health}% health; 0 active tasks; estimated {candidate.eta ?? candidate.estimated_seconds ?? '5.4'}s</span>
            </span>
          </label>
        ))}
        {!eligibleCandidates.length && <p className="recovery-route-empty">{sourceId ? 'No currently available replacement meets the safety thresholds.' : 'No active failure needs recovery.'}</p>}
      </div>
      <div className="recovery-route-actions">
        <button className="primary-button" onClick={() => migrate(true)} disabled={!sourceId || !eligibleCandidates.length}>Approve top candidate</button>
        <button className="outline-button" onClick={() => migrate(false)} disabled={!sourceId || !selectedId || !eligibleCandidates.some((candidate) => candidate.robot_id === selectedId)}>Approve selected candidate</button>
      </div>
      {message && <p role="status" className="recovery-route-status">{message}</p>}
    </section>
  </Shell>
}

export function LiveAlertsPage({ navigate, user, onLogout }) {
  const { state, status } = useSimulationData()
  const alerts = state?.notifications || []
  const events = state?.events || []
  const alertTone = (value) => {
    const normalized = String(value || '').toLowerCase()
    if (normalized.includes('critical') || normalized.includes('failed') || normalized.includes('high')) return 'critical'
    if (normalized.includes('warning') || normalized.includes('risk')) return 'warning'
    if (normalized.includes('recovery') || normalized.includes('migration')) return 'recovery'
    return 'info'
  }

  return <Shell title="Fleet Alerts" eyebrow="OPERATIONAL ALERTS" navigate={navigate} user={user} onLogout={onLogout}>
    <StateMessage state={state} status={status} />
    <div className="alert-section-grid">
      <section className="panel page-panel summary-card-panel">
        <div className="panel-heading"><h2>Fleet alerts</h2></div>
        {alerts.length ? (
          <div className="alert-card-grid">
            {alerts.map((alert, index) => {
              const tone = alertTone(alert.severity || alert.level || alert.type)
              return <article key={`${alert.timestamp}-${index}`} className={`alert-card alert-card--${tone}`}>
                <div className="alert-card-top">
                  <span className="alert-badge">{String(alert.severity || alert.level || alert.type || 'INFO').toUpperCase()}</span>
                  <time>{alert.timestamp || 'Live'}</time>
                </div>
                <strong>{alert.title || alert.type || 'Fleet update'}</strong>
                <p>{alert.message}</p>
                <small>{alert.robot || 'Fleet'} · {alert.task || alert.mission || 'System'}</small>
              </article>
            })}
          </div>
        ) : <p>No alerts recorded in the current simulation.</p>}
      </section>

      <section className="panel page-panel summary-card-panel">
        <div className="panel-heading"><h2>Recent event timeline</h2></div>
        {events.length ? (
          <div className="alert-card-grid">
            {events.slice(0, 30).map((event, index) => {
              const tone = alertTone(event.type)
              return <article key={`${event.timestamp}-${index}`} className={`alert-card alert-card--${tone}`}>
                <div className="alert-card-top">
                  <span className="alert-badge">{String(event.type || 'EVENT').toUpperCase()}</span>
                  <time>{event.timestamp || 'Live'}</time>
                </div>
                <strong>{event.type || 'Event'}</strong>
                <p>{event.message}</p>
                <small>{event.robot || 'Fleet'}</small>
              </article>
            })}
          </div>
        ) : <p>No events recorded.</p>}
      </section>
    </div>
  </Shell>
}

function waitForSimulationState(predicate, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {}
    const finish = (error, value) => {
      unsubscribe()
      window.clearTimeout(timeout)
      if (error) reject(error)
      else resolve(value)
    }
    const check = () => {
      const snapshot = getSimulationDataSnapshot()
      if (predicate(snapshot)) finish(null, snapshot)
    }
    const timeout = window.setTimeout(() => finish(new Error('Timed out waiting for the live backend simulation update.')), timeoutMs)
    unsubscribe = subscribeSimulationData(check)
    check()
  })
}

export function LiveJudgePage({ navigate, user, onLogout }) {
  const { state, status, evaluation } = useSimulationData()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Live evidence is read from the authoritative backend simulation.')
  const [candidates, setCandidates] = useState([])
  const failure = state?.failures?.at(-1)
  const sourceId = failure?.robot_id
  const task = failure?.task_id ? state?.tasks?.[failure.task_id] : null
  const migration = state?.migrations?.findLast((item) => item.source_robot === sourceId)
  useEffect(() => {
    let active = true
    if (!sourceId) { setCandidates([]); return () => { active = false } }
    getRecoveryCandidates(sourceId).then((result) => { if (active) setCandidates(result.candidates || []) }).catch((error) => { if (active) setMessage(error.message) })
    return () => { active = false }
  }, [sourceId])

  const runScenario = async () => {
    setBusy(true)
    try {
      await resetTheme4()
      await updateSimulationControl({ running: true, speed: 1 })
      const started = getSimulationDataSnapshot().state
      const activeRobot = started?.robots?.find((robot) => robot.current_task && robot.status === 'healthy')
      if (!activeRobot) throw new Error('No assigned healthy robot is available for the judge scenario.')
      const taskId = activeRobot.current_task
      setMessage(`Simulation running. Waiting for ${taskId} to advance from the backend route...`)
      await waitForSimulationState((snapshot) => (snapshot.state?.tasks?.[taskId]?.progress || 0) > 0)
      setMessage(`Injecting a progressive motor failure on ${activeRobot.id} at its live task progress...`)
      await injectTheme4Failure({ robot_id: activeRobot.id, failure_type: 'motor', severity: 'critical', timing: 'progressive' })
      const ranked = await getRecoveryCandidates(activeRobot.id)
      const recommended = ranked.candidates?.find((candidate) => candidate.eligible)
      if (!recommended) throw new Error('The backend found no eligible recovery candidate for this interruption.')
      setCandidates(ranked.candidates)
      setMessage(`Approving the top live candidate ${recommended.robot_id}; recovery will continue over the backend route.`)
      const result = await migrateTasks(activeRobot.id)
      setMessage(`${result.migration.destination_robot} is traveling to the interruption point; ${result.migration.progress_before_failure}% progress is preserved.`)
    } catch (error) {
      setMessage(`Judge scenario stopped: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  return <Shell title="Judge Mode" eyebrow="HACKFUSION 2026 · THEME 4" navigate={navigate} user={user} onLogout={onLogout}>
    <section className="judge-demo-bar panel"><div><span className="failure-kicker">LIVE BACKEND SCENARIO</span><strong>Prediction → failure → propagation → recovery</strong><p role="status">{message}</p></div><button className="primary-button" onClick={runScenario} disabled={busy}>{busy ? 'Running scenario…' : 'RESET AND RUN JUDGE SCENARIO'}</button></section>
    <div className="metric-grid"><LiveMetric label="Active fleet" value={state ? state.robots.length : '—'} detail="backend robot records" /><LiveMetric label="Task completion" value={evaluation ? `${evaluation.mission_completion_rate}%` : '—'} detail="average task progress" /><LiveMetric label="Mission continuity" value={evaluation ? `${evaluation.mission_preservation}%` : '—'} detail="tasks with continuity" /><LiveMetric label="Recovery status" value={migration?.status || 'No migration'} detail="backend migration state" /></div>
    <div className="judge-sections"><section className="judge-section panel summary-card-panel"><span className="failure-kicker">FAILURE AND PREDICTION</span><h2>{failure ? `${failure.robot_id} · ${failure.subsystem}` : 'No failure recorded'}</h2><div className="data-list"><div><strong>Risk / confidence</strong><span>{failure ? `${failure.risk}% / ${Math.round((state.predictions.find((item) => item.robot_id === failure.robot_id)?.confidence || 0) * 100)}%` : '—'}</span></div><div><strong>Interrupted task</strong><span>{task ? `${task.id} · ${task.progress}% complete` : '—'}</span></div><div><strong>Task state</strong><span>{task?.status || '—'} · {task?.remaining_progress ?? '—'}% remaining</span></div><div><strong>Mission</strong><span>{task?.mission_id || '—'}</span></div></div></section><section className="judge-section panel summary-card-panel"><span className="failure-kicker">LIVE PROPAGATION</span><h2>{state?.propagation?.length ? state.propagation.map((node) => node.id).filter(Boolean).join(' → ') : 'Awaiting a failure event'}</h2><div className="data-list"><div><strong>Replacement</strong><span>{migration?.destination_robot || task?.recovery_recommendation?.robot_id || 'No recommendation yet'}</span></div><div><strong>Recovery route state</strong><span>{state?.robots?.find((robot) => robot.id === migration?.destination_robot)?.recovery_state || '—'}</span></div><div><strong>Interruption point</strong><span>{task?.interruption_point ? `${task.interruption_point.x}, ${task.interruption_point.y}` : '—'}</span></div><div><strong>Recovery progress</strong><span>{task ? `${task.progress}% · ${task.status}` : '—'}</span></div></div></section><section className="judge-section panel summary-card-panel"><span className="failure-kicker">CANDIDATES RANKED FROM LIVE STATE</span><h2>Recovery recommendation</h2>{candidates.filter((candidate) => candidate.eligible).map((candidate) => <article className="live-candidate" key={candidate.robot_id}><span><strong>{candidate.robot_id} · score {candidate.score}</strong><small>{candidate.reason}</small></span></article>)}{!candidates.some((candidate) => candidate.eligible) && <p>{sourceId ? 'No available replacement candidate.' : 'A ranked candidate will appear after failure injection.'}</p>}</section><section className="judge-section panel"><span className="failure-kicker">EVENT TIMELINE</span><h2>Authoritative events</h2><div className="live-task-list">{(state?.events || []).slice(0, 12).map((event, index) => <article key={`${event.timestamp}-${index}`}><strong>{event.type}</strong><span>{event.message}</span><small>{event.timestamp}</small></article>)}</div></section></div>
    <p className="physical-robot-status">PHYSICAL ROBOT · NO PHYSICAL ROBOT CONNECTED · SIMULATION ONLY · {status.toUpperCase()}</p>
  </Shell>
}