import { useState } from 'react'
import { LIVE } from './lib/supabase.js'
import logoUrl from './assets/sgas-logo-white.png'
import { viewsForRole, defaultView, roleLabel } from './lib/roles.js'
import { ToastHost } from './components/ToastHost.jsx'
import Login from './views/Login.jsx'
import Dashboard from './views/Dashboard.jsx'
import Inquiries from './views/Inquiries.jsx'
import Book from './views/Book.jsx'
import Schedule from './views/Schedule.jsx'
import Calendar from './views/Calendar.jsx'
import CalendarNext from './views/CalendarNext.jsx'
import SetupWizard from './views/SetupWizard.jsx'
import Assess from './views/Assess.jsx'
import Payments from './views/Payments.jsx'
import Delegates from './views/Delegates.jsx'
import Companies from './views/Companies.jsx'
import Courses from './views/Courses.jsx'
import Admin from './views/Admin.jsx'
import Roadmap from './views/Roadmap.jsx'
import Changelog from './views/Changelog.jsx'
import Help from './views/Help.jsx'
import PageHelp from './components/PageHelp.jsx'
import ResetPassword from './views/ResetPassword.jsx'
import { VERSION, BUILD, COMMIT } from './lib/version.js'
import { clearToken } from './lib/session.js'

const SESSION_KEY = 'sgas_user'

const TITLES = {
  dash: ['Dashboard', 'The renewal engine, scheduled sessions, and what is outstanding'],
  inquiries: ['Inquiries', 'Capture leads fast, then work them off a follow-up list'],
  book: ['Book a Delegate', 'Create a draft booking — anyone on reception, not just the Director'],
  setup: ['Set up a course', 'Step by step — the course, the dates, who is teaching and who is attending'],
  sched: ['Schedule', 'Assign a trainer to each course block and add delegates (assessor & verifier are set in Assess)'],
  calendar: ['Calendar', 'Drag to create blocks, move or resize them, and see everything by month, week, day, staff or year'],
  calendarnext: ['Calendar — new look', 'A redesign, side by side with the one you know. Nothing here replaces it yet.'],
  assess: ['Assess', 'Flip the pre-selected qualifications to pass/fail — dates auto-generate'],
  pay: ['Payments & chase', 'The final stage — set outstanding flags and chase the associated company'],
  delegates: ['Delegates', 'Search by name or NI number; open one to see their full history'],
  companies: ['Companies', 'Employers and sole traders — the only payers'],
  courses: ['Courses', 'Qualification pools delegates book onto'],
  admin: ['Admin', 'Manage staff accounts and access'],
  roadmap: ['Progress', 'Where we are — what’s done, what’s next, and what’s waiting on us'],
  changelog: ['Changelog', 'Every release, newest first — what changed and when it went live'],
  help: ['Help & FAQ', 'How everything works — search or browse a plain-English guide to every screen'],
}

const NAV_GROUPS = [
  { grp: 'Operations', items: [
    { v: 'dash', ic: '▦', label: 'Dashboard' },
    { v: 'inquiries', ic: '💬', label: 'Inquiries' },
    { v: 'book', ic: '＋', label: 'Book a Delegate' },
    { v: 'setup', ic: '🪄', label: 'Set up a course' },
    { v: 'sched', ic: '▤', label: 'Schedule' },
    { v: 'calendar', ic: '📅', label: 'Calendar' },
    { v: 'calendarnext', ic: '✨', label: 'Calendar — new look' },
    { v: 'assess', ic: '✓', label: 'Assess' },
    { v: 'pay', ic: '£', label: 'Payments & chase' },
  ] },
  { grp: 'Records', items: [
    { v: 'delegates', ic: '👤', label: 'Delegates' },
    { v: 'companies', ic: '🏢', label: 'Companies' },
    { v: 'courses', ic: '📚', label: 'Courses' },
  ] },
  { grp: 'Settings', items: [
    { v: 'admin', ic: '👥', label: 'Admin' },
    { v: 'roadmap', ic: '🗺', label: 'Progress' },
    { v: 'changelog', ic: '📝', label: 'Changelog' },
  ] },
  { grp: 'Help', items: [
    { v: 'help', ic: '❓', label: 'Help & FAQ' },
  ] },
]

// Build the sidebar from the role's allowed views; drop groups that end up empty.
function buildNav(role) {
  const allowed = viewsForRole(role)
  const nav = []
  for (const g of NAV_GROUPS) {
    const items = g.items.filter((it) => allowed.includes(it.v))
    if (!items.length) continue
    nav.push({ grp: g.grp }, ...items)
  }
  nav.push(
    { grp: 'Later modules' },
    { soon: true, ic: '🌐', label: 'Online booking' },
    { soon: true, ic: '🛒', label: 'Product shop' },
    { soon: true, ic: '📊', label: 'Reporting' },
  )
  return nav
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
}

