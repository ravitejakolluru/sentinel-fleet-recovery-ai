import { useEffect, useRef, useState } from 'react'
import SimulationPage from './SimulationPage.jsx'
import Profile from './Profile.jsx'
import { buildApiUrl } from './services/api.js'
import { subscribeSimulationData } from './services/simulation-state.js'
import { AdminManagementPage, CommandCenterPage, DigitalTwinPage, GenericPublicPage, SummaryPage } from './Pages.jsx'
import { LiveAlertsPage, LiveFailureAnalysisPage, LiveFleetPage, LiveJudgePage, LiveMissionsPage, LiveRecoveryPage } from './LivePages.jsx'
import LandingRedesign from './LandingRedesign.jsx'
import { auth, authErrorMessage, completeGoogleRedirect, createAccount, resetPassword, signInWithEmail, signInWithGoogle, signOutUser, subscribeToAuthState } from './services/auth.js'

const routeAliases = {
  '/command-center': '/simulation',
  '/operations': '/simulation',
  '/summary': '/summary',
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
  return <div className="login-screen integrated-login"><div className="login-atmosphere" aria-hidden="true"><span className="login-orbit orbit-one" /><span className="login-orbit orbit-two" /><span className="login-signal signal-one">25 ROBOTS</span><span className="login-signal signal-two">RECOVERY READY</span></div><div className="login-layout"><section className="login-visual"><button className="login-brand" onClick={() => navigate('/')} aria-label="Sentinel Robotics home"><span className="login-brand-mark">S</span><span><strong>SENTINEL</strong><em>ROBOTICS</em></span></button><div className="login-visual-copy"><span>FLEET RECOVERY AI</span><h1>Keep the mission moving.</h1><p>Intelligent fleet recovery under cascading failures.</p></div><div className="login-visual-board"><div className="login-board-grid" />{Array.from({ length: 25 }, (_, index) => <i key={index} style={{ left: `${12 + ((index * 19) % 76)}%`, top: `${18 + ((index * 31) % 64)}%` }} />)}<strong>LIVE FLEET<br />RECOVERY</strong></div><div className="login-visual-metrics"><span><b>25</b><small>ROBOTS</small></span><span><b>LIVE</b><small>MONITORING</small></span><span><b>READY</b><small>RECOVERY</small></span></div></section><section className="login-card integrated-login-card" aria-labelledby="login-heading"><span className="login-status"><i /> SYSTEM ONLINE</span><h1 id="login-heading">Welcome back</h1><p className="login-intro">Sign in to Fleet Command and monitor mission continuity.</p><div className="auth-mode-tabs"><button className={mode === 'sign-in' && !adminMode ? 'active' : ''} onClick={() => { setMode('sign-in'); setAdminMode(false) }}>SIGN IN</button><button className={mode === 'create' && !adminMode ? 'active' : ''} onClick={() => { setMode('create'); setAdminMode(false) }}>CREATE ACCOUNT</button><button className={adminMode ? 'active' : ''} onClick={() => setAdminMode(true)}>ADMIN LOGIN</button></div><form onSubmit={submit}>{adminMode ? <><label className="login-field"><span>Admin Username</span><input className="profile-input" value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} autoComplete="username" /></label><label className="login-field"><span>Admin Password</span><input className="profile-input" type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoComplete="current-password" /></label></> : <><label className="login-field"><span>{mode === 'create' ? 'Full Name' : 'Email / User ID'}</span>{mode === 'create' && <input className="profile-input" placeholder="Operator name" value={name} onChange={(event) => setName(event.target.value)} />}</label><label className="login-field"><span>Email</span><input className="profile-input" type="email" placeholder="operator@example.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label className="login-field"><span>Password</span><input className="profile-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} /></label>{mode === 'create' && <label className="login-field"><span>Confirm Password</span><input className="profile-input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>}</>}<button className="admin-submit" type="submit" disabled={busy}>{busy ? 'Working...' : adminMode ? 'Admin Sign In' : mode === 'create' ? 'Create Account' : 'Sign In'} <span>↗</span></button></form>{!adminMode && mode === 'sign-in' && <><button className="google-button integrated-google" onClick={onGoogleLogin} disabled={busy}><span className="google-g">G</span>Continue with Google</button><button className="login-link-button" onClick={reset}>Forgot Password?</button></>}{feedback && <div className="login-feedback" role="alert">{feedback}</div>}<button className="demo-login" onClick={onDemoLogin} disabled={busy}>ENTER DEMO MODE <span>↗</span></button><button className="login-back" onClick={() => navigate('/')}>Back to Sentinel Robotics <span>↗</span></button></section></div></div>
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
  const [authFeedback, setAuthFeedback] = useState('')
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
    const unsubscribeSimulation = subscribeSimulationData(() => {})
    return () => { active = false; window.removeEventListener('popstate', onPopState); unsubscribe(); unsubscribeSimulation() }
  }, [])

  const navigate = (nextPath) => {
    const destination = canonicalPath(nextPath)
    window.history.pushState({}, '', destination)
    setPath(destination)
  }

  const googleLogin = async () => {
    sessionStorage.removeItem('demoSession')
    setAuthFeedback('')
    try {
      const authenticatedUser = await signInWithGoogle()
      if (!authenticatedUser) return
      setUser(authenticatedUser)
      setProfile(authenticatedUser)
      setDemoMode(false)
      demoModeRef.current = false
      navigate('/')
    } catch (error) {
      setAuthFeedback(error?.code ? authErrorMessage(error) : error.message || authErrorMessage(error))
    }
  }

  const emailLogin = async (email, password) => {
    sessionStorage.removeItem('demoSession')
    let authenticatedUser
    try { authenticatedUser = await signInWithEmail(email, password) } catch (error) { throw new Error(error?.code ? authErrorMessage(error) : error.message || authErrorMessage(error)) }
    setUser(authenticatedUser)
    setProfile(authenticatedUser)
    setDemoMode(false)
    demoModeRef.current = false
    navigate('/simulation')
  }

  const accountCreate = async (name, email, password) => {
    sessionStorage.removeItem('demoSession')
    let authenticatedUser
    try { authenticatedUser = await createAccount(name, email, password) } catch (error) { throw new Error(error?.code ? authErrorMessage(error) : error.message || authErrorMessage(error)) }
    setUser(authenticatedUser)
    setProfile(authenticatedUser)
    setDemoMode(false)
    demoModeRef.current = false
    navigate('/simulation')
  }

  const passwordReset = async (email) => {
    try { await resetPassword(email) } catch (error) { throw new Error(error?.code ? authErrorMessage(error) : error.message || authErrorMessage(error)) }
  }

  const startDemo = () => {
    sessionStorage.removeItem('demoSession')
    const demoUser = { name: 'Public preview', email: 'preview@sentinel.local', photoURL: '', provider: 'demo' }
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

  const adminLogout = () => {
    sessionStorage.removeItem('adminSession')
    sessionStorage.removeItem('demoSession')
    setAdmin(null)
    setDemoMode(false)
    demoModeRef.current = false
    navigate('/')
  }

  const logout = async () => {
    try {
      await signOutUser()
    } finally {
      sessionStorage.removeItem('demoSession')
      setUser(null)
      setProfile(null)
      setDemoMode(false)
      demoModeRef.current = false
      navigate('/')
    }
  }

  const displayUser = profile || user || (admin ? { name: 'Administrator', role: admin.user?.username || admin.username } : demoMode ? { name: 'Public preview', role: 'Public demo session' } : null)
  if (authLoading) return <div className="auth-loading">Checking authentication...</div>
  if (path === '/login') return <><LoginExperience navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} onAdminLogin={adminLogin} onCreateAccount={accountCreate} onResetPassword={passwordReset} />{authFeedback && <p className="login-global-feedback" role="alert">{authFeedback}</p>}</>
  if (path === '/profile') return user ? <Profile user={profile || user} navigate={navigate} onLogout={logout} onProfileChange={setProfile} /> : admin ? <GenericPublicPage title="Administrator profile" navigate={navigate} user={{ name: 'Administrator', role: admin.user?.username || admin.username }} onLogout={adminLogout}><p>Administrator access is managed by the protected Sentinel server.</p></GenericPublicPage> : <Login navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} />
  if (path === '/admin') return admin ? <AdminManagementPage admin={admin} navigate={navigate} onLogout={adminLogout} /> : <Login navigate={navigate} onGoogleLogin={googleLogin} onEmailLogin={emailLogin} onDemoLogin={startDemo} onAdminLogin={adminLogin} />
  if (path === '/simulation') return <SimulationPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} />
  if (path === '/fleet') return <LiveFleetPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} />
  if (path === '/missions') return <LiveMissionsPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} />
  if (path === '/recovery') return <LiveRecoveryPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} />
  if (path === '/failure-analysis') return <LiveFailureAnalysisPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} />
  if (path === '/digital-twin') return <DigitalTwinPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} />
  if (path === '/judge') return <LiveJudgePage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} />
  if (path === '/alerts') return <LiveAlertsPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} />
  if (path === '/summary') return <SummaryPage navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout} />
  if (path === '/') return <LandingRedesign navigate={navigate} startDemo={startDemo} user={displayUser} />
  return <GenericPublicPage title="Page not found" navigate={navigate} user={displayUser} onLogout={admin ? adminLogout : logout}><button className="primary-button" onClick={() => navigate('/')}>Open public website</button></GenericPublicPage>
}

export default App
