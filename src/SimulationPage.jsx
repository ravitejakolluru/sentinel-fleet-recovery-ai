import { useState } from 'react'
import GoogleFleetMap from './GoogleFleetMap.jsx'
import { Shell } from './Pages.jsx'
import useSimulationData from './hooks/useSimulationData.js'
import { assignTask, injectTheme4Failure, migrateTasks, resetTheme4, updateSimulationControl } from './services/simulation.js'

const robotStatusLabels = {
  healthy: 'ACTIVE',
  warning: 'DEGRADED',
  critical: 'CRITICAL',
  failed: 'FAILED',
  recovering: 'RECOVERING',
  active: 'ACTIVE',
  reserve: 'CHARGING',
  charging: 'CHARGING',
  idle: 'IDLE',
}

function formatRobotCounts(fleet) {
  const summaries = { active: 0, degraded: 0, charging: 0, recovering: 0, idle: 0 }
  fleet.forEach((robot) => {
    const status = String(robot.status || 'healthy').toLowerCase()
    if (status === 'healthy' || status === 'active') summaries.active += 1
    else if (status === 'warning') summaries.degraded += 1
    else if (status === 'reserve' || status === 'charging') summaries.charging += 1
    else if (status === 'recovering') summaries.recovering += 1
    else if (status === 'idle') summaries.idle += 1
  })
  return summaries
}