export default function App() {
  const [user, setUser] = useState(loadSession)
  // Read once, at start-up: the token is in the query string of the link the
  // person just clicked.
  const [resetToken, setResetToken] = useState(() => {
    if (typeof window === 'undefined') return null
    try { return new URLSearchParams(window.location.search).get('reset') || null } catch { return null }
  })
  const [view, setView] = useState(() => defaultView(loadSession()?.role))
  const [openDelegate, setOpenDelegate] = useState(null)
  const [bookPrefill, setBookPrefill] = useState(null)
  const [navOpen, setNavOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 820 : true))

  function onLogin(u) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(u))
    setUser(u)
    setView(defaultView(u.role))
  }
  function signOut() {
    localStorage.removeItem(SESSION_KEY)
    clearToken()          // stop sending the JWT the moment they sign out
    setUser(null)
  }

  // An emailed reset link opens the app with ?reset=<token>. It has to be
  // handled before the sign-in screen, because somebody following that link is
  // by definition unable to sign in. The token is dropped out of the address
  // bar as soon as it is used, so it does not sit in history or get shared in
  // a screenshot.
  if (resetToken) {
    return (
      <ResetPassword
        token={resetToken}
        onDone={() => {
          setResetToken(null)
          if (typeof window !== 'undefined' && window.history?.replaceState) {
            window.history.replaceState({}, '', window.location.pathname)
          }
        }}
      />
    )
  }

  if (!user) return <Login onLogin={onLogin} />

  const isAdmin = user.role === 'ADMIN'
  const allowed = viewsForRole(user.role)
  const nav = buildNav(user.role)
  const go = (v, param = null) => {
    setOpenDelegate(v === 'delegates' ? param : null)
    setBookPrefill(v === 'book' ? param : null)
    setView(v)
    // On a phone the menu overlays the page, so leaving it open would hide
    // whatever you just picked.
    if (typeof window !== 'undefined' && window.innerWidth <= 760) setNavOpen(false)
  }
  // Guard: any view the current role can't see falls back to its default view.
  const activeView = allowed.includes(view) ? view : defaultView(user.role)
  const [title, sub] = TITLES[activeView]

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div
      className={'app' + (navOpen ? '' : ' nav-collapsed')}
      onClick={(e) => {
        // The backdrop is the ::before of this element, so a click that lands
        // on the container itself on a small screen means "close the menu".
        if (navOpen && e.target === e.currentTarget && window.innerWidth <= 760) setNavOpen(false)
      }}
    >
      <aside className="side">
        <div className="brand"><img className="brand-logo" src={logoUrl} alt="SGAS — Specialist Gas Assessment Services" /><span>Training Management</span></div>
        <nav className="nav">
          {nav.map((item, i) =>
            item.grp ? (
              <div className="grp" key={'g' + i}>{item.grp}</div>
            ) : item.soon ? (
              <a className="soon" key={'s' + i}><span className="ic">{item.ic}</span> {item.label} <small>later</small></a>
            ) : (
              <button
                key={item.v}
                type="button"
                className={activeView === item.v ? 'active' : ''}
                aria-current={activeView === item.v ? 'page' : undefined}
                onClick={() => go(item.v)}
              >
                <span className="ic" aria-hidden="true">{item.ic}</span> {item.label}
              </button>
            )
          )}
        </nav>
        <div className="foot">
          <div>{LIVE ? 'Connected to Supabase' : 'Demo data · no database connected'}</div>
          {isAdmin ? (
            <button
              className="verbadge"
              onClick={() => go('changelog')}
              title={'Build ' + BUILD + (COMMIT !== 'dev' ? ' · push ' + COMMIT : '') + ' — open the changelog'}
            >
              v{VERSION} <span className="verbuild">build {BUILD}</span>
            </button>
          ) : (
            <div className="verbadge static">v{VERSION} <span className="verbuild">build {BUILD}</span></div>
          )}
        </div>
      </aside>

      <div className="main">
        <div className="top">
          <button className="navtoggle" onClick={() => setNavOpen((o) => !o)} title="Toggle menu">☰</button>
          <div><h1>{title}</h1><div className="sub">{sub}</div></div>
          <div className="right">
            <PageHelp view={activeView} onOpenFaq={() => go('help')} />
            <span className={'srcbadge ' + (LIVE ? 'live' : 'demo')}>{LIVE ? '● LIVE' : '● DEMO'}</span>
            <span className="pill">{today}</span>
            <span>{user.name || user.username} · {roleLabel(user.role)}</span>
            <button className="linkbtn" onClick={signOut}>Sign out</button>
          </div>
        </div>
        <div className="content">
          {activeView === 'dash' && <Dashboard go={go} user={user} />}
          {activeView === 'inquiries' && <Inquiries go={go} />}
          {activeView === 'book' && <Book prefill={bookPrefill} />}
          {activeView === 'setup' && <SetupWizard go={go} />}
          {activeView === 'sched' && <Schedule user={user} isAdmin={isAdmin} go={go} />}
          {activeView === 'calendar' && <Calendar go={go} isAdmin={isAdmin} user={user} />}
          {activeView === 'calendarnext' && <CalendarNext go={go} isAdmin={isAdmin} user={user} />}
          {activeView === 'assess' && <Assess />}
          {activeView === 'pay' && <Payments />}
          {activeView === 'delegates' && <Delegates openDelegate={openDelegate} />}
          {activeView === 'companies' && <Companies go={go} />}
          {activeView === 'courses' && <Courses />}
          {activeView === 'admin' && isAdmin && <Admin currentUser={user} />}
          {activeView === 'roadmap' && isAdmin && <Roadmap currentUser={user} />}
          {activeView === 'changelog' && isAdmin && <Changelog />}
          {activeView === 'help' && <Help />}
        </div>
      </div>
      <ToastHost />
    </div>
  )
}
