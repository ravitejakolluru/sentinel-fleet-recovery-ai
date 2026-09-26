import { useEffect, useState } from 'react'
import { getSimulationState, getTheme4Evaluation } from './services/simulation.js'

const capabilities = [
  ['01', 'Robot health & prediction', 'Telemetry-backed health signals expose risk before mission capacity is lost.', 'pulse'],
  ['02', 'Failure propagation analysis', 'Trace robot, task, mission, and resource dependencies through the cascade.', 'graph'],
  ['03', 'Dynamic task migration', 'Move only affected work to a compatible robot with available capacity.', 'route'],
  ['04', 'Fleet rebalancing', 'Spread recovery load while preserving battery and reserve capacity.', 'balance'],
  ['05', 'Mission criticality engine', 'Prioritize deadline, dependency, value, and resource constraints.', 'priority'],
  ['06', 'Recovery command center', 'Operate the full detect-to-measure loop from one live simulation surface.', 'command'],
]

const workflow = ['Detect', 'Predict', 'Propagate', 'Prioritize', 'Migrate', 'Rebalance', 'Recover', 'Measure']

function value(value, suffix = '') {
  return value === null || value === undefined ? 'Awaiting simulation' : `${value}${suffix}`
}

export default function LandingRedesign({ navigate, startDemo, user }) {
  const [state, setState] = useState(null)
  const [evaluation, setEvaluation] = useState(null)
  const [activeStage, setActiveStage] = useState(0)

  useEffect(() => {
    getSimulationState().then(setState).catch(() => null)
    getTheme4Evaluation().then(setEvaluation).catch(() => null)
    const timer = window.setInterval(() => setActiveStage((stage) => (stage + 1) % workflow.length), 2400)
    return () => window.clearInterval(timer)
  }, [])

  const metrics = evaluation?.evaluation
  const robots = state?.robots || []
  const active = metrics?.active ?? robots.filter((robot) => ['healthy', 'warning', 'recovering'].includes(String(robot.status).toLowerCase())).length
  const failures = state?.failures?.length
  const migrated = metrics?.tasks_migrated
  const riskRobot = robots.find((robot) => robot.id === 'R-004')
  const watchRecoveryDemo = () => { if (!user) startDemo(); navigate('/judge') }

  return <div className="theme4-public">
    <header className="theme4-public-nav"><button className="theme4-brand" onClick={() => navigate('/')}><span className="theme4-brand-mark">S</span><span><strong>SENTINEL ROBOTICS</strong><small>HACKFUSION 2026 · THEME 4</small></span></button><nav><a href="#problem">Problem</a><a href="#architecture">Architecture</a><a href="#preview">Simulation</a><a href="#evaluation">Evaluation</a></nav><div className="theme4-nav-actions">{user ? <button className="theme4-user" onClick={() => navigate('/profile')}>{user.name}</button> : <button className="theme4-text-button" onClick={() => navigate('/')}>Public site</button>}<button className="theme4-button small" onClick={() => navigate('/simulation')}>Enter simulation <span>↗</span></button></div></header>

    <main>
      <section className="theme4-hero"><div className="theme4-hero-copy"><span className="theme4-eyebrow">SENTINEL FLEET RECOVERY AI · ROBOT FLEET RECOVERY UNDER CASCADING FAILURES</span><h1>Recover the fleet.<br /><em>Preserve the mission.</em></h1><p className="theme4-hero-lede">AI-powered robot fleet recovery under cascading failures.</p><p>Predict failures, trace cascading impact, migrate critical tasks, rebalance available robots, and preserve mission performance under degraded fleet capacity.</p><div className="theme4-hero-actions"><button className="theme4-button" onClick={() => navigate('/simulation')}>LIVE FLEET SIMULATION <span>↗</span></button><button className="theme4-outline-button" onClick={watchRecoveryDemo}>WATCH RECOVERY DEMO <span>↗</span></button></div><small className="theme4-sim-label">LIVE SIMULATION · {robots.length || 25} ROBOTS</small></div><FleetPreview robots={robots} /></section>

      <section className="theme4-section theme4-problem" id="problem"><div className="theme4-section-label">01 / THE THEME 4 PROBLEM</div><div className="theme4-two-column"><div><h2>One failed robot can become a mission-level event.</h2><p>A failure affects dependent tasks, neighboring communication links, battery availability, and mission capacity. Sentinel makes the chain visible and gives operators a measurable recovery path.</p></div><div className="theme4-cascade"><CascadeNode label="FAILED ROBOT" detail="telemetry failure" tone="danger" /><span>↓</span><CascadeNode label="AFFECTED TASK" detail="progress preserved" tone="warning" /><span>↓</span><CascadeNode label="MISSION" detail="continuity assessed" tone="warning" /><span>↓</span><CascadeNode label="RANKED CANDIDATE" detail="live state selection" tone="good" /><span>↓</span><CascadeNode label="RECOVERY" detail="backend verified" tone="good" /></div></div></section>

      <section className="theme4-section theme4-architecture" id="architecture"><div className="theme4-section-label">02 / RECOVERY ARCHITECTURE</div><div className="theme4-two-column architecture-layout"><div><h2>From robot telemetry to mission recovery.</h2><p>One technical chain connects health signals, dependency analysis, criticality, resource-aware migration, and measurable performance.</p></div><div className="architecture-stack">{['Robot fleet', 'Telemetry', 'Health & failure prediction', 'Propagation graph', 'Mission criticality', 'Recovery engine', 'Task migration', 'Fleet rebalancing', 'Mission performance'].map((layer, index) => <div key={layer} className={index === 5 ? 'architecture-layer active' : 'architecture-layer'}><span>{String(index + 1).padStart(2, '0')}</span><strong>{layer}</strong>{index < 8 && <i>↓</i>}</div>)}</div></div></section>

      <section className="theme4-section theme4-preview-section" id="preview"><div className="theme4-section-label">03 / LIVE SIMULATION PREVIEW</div><div className="theme4-section-heading"><div><h2>Watch the fleet state change.</h2><p>Values below are read from the authoritative simulation when available.</p></div><button className="theme4-outline-button" onClick={() => navigate('/simulation')}>Open recovery command center <span>↗</span></button></div><div className="theme4-metric-grid"><PreviewMetric label="Average battery" value={metrics ? `${Math.round(metrics.average_battery)}% reserve` : 'Awaiting simulation'} tone="blue" /><PreviewMetric label="Active robots" value={value(active)} tone="cyan" /><PreviewMetric label="Active failures" value={value(failures)} tone="red" /><PreviewMetric label="Tasks migrated" value={value(migrated)} tone="green" /><PreviewMetric label="Mission continuity" value={value(metrics?.mission_preservation, '%')} tone="purple" /><PreviewMetric label="Recovery status" value={metrics?.status || 'Awaiting simulation'} tone="amber" /></div><div className="theme4-live-board"><div className="theme4-board-heading"><span>LIVE FLEET STATE</span><small>{riskRobot ? `${riskRobot.id} · ${riskRobot.health}% health · ${riskRobot.battery}% battery` : 'Awaiting simulation state'}</small></div><div className="theme4-board-grid">{Array.from({ length: 36 }, (_, index) => <span key={index} className={index === 14 ? 'danger' : index === 25 ? 'warning' : index === 31 ? 'recovering' : ''} />)}</div><div className="theme4-board-legend"><span><i className="good-dot" /> healthy</span><span><i className="warning-dot" /> warning</span><span><i className="danger-dot" /> failure propagation</span><span><i className="recovering-dot" /> recovery</span></div></div></section>

      <section className="theme4-section theme4-capabilities"><div className="theme4-section-label">04 / CORE RECOVERY CAPABILITIES</div><h2>Every capability serves one outcome: mission continuity.</h2><div className="theme4-capability-grid">{capabilities.map(([number, title, description, icon]) => <article key={title} className="theme4-capability"><span className={`capability-icon ${icon}`} aria-hidden="true">{number}</span><div><small>{number}</small><h3>{title}</h3><p>{description}</p></div></article>)}</div></section>

      <section className="theme4-section theme4-workflow"><div className="theme4-section-label">05 / RECOVERY WORKFLOW</div><div className="theme4-section-heading"><div><h2>Failure → propagation → recovery.</h2><p>The active stage advances through the same operational story the command center exposes.</p></div><span className="theme4-stage-readout">STAGE {String(activeStage + 1).padStart(2, '0')} / 08</span></div><div className="theme4-workflow-track">{workflow.map((stage, index) => <div key={stage} className={index === activeStage ? 'active' : index < activeStage ? 'complete' : ''}><span>{String(index + 1).padStart(2, '0')}</span><strong>{stage}</strong></div>)}</div></section>

      <section className="theme4-section theme4-evaluation" id="evaluation"><div className="theme4-section-heading"><div><div className="theme4-section-label">06 / QUANTITATIVE EVALUATION</div><h2>Measure the recovery, not the promise.</h2><p>Run a scenario, compare baseline with Sentinel recovery, and inspect the derived requirement matrix.</p></div><button className="theme4-button" onClick={() => navigate('/judge')}>Run evaluation <span>↗</span></button></div><div className="theme4-evaluation-row"><div><span>Baseline performance</span><strong>{value(metrics?.baseline_performance, '%')}</strong></div><div><span>Failure impact</span><strong>{value(metrics?.failure_impact, '%')}</strong></div><div><span>Recovered performance</span><strong>{value(metrics?.recovered_performance, '%')}</strong></div><div><span>Cascade containment</span><strong>{value(metrics?.cascade_containment, '%')}</strong></div></div></section>

      <section className="theme4-section theme4-technology"><div><div className="theme4-section-label">07 / TECHNOLOGY</div><h2>Technical by design.</h2></div><div className="theme4-tech-grid"><div><small>FRONTEND</small><strong>React · Vite</strong></div><div><small>BACKEND</small><strong>FastAPI · Python</strong></div><div><small>SIMULATION</small><strong>Authoritative fleet state · failure injection</strong></div><div><small>ANALYSIS</small><strong>Propagation graph · mission criticality · resource optimization</strong></div></div></section>

      <section className="theme4-final-cta"><span className="theme4-eyebrow">HACKFUSION 2026 · THEME 4</span><h2>See the fleet recover.</h2><p>Inject a failure. Trace the cascade. Migrate the mission. Rebalance the fleet. Measure recovery.</p><div><button className="theme4-button" onClick={() => navigate('/simulation')}>Open simulation <span>↗</span></button><button className="theme4-outline-button" onClick={() => navigate('/judge')}>View Theme 4 evaluation <span>↗</span></button></div></section>
    </main>
    <footer className="theme4-footer"><div><strong>SENTINEL ROBOTICS</strong><small>HackFusion 2026 · Theme 4</small></div><nav><button onClick={() => navigate('/simulation')}>Simulation</button><button onClick={() => navigate('/judge')}>Theme 4 evaluation</button><a href="#architecture">Architecture</a><a href="/ARCHITECTURE.md">Documentation</a></nav><span>Robot Fleet Recovery Under Cascading Failures</span></footer>
  </div>
}