export default function SimulationPage({ navigate, user, onLogout }) {
  const { state, status: connectionStatus } = useSimulationData()
  const [selectedId, setSelectedId] = useState('R-003')
  const [followId, setFollowId] = useState('')
  const [streetViewOpen, setStreetViewOpen] = useState(true)
  const [failureModalOpen, setFailureModalOpen] = useState(false)
  const [failureType, setFailureType] = useState('navigation')
  const [message, setMessage] = useState('Simulation synchronized to the authoritative fleet state.')

  const fleet = state?.robots || []

  const selectedRobot = fleet.find((robot) => robot.id === selectedId) || fleet.find((robot) => robot.id === 'R-003') || fleet[0]
  const selectedTask = selectedRobot?.current_task ? state?.tasks?.[selectedRobot.current_task] : null
  const selectedProgress = Math.round(selectedTask?.progress || 0)
  const selectedEta = selectedTask?.estimated_completion == null ? 'Not available' : `${selectedTask.estimated_completion}s`
  const counts = formatRobotCounts(fleet)
  const statusText = `${fleet.length} ROBOTS · ${counts.active} ACTIVE · ${counts.degraded} DEGRADED · ${counts.charging} CHARGING · ${counts.recovering} RECOVERING · ${counts.idle} IDLE`
  const simulationRunning = Boolean(state?.control?.running)
  const recoveryActionEligible = ['critical', 'failed', 'charging', 'recovering'].includes(String(selectedRobot?.status || '').toLowerCase())

  const controlSimulation = async (payload) => {
    try {
      await updateSimulationControl(payload)
      setMessage(payload.running === false ? 'Simulation paused.' : payload.running === true ? 'Simulation running.' : 'Simulation speed updated.')
    } catch (error) {
      setMessage(error.message || 'Unable to update control state.')
    }
  }

  const resetSimulation = async () => {
    try {
      await resetTheme4()
      setFollowId('')
      setSelectedId('R-003')
      setMessage('Simulation reset to the stable 25-robot baseline.')
    } catch (error) {
      setMessage(error.message || 'Unable to reset simulation.')
    }
  }

  const injectFailure = async (selectedFailureType = failureType) => {
    try {
      const robotId = selectedRobot?.id || 'R-003'
      await injectTheme4Failure({
        robot_id: robotId,
        failure_type: selectedFailureType,
        severity: 'failed',
        timing: 'progressive',
      })
      setFailureModalOpen(false)
      setMessage(`Route deviation injected for ${robotId}. Recovery analysis is active.`)
    } catch (error) {
      setMessage(error.message || 'Failure injection failed.')
    }
  }

  const openFailureModal = () => setFailureModalOpen(true)

  const assignSelectedTask = async () => {
    if (!selectedRobot) return
    try {
      const taskId = `T-${Date.now()}`
      await assignTask(selectedRobot.id, { task_id: taskId, mission_id: 'M-001', origin: 'DEPOT', pickup: 'PICKUP 01', destination: 'DROP POINT 01' })
      setMessage(`${taskId} assigned to ${selectedRobot.id} on the named facility route.`)
    } catch (error) {
      setMessage(error.message || 'Task assignment failed.')
    }
  }

  const migrateSelectedTask = async () => {
    if (!selectedRobot) return
    try {
      const result = await migrateTasks(selectedRobot.id)
      setMessage(`${result.migration.task_ids.join(', ')} recommended replacement ${result.migration.destination_robot}; recovery is in progress.`)
    } catch (error) {
      setMessage(error.message || 'Task migration failed.')
    }
  }

  const autoRecoverSelectedTask = async () => {
    if (!selectedRobot) return
    try {
      const result = await migrateTasks(selectedRobot.id)
      setMessage(`Automatic recovery assigned ${result.migration.destination_robot} to ${result.migration.task_ids.join(', ')}.`)
    } catch (error) {
      setMessage(error.message || 'Automatic recovery was blocked.')
    }
  }

  const handleStreetView = () => {
    setStreetViewOpen((value) => !value)
    setMessage(streetViewOpen ? 'Street View closed.' : 'Street View panel opened for the selected robot.')
  }

  const robotList = fleet.map((robot) => ({
    ...robot,
    label: robotStatusLabels[String(robot.status || 'healthy').toLowerCase()] || 'ACTIVE',
    batteryTone: (robot.battery || 0) < 20 ? 'critical' : (robot.battery || 0) < 50 ? 'warning' : 'healthy',
  }))

  const streetViewMessage = selectedRobot
    ? 'Street View unavailable at this location.'
    : 'Select a robot to inspect local Street View context.'

  if (!state) return <Shell title="Live Fleet Simulation" eyebrow="SIMULATION" navigate={navigate} user={user} onLogout={onLogout}><p role="status">{connectionStatus === 'offline' ? 'Simulation backend is offline.' : 'Connecting to authoritative simulation…'}</p></Shell>
  if (!selectedRobot) return <Shell title="Live Fleet Simulation" eyebrow="SIMULATION" navigate={navigate} user={user} onLogout={onLogout}><p role="status">The backend has no active robot records.</p></Shell>

  return (
    <Shell title="Live Fleet Simulation" eyebrow="SIMULATION" navigate={navigate} user={user} onLogout={onLogout} className="simulation-shell">
      <div className="simulation-workspace">
      <div className="simulation-inner">
        <header className="simulation-context" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ background: simulationRunning ? '#dff7ea' : '#eef2f7', color: simulationRunning ? '#0d6b46' : '#53677d', borderRadius: 999, padding: '8px 12px', fontWeight: 700, fontSize: 12 }}>● SIMULATION {simulationRunning ? 'RUNNING' : 'PAUSED'}</span>
          <span className="physical-robot-status">PHYSICAL ROBOT · NO PHYSICAL ROBOT CONNECTED</span>
          </div>
        </header>

        <section className="simulation-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
          {[{ label: 'ROBOTS', value: fleet.length }, { label: 'ACTIVE', value: counts.active }, { label: 'DEGRADED', value: counts.degraded }, { label: 'CHARGING', value: counts.charging }, { label: 'RECOVERING', value: counts.recovering }].map((item) => (
            <div key={item.label} style={{ background: '#ffffff', border: '1px solid #dfe8f3', borderRadius: 16, padding: '16px 18px', boxShadow: '0 12px 30px rgba(17, 24, 39, 0.04)' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', fontWeight: 700, color: '#5d728d', textTransform: 'uppercase' }}>{item.label}</div>
              <div style={{ marginTop: 8, fontSize: 26, fontWeight: 800 }}>{item.value}</div>
            </div>
          ))}
        </section>

        <div className="simulation-map-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.75fr) minmax(340px, 0.7fr)', gap: 18 }}>
          <div className="simulation-map-panel" style={{ background: '#ffffff', border: '1px solid #dfe8f3', borderRadius: 18, overflow: 'hidden', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)' }}>
            <div style={{ padding: 16, borderBottom: '1px solid #edf2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, letterSpacing: '0.14em', fontWeight: 700, color: '#5d728d', textTransform: 'uppercase' }}>Map</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Fleet operations map</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => controlSimulation({ running: !simulationRunning })} style={buttonStyle(simulationRunning ? 'secondary' : 'primary')}>{simulationRunning ? 'Pause' : state.control?.simulation_seconds ? 'Resume' : 'Start Simulation'}</button>
                <button onClick={resetSimulation} style={buttonStyle('ghost')}>Reset</button>
              </div>
            </div>

              <GoogleFleetMap
              robots={robotList}
              selectedRobot={selectedRobot}
              onSelect={(robot) => setSelectedId(robot.id)}
              followId={followId}
              onStreetView={handleStreetView}
              onMessage={setMessage}
            />

            <div style={{ padding: 16, borderTop: '1px solid #edf2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {followId ? <button onClick={() => setFollowId('')} style={buttonStyle('ghost')}>Stop Following</button> : <button onClick={() => setFollowId(selectedRobot?.id || 'R-003')} style={buttonStyle('secondary')}>Follow Robot</button>}
                <button onClick={openFailureModal} style={buttonStyle('warning')}>Inject Failure</button>
                <button onClick={handleStreetView} style={buttonStyle('secondary')}>Street View</button>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#3c5065', letterSpacing: '0.08em' }}>{message}</div>
            </div>
            <div className="simulation-fleet-strip" aria-label="Fleet strip">
              {robotList.map((robot) => <button key={robot.id} onClick={() => setSelectedId(robot.id)} className={robot.id === selectedRobot.id ? 'selected' : ''}><strong>{robot.id}</strong><span className={robot.batteryTone}>{robot.status === 'healthy' ? '●' : robot.status === 'recovering' ? '↻' : robot.status === 'charging' ? '⚡' : '⚠'} {Math.round(robot.battery || 0)}%</span></button>)}
            </div>
          </div>

          <aside className="simulation-side-column" style={{ display: 'grid', gap: 18 }}>
            <div className="simulation-fleet-status" style={{ background: '#ffffff', border: '1px solid #dfe8f3', borderRadius: 18, padding: 18, boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#5d728d', textTransform: 'uppercase' }}>Fleet Status</div>
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                {robotList.map((robot) => (
                  <button
                    key={robot.id}
                    onClick={() => setSelectedId(robot.id)}
                    style={{
                      width: '100%',
                      border: robot.id === selectedRobot.id ? '2px solid #1d4ed8' : '1px solid #e4edf8',
                      background: robot.id === selectedRobot.id ? '#eef4ff' : '#f9fbff',
                      borderRadius: 12,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800 }}>{robot.id}</div>
                      <div style={{ fontSize: 12, color: '#53677d' }}>{robot.label}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: '#1f2d3d' }}>{Math.round(robot.health || 0)}%</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="simulation-selected-panel" style={{ background: '#ffffff', border: '1px solid #dfe8f3', borderRadius: 18, padding: 18, boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#5d728d', textTransform: 'uppercase' }}>Robot Details</div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{selectedRobot.id}</div>
                <div style={{ fontSize: 14, color: '#53677d', marginBottom: 10 }}>{robotStatusLabels[String(selectedRobot.status || 'healthy').toLowerCase()] || 'ACTIVE'} • Mission {selectedRobot.mission_id || 'No active mission'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  {[
                    ['Status', robotStatusLabels[String(selectedRobot.status || 'healthy').toLowerCase()] || 'ACTIVE'],
                    ['Health', `${Math.round(selectedRobot.health || 0)}%`],
                    ['Battery', `${Math.round(selectedRobot.battery || 0)}%`],
                    ['Task', selectedRobot.task_id || 'No active task'],
                    ['Progress', `${selectedProgress}%`],
                    ['Speed', `${selectedRobot.speed || 0} m/s`],
                    ['ETA', selectedEta],
                    ['Position', selectedRobot.position ? `${selectedRobot.position.x}, ${selectedRobot.position.y}` : 'Not reported'],
                    ['Destination', selectedRobot.destination || 'No active destination'],
                    ['Route', (selectedRobot.route || []).join(' → ') || 'No active route'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ background: '#f8fbff', border: '1px solid #ebf1f6', borderRadius: 12, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d728d' }}>{label}</div>
                      <div style={{ fontWeight: 700, marginTop: 4 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                  <button onClick={() => setFollowId(followId ? '' : selectedRobot.id)} style={buttonStyle('secondary')}>{followId ? 'Stop Following' : 'Follow Robot'}</button>
                  <button onClick={assignSelectedTask} style={buttonStyle('ghost')}>Assign Task</button>
                  <button onClick={openFailureModal} style={buttonStyle('warning')}>Fail Robot</button>
                  {recoveryActionEligible && <><button onClick={migrateSelectedTask} style={buttonStyle('secondary')}>Manual Recovery</button><button onClick={autoRecoverSelectedTask} style={buttonStyle('primary')}>Auto Recovery</button></>}
                </div>
                {recoveryActionEligible && <div style={{ marginTop: 14, padding: 12, border: '1px solid #fecaca', borderRadius: 10, background: '#fff7f7', color: '#7f1d1d', fontSize: 12, fontWeight: 800 }}>
                  <div>FAILURE PROPAGATION</div>
                  <div style={{ marginTop: 8, color: '#b91c1c' }}>⚠ ROUTE DEVIATION DETECTED · TASK AT RISK</div>
                  <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
                    {(state?.propagation || []).map((node) => <span key={`${node.type}-${node.id}`}>{node.type.toUpperCase()} · {node.id} · {node.status}</span>)}
                  </div>
                </div>}
              </div>
            </div>

            <div className="simulation-street-view" style={{ background: '#ffffff', border: '1px solid #dfe8f3', borderRadius: 18, padding: 18, boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#5d728d', textTransform: 'uppercase' }}>Street View</div>
              <div style={{ marginTop: 12, padding: '18px 14px', background: '#f3f8ff', borderRadius: 12, minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#47627a', fontWeight: 600 }}>
                {streetViewOpen ? streetViewMessage : 'Street View unavailable at this location.'}
              </div>
            </div>
          </aside>
        </div>

        <div className="simulation-lower-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(300px, 0.6fr)', gap: 18, marginTop: 18 }}>
          <div className="simulation-timeline" style={{ background: '#ffffff', border: '1px solid #dfe8f3', borderRadius: 18, padding: 18, boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#5d728d', textTransform: 'uppercase' }}>Simulation Timeline</div>
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {(state?.events || []).slice(0, 6).map((event, index) => (
                <div key={`${event.type}-${event.timestamp || index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', borderBottom: index < 5 ? '1px solid #edf2f7' : 'none' }}>
                  <div style={{ minWidth: 72, color: '#4b6077', fontWeight: 700, fontSize: 12 }}>{event.timestamp || `00:${String(index).padStart(2, '0')}`}</div>
                  <div style={{ flex: 1, fontWeight: 700 }}>{event.message || event.type}</div>
                  <div style={{ color: '#2d6cdf', fontWeight: 700, fontSize: 12 }}>{event.type || 'STATUS'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="simulation-control-bar" style={{ background: '#ffffff', border: '1px solid #dfe8f3', borderRadius: 18, padding: 18, boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#5d728d', textTransform: 'uppercase' }}>Control Bar</div>
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {!simulationRunning && <button onClick={() => controlSimulation({ running: true })} style={buttonStyle('primary')}>{state.control?.simulation_seconds ? 'RESUME' : 'START SIMULATION'}</button>}
              {simulationRunning && <button onClick={() => controlSimulation({ running: false })} style={buttonStyle('secondary')}>PAUSE</button>}
              <button onClick={resetSimulation} style={buttonStyle('ghost')}>RESET</button>
              <button onClick={injectFailure} style={buttonStyle('warning')}>FAILURE INJECTION</button>
              <button onClick={handleStreetView} style={buttonStyle('secondary')}>STREET VIEW</button>
            </div>
            <div style={{ marginTop: 18, background: '#f8fbff', border: '1px solid #ebf1f6', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#597089', marginBottom: 8 }}>Simulation state</div>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{statusText}</div>
            </div>
          </div>
        </div>
      </div>
      </div>
      {failureModalOpen && <div className="modal-backdrop" onClick={() => setFailureModalOpen(false)}><section className="digital-twin panel failure-modal" onClick={(event) => event.stopPropagation()}><span className="public-kicker">FAIL ROBOT</span><h2>{selectedRobot.id}</h2><p>Current task: {selectedRobot.task_id || 'No active task'} · Progress: {selectedProgress}% · Battery: {Math.round(selectedRobot.battery || 0)}%</p><label className="failure-modal-field"><span>Failure type</span><select value={failureType} onChange={(event) => setFailureType(event.target.value)}><option value="navigation">Navigation failure</option><option value="motor">Motor failure</option><option value="communication">Communication loss</option><option value="sensor">Sensor failure</option><option value="battery">Battery failure</option></select></label><div className="profile-actions"><button className="primary-button" onClick={() => injectFailure()} disabled={selectedRobot.status === 'critical' || selectedRobot.status === 'failed'}>Confirm failure</button><button className="outline-button" onClick={() => setFailureModalOpen(false)}>Cancel</button></div></section></div>}
    </Shell>
  )
}

function buttonStyle(type) {
  const variants = {
    primary: { background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8' },
    secondary: { background: '#eef4ff', color: '#1f2d3d', border: '1px solid #d6e4ff' },
    warning: { background: '#ffedd5', color: '#9a4f00', border: '1px solid #fdba74' },
    ghost: { background: '#fff', color: '#1f2d3d', border: '1px solid #dfe8f3' },
  }
  return {
    borderRadius: 10,
    padding: '10px 14px',
    fontWeight: 700,
    cursor: 'pointer',
    ...variants[type || 'secondary'],
  }
}
