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
import Calendar2 from './views/Calendar2.jsx'
import YearCalendar from './views/YearCalendar.jsx'
import Assess from './views/Assess.jsx'
import Payments from './views/Payments.jsx'
import Delegates from './views/Delegates.jsx'
import Companies from './views/Companies.jsx'
import Staff from './views/Staff.jsx'
import Courses from './views/Courses.jsx'
import Admin from './views/Admin.jsx'

const SESSION_KEY = 'sgas_user'

const TITLES = {
  dash: ['Dashboard', 'The renewal engine, scheduled sessions, and what is outstanding'],
  inquiries: ['Inquiries', 'Capture leads fast, then work them off a follow-up list'],
  book: ['Book a Delegate', 'Create a draft booking — anyone on reception, not just the Director'],
  sched: ['Schedule', 'Assign a trainer, assessor and verifier to each Teamup block, then add delegates'],
  calendar: ['Calendar 1 · DayPilot', 'Drag to create blocks, move or resize them, and see everything by month, week, day or staff'],
  calendar2: ['Calendar 2 · Big Cal', 'A/B alternative — react-big-calendar (Google/Outlook style). Same blocks, drag-create / move / resize.'],
  calyear: ['Year planner', 'Teamup-style year at a glance — each month a row, colour bars per course block. Click a bar to open it.'],
  assess: ['Assess', 'Flip the pre-selected qualifications to pass/fail — dates auto-generate'],
  pay: ['Payments & chase', 'The final stage — set outstanding flags and chase the associated company'],
  delegates: ['Delegates', 'Search by name or NI number; open one to see their full history'],
  companies: ['Companies', 'Employers and sole traders — the only payers'],
  staff: ['Staff', 'Trainers, assessors and verifiers — each with their own Teamup sub-calendar'],
  courses: ['Courses', 'Qualification pools delegates book onto'],
  admin: ['Admin', 'Manage staff accounts and access'],
}

const NAV_GROUPS = [
  { grp: 'Operations', items: [
    { v: 'dash', ic: '▦', label: 'Dashboard' },
    { v: 'inquiries', ic: '💬', label: 'Inquiries' },
    { v: 'book', ic: '＋', label: 'Book a Delegate' },
    { v: 'sched', ic: '▤', label: 'Schedule' },
    { v: 'calendar', ic: '📅', label: 'Calendar 1 · DayPilot' },
    { v: 'calendar2', ic: '🗓', label: 'Calendar 2 · Big Cal' },
    { v: 'calyear', ic: '📆', label: 'Year planner' },
    { v: 'assess', ic: '✓', label: 'Assess' },
    { v: 'pay', ic: '£', label: 'Payments & chase' },
  ] },
  { grp: 'Records', items: [
    { v: 'delegates', ic: '👤', label: 'Delegates' },
    { v: 'companies', ic: '🏢', label: 'Companies' },
    { v: 'staff', ic: '🎓', label: 'Staff' },
    { v: 'courses', ic: '📚', label: 'Courses' },
  ] },
  { grp: 'Settings', items: [
    { v: 'admin', ic: '👥', label: 'Admin' },
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
  const [view, setView] = useState(() => defaultView(loadSession()?.role))
  const [openDelegate, setOpenDelegate] = useState(null)
  const [bookPrefill, setBookPrefill] = useState(null)

  function onLogin(u) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(u))
    setUser(u)
    setView(defaultView(u.role))
  }
  function signOut() {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  if (!user) return <Login onLogin={onLogin} />

  const isAdmin = user.role === 'ADMIN'
  const allowed = viewsForRole(user.role)
  const nav = buildNav(user.role)
  const go = (v, param = null) => {
    setOpenDelegate(v === 'delegates' ? param : null)
    setBookPrefill(v === 'book' ? param : null)
    setView(v)
  }
  // Guard: any view the current role can't see falls back to its default view.
  const activeView = allowed.includes(view) ? view : defaultView(user.role)
  const [title, sub] = TITLES[activeView]

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><img className="brand-logo" src={logoUrl} alt="SGAS — Specialist Gas Assessment Services" /><span>Training Management</span></div>
        <nav className="nav">
          {nav.map((item, i) =>
            item.grp ? (
              <div className="grp" key={'g' + i}>{item.grp}</div>
            ) : item.soon ? (
              <a className="soon" key={'s' + i}><span className="ic">{item.ic}</span> {item.label} <small>later</small></a>
            ) : (
              <a key={item.v} className={activeView === item.v ? 'active' : ''} onClick={() => go(item.v)}>
                <span className="ic">{item.ic}</span> {item.label}
              </a>
            )
          )}
        </nav>
        <div className="foot">
          {LIVE ? 'Connected to Supabase' : 'Demo data · no database connected'}
        </div>
      </aside>

      <div className="main">
        <div className="top">
          <div><h1>{title}</h1><div className="sub">{sub}</div></div>
          <div className="right">
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
          {activeView === 'sched' && <Schedule />}
          {activeView === 'calendar' && <Calendar go={go} />}
          {activeView === 'calendar2' && <Calendar2 go={go} />}
          {activeView === 'calyear' && <YearCalendar go={go} />}
          {activeView === 'assess' && <Assess />}
          {activeView === 'pay' && <Payments />}
          {activeView === 'delegates' && <Delegates openDelegate={openDelegate} />}
          {activeView === 'companies' && <Companies go={go} />}
          {activeView === 'staff' && <Staff />}
          {activeView === 'courses' && <Courses />}
          {activeView === 'admin' && isAdmin && <Admin currentUser={user} />}
        </div>
      </div>
      <ToastHost />
    </div>
  )
}