function FleetPreview({ robots }) {
  return <div className="theme4-fleet-visual"><div className="theme4-visual-grid" /><div className="theme4-route route-a" /><div className="theme4-route route-b" />{robots.slice(0, 25).map((robot, index) => {
    const status = String(robot.status || 'healthy').toLowerCase()
    const tone = ['critical', 'failed'].includes(status) ? 'danger' : status === 'warning' ? 'warning' : status === 'recovering' ? 'recovering' : ''
    const position = robot.position || { x: 10 + ((index * 29) % 80), y: 15 + ((index * 47) % 70) }
    return <span key={robot.id} className={`theme4-robot ${tone}`} style={{ left: `${position.x}%`, top: `${position.y}%` }} title={`${robot.id} · ${status}`} aria-label={`${robot.id} ${status}`} />
  })}<div className="theme4-visual-core"><strong>RECOVERY<br />ENGINE</strong><small>FAILURE → RECOVERY</small></div><span className="theme4-visual-tag">LIVE AUTHORITATIVE FLEET</span></div>
}

function CascadeNode({ label, detail, tone }) { return <div className={`cascade-node ${tone}`}><strong>{label}</strong><small>{detail}</small></div> }
function PreviewMetric({ label, value, tone }) { return <div className={`preview-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div> }
