import { useEffect, useState } from 'react'
import { LIVE } from '../lib/supabase.js'
import {
  listUsers, createUser, updateUser, setUserPassword, deleteUser,
  listStaff, createStaff, updateStaff, setStaffLeft, deleteStaff, staffUsage,
  listHolidays, weekdayDays, getSettings, saveSetting, notifyAccount, whoami, activeSessions,
} from '../lib/api.js'
import { ROLES, ROLE_LABELS } from '../lib/roles.js'
import { accreditationStatus, listStaffAccreditations } from '../lib/api.js'
import StaffAccreditations from '../components/StaffAccreditations.jsx'
import EmailSettings from './EmailSettings.jsx'
import SageSettings, { SAGE_CODE_KEY } from './SageSettings.jsx'
import { toast } from '../lib/toast.js'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — three tabs, because this was one page holding three unrelated jobs.
//
//   Staff            the people. Who they are, where they are, what is expiring.
//   Logins & access  every account. Username, role, in or out, reset, delete.
//   Email            the mail settings, which carry their own strip.
//
// The split is not decoration: the staff table had eight columns and was
// carrying login management as three of them. Per-person detail belongs on the
// person's own page (click a name), per-account detail belongs on the accounts
// tab, and the staff list gets to be a list of people again.
//
// LEAVING, NOT DELETING. A staff record cannot be deleted once anyone has been
// taught by them — the database refuses it, and rightly: that is the history
// the audit runs on. So "Remove" marks the day they left. They vanish from this
// list and from every trainer / assessor picker in the app, every course they
// ever ran keeps their name, and any course still to come that they were down
// for turns up in the calendar's Needs attention as wanting a trainer. A record
// with no history at all — a seed row, a mistake — is offered as a real delete,
// because there is nothing to protect.
// ─────────────────────────────────────────────────────────────────────────────

// Roll a person's accreditation rows up into the counts shown beside their name.
function summarise(rows) {
  let due = 0, expired = 0
  for (const r of rows) {
    const st = accreditationStatus(r.expiresOn).state
    if (st === 'due') due++; else if (st === 'expired') expired++
  }
  return { total: rows.length, due, expired }
}

const TABS = [
  ['staff', '🎓 Staff'],
  ['access', '🔑 Logins & access'],
  ['email', '✉️ Email'],
  ['sage', '🧾 Sage'],
]

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

// ─────────────────────────────────────────────────────────────────────────────────
// "Why is this person seeing empty screens?"
//
// It was built to prove the token worked before the lockdown. That job is done,
// but the check earned its keep: since the lockdown, an expired session and a
// revoked signing key produce the SAME symptom — every screen loads empty — and
// from the outside that is indistinguishable from the system being broken.
//
//   expired session            -> sign out and back in, fixed in ten seconds
//   revoked legacy JWT secret  -> nobody can work until it is restored
//
// One click says which. Without it, both look like "SGAS is down".
//
// It must be run from the browser: the SQL editor carries no token and always
// looks healthy.
// ─────────────────────────────────────────────────────────────────────────────────
function SessionCheck() {
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try { setRes(await whoami()) } catch (e) { setRes({ verdict: e.message }) } finally { setBusy(false) }
  }

  const good = res?.healthy === true

  return (
    <div className="subform" style={{ marginBottom: 16 }}>
      <div className="sfh">Connection check</div>
      <div className="hint">
        If somebody says screens are loading empty, press this on their machine before anything
        else. It tells an expired sign-in — which they fix themselves by signing out and back in —
        apart from a real fault. It has to be run in the browser, on the affected machine.
      </div>
      <div className="inrow">
        <button className="btn sm" onClick={run} disabled={busy}>
          {busy ? 'Checking…' : 'Check this connection'}
        </button>
      </div>
      {res && (
        <div className="pc-msg" style={{ color: good ? '#1a8a4b' : '#b42318' }}>
          <b>{good ? '✓ ' : '⚠ '}{res.verdict}</b>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
            {res.app_role ? <>Signed in as {String(res.app_role)}. </> : null}
            {/* Which of the two proofs this browser used. During the changeover
                both work, and "old way" is information rather than a fault. */}
            {res.proof === 'session' ? 'Signed in with a session token.'
              : res.proof === 'jwt' ? 'Signed in the old way — signing out and back in moves this browser across.'
              : null}
            {/* The one part of the design that lives in server configuration
                rather than in a table, so the one part a restore can lose. */}
            {res.promotion_installed === false
              ? ' The database is not promoting signed-in requests — see supabase/README.md.'
              : null}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────
// WHO IS SIGNED IN RIGHT NOW.
//
// A question the old design could not answer at any price. A JWT is handed out
// and then forgotten — nothing records that it exists, nothing can withdraw it,
// and it stays good for its full twelve hours whatever happens to the account
// afterwards. Sessions are rows, so they can be listed, and they can be ended.
//
// Deliberately read-only for the moment. Ending somebody else's session is a
// real action with real consequences on a Tuesday afternoon, and it should be
// added when there is a reason to, not because it was easy.
// ─────────────────────────────────────────────────────────────────────────────────
function SignedInNow({ adminAuth }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setBusy(true); setErr(null)
    try { setRows(await activeSessions(adminAuth)) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  // Browsers report themselves at absurd length. Nobody reading this screen
  // wants the version string — they want to recognise the machine.
  const device = (ua) => {
    if (!ua) return '—'
    const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iPhone or iPad'
      : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : 'Other'
    const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome'
      : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : ''
    return br ? os + ' · ' + br : os
  }

  const when = (t) => {
    if (!t) return '—'
    const mins = Math.round((Date.now() - new Date(t).getTime()) / 60000)
    if (mins < 2) return 'just now'
    if (mins < 60) return mins + ' min ago'
    const h = Math.round(mins / 60)
    return h + (h === 1 ? ' hour ago' : ' hours ago')
  }

  return (
    <div className="subform" style={{ marginBottom: 16 }}>
      <div className="sfh">Signed in now</div>
      <div className="hint">
        Every session currently open, on every machine. Sessions last 12 hours and end when somebody
        signs out. Useful for "is Keith still logged in on the training room PC" — and for spotting a
        sign-in from somewhere nobody recognises.
      </div>
      <div className="inrow">
        <button className="btn sm" onClick={load} disabled={busy}>
          {busy ? 'Checking…' : rows ? 'Refresh' : 'Show who is signed in'}
        </button>
      </div>
      {err && <div className="pc-msg" style={{ color: '#b42318' }}><b>{err}</b></div>}
      {rows && (rows.length === 0
        ? <div className="pc-msg"><b>Nobody is signed in.</b> Anyone still on an older sign-in will
            appear here once they next sign in.</div>
        : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Person</th><th>Role</th><th>Device</th><th>Last used</th><th>Ends</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name || r.username}</td>
                    <td>{r.role}</td>
                    <td className="muted small">{device(r.user_agent)}</td>
                    <td className="muted small">{when(r.last_seen_at || r.signed_in_at)}</td>
                    <td className="muted small">{new Date(r.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  )
}

export default function Admin({ currentUser }) {
  // Coming back from Sage lands on the app root, not on a route, so the only
  // way this screen knows to open on the Sage tab is the code App.jsx parked in
  // sessionStorage on the way in. Without this you return from authorising and
  // are dropped on the staff list wondering whether it worked.
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem(SAGE_CODE_KEY) ? 'sage' : 'staff' } catch { return 'staff' }
  })
  // No second password. Until the anon lockdown every request reached the
  // database as `anon`, so re-typing the admin password was the only way to
  // prove who was asking. The request now carries a signed token naming the
  // user and app_is_admin() reads app_user from it, so the page can simply ask.
  //
  // adminAuth is kept as an argument all the way down to api.js and is always
  // null here: the RPCs still accept a username and password because the Edge
  // Function has no token of its own and needs that path.
  const adminAuth = null

  const [users, setUsers] = useState([])
  const [staff, setStaff] = useState([])
  const [holidays, setHolidays] = useState([])
  const [showLeft, setShowLeft] = useState(false)
  const [loading, setLoading] = useState(!LIVE)
  const [showAdd, setShowAdd] = useState(false)
  const [nu, setNu] = useState({ name: '', email: '', room: '', username: '', role: 'STANDARD', password: '' })
  const [resetId, setResetId] = useState(null)
  const [resetPw, setResetPw] = useState('')
  const [created, setCreated] = useState(null)
  const [loginFor, setLoginFor] = useState(null)
  const [loginForm, setLoginForm] = useState({ username: '', role: 'STANDARD', password: '' })
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', room: '' })
  // Which staff member's own page is open, plus a per-person summary so a row
  // in the list can still show a warning without opening anyone.
  const [accFor, setAccFor] = useState(null)
  const [accCounts, setAccCounts] = useState({})
  const [approver, setApprover] = useState('')

  async function load(auth = adminAuth, opts = {}) {
    const withLeft = 'withLeft' in opts ? opts.withLeft : showLeft
    setLoading(true)
    try {
      const [u, s, hol, set] = await Promise.all([
        listUsers(auth), listStaff({ includeLeft: withLeft }), listHolidays(), getSettings().catch(() => ({})),
      ])
      setUsers(u); setStaff(s); setHolidays(hol)
      setApprover(set.holiday_approver_staff_id == null ? '' : String(set.holiday_approver_staff_id))
    } catch (e) { toast(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const userForStaff = (staffId) => users.find((u) => u.staffId === staffId)

  // One pass over every staff member's accreditations, purely so an expiry can
  // show beside the name without opening anyone.
  useEffect(() => {
    let alive = true
    listStaffAccreditations()
      .then((rows) => {
        if (!alive) return
        const by = {}
        for (const r of rows) (by[r.staffId] = by[r.staffId] || []).push(r)
        const out = {}
        for (const id of Object.keys(by)) out[id] = summarise(by[id])
        setAccCounts(out)
      })
      .catch(() => { /* the badge is a nicety — never block the staff list */ })
    return () => { alive = false }
  }, [accFor])

  const holDays = (staffId) => holidays.filter((h) => h.staffId === staffId).reduce((n, h) => n + weekdayDays(h.start, h.end), 0)

  async function addStaff() {
    if (!nu.name.trim()) return toast('Name is required')
    if (!nu.username.trim()) return toast('Username is required')
    if (!nu.password) return toast('Password is required')
    try {
      const st = await createStaff({ name: nu.name.trim(), email: nu.email, room: nu.room })
      const created = await createUser({ username: nu.username.trim(), name: nu.name.trim(), email: nu.email, role: nu.role, password: nu.password, staffId: st.staff_id }, adminAuth)
      if (created?.user_id) notifyAccount({ kind: 'user_created', userId: created.user_id }, adminAuth)
      toast('Staff member created')
      setCreated({ username: nu.username.trim(), name: nu.name.trim(), email: nu.email, role: nu.role, password: nu.password })
      setNu({ name: '', email: '', room: '', username: '', role: 'STANDARD', password: '' })
      setShowAdd(false); load()
    } catch (e) { toast(e.message) }
  }

  async function createLogin(staffId) {
    if (!loginForm.username.trim() || !loginForm.password) return toast('Username and password required')
    const st = staff.find((s) => s.staff_id === staffId)
    try {
      const made = await createUser({ username: loginForm.username.trim(), name: st?.name, email: st?.email, role: loginForm.role, password: loginForm.password, staffId }, adminAuth)
      if (made?.user_id) notifyAccount({ kind: 'user_created', userId: made.user_id }, adminAuth)
      toast('Login created')
      setCreated({ username: loginForm.username.trim(), name: st?.name, email: st?.email, role: loginForm.role, password: loginForm.password })
      setLoginFor(null); setLoginForm({ username: '', role: 'STANDARD', password: '' }); load()
    } catch (e) { toast(e.message) }
  }

  async function saveEdit(st) {
    try {
      await updateStaff(st.staff_id, { name: editForm.name, email: editForm.email, room: editForm.room })
      const u = userForStaff(st.staff_id)
      if (u) await updateUser(u.user_id, { name: editForm.name, email: editForm.email }, adminAuth)
      toast('Staff updated'); setEditId(null); load()
    } catch (e) { toast(e.message) }
  }

  async function changeRole(u, role) {
    if (role === u.role) return
    try { await updateUser(u.user_id, { role }, adminAuth); load() }
    catch (e) { toast(e.message) }
  }

  async function makeStaff(u) {
    try {
      const st = await createStaff({ name: u.name || u.username, email: u.email, room: '' })
      await updateUser(u.user_id, { staffId: st.staff_id }, adminAuth)
      toast(`${u.name || u.username} is now a staff member`)
      load()
    } catch (e) { toast(e.message) }
  }

  async function toggleActive(u) {
    try {
      const nowActive = !u.is_active
      await updateUser(u.user_id, { is_active: nowActive }, adminAuth)
      notifyAccount({ kind: nowActive ? 'account_enabled' : 'account_disabled', userId: u.user_id }, adminAuth)
      load()
    } catch (e) { toast(e.message) }
  }

  async function saveReset(u) {
    if (!resetPw) return toast('Enter a new password')
    try {
      await setUserPassword(u.user_id, resetPw, adminAuth)
      // They should hear that it changed even when it was you who changed it —
      // that is how somebody finds out their account was touched.
      notifyAccount({ kind: 'password_changed', userId: u.user_id }, adminAuth)
      toast(`Password reset for ${u.username}`); setResetId(null); setResetPw('')
    }
    catch (e) { toast(e.message) }
  }

  async function removeUser(u) {
    if (!window.confirm(`Delete the login "${u.username}"?\n\nThe person's staff record and everything they have taught stay exactly as they are. Only the account goes.`)) return
    try { await deleteUser(u.user_id, adminAuth); toast(`Login ${u.username} deleted`); load() }
    catch (e) { toast(e.message) }
  }

  // Remove = mark the day they left, unless there is genuinely nothing to keep.
  async function removeStaff(st) {
    let use = { sessions: 0, upcoming: 0, bookings: 0 }
    try { use = await staffUsage(st.staff_id) } catch { /* fall through to the safe path */ }
    const u = userForStaff(st.staff_id)
    const history = use.sessions > 0 || use.bookings > 0

    if (!history) {
      const msg = `${st.name} is not on any course or booking, so their record can be deleted outright.\n\n`
        + (u ? `Their login "${u.username}" will be deleted too.\n\n` : '')
        + 'Delete permanently?\n\nCancel to mark them as having left instead, which keeps the record.'
      if (window.confirm(msg)) {
        try {
          if (u) await deleteUser(u.user_id, adminAuth)
          await deleteStaff(st.staff_id)
          toast(`${st.name} deleted`); load()
        } catch (e) { toast(e.message) }
        return
      }
    }

    const warn = use.upcoming > 0
      ? `\n\n${use.upcoming} course${use.upcoming === 1 ? '' : 's'} still to come ${use.upcoming === 1 ? 'has' : 'have'} them down to run it — ${use.upcoming === 1 ? 'it' : 'they'} will show in Needs attention as wanting a trainer.`
      : ''
    const msg = `Mark ${st.name} as having left?\n\n`
      + 'They come out of the staff list and out of every trainer and assessor picker. '
      + 'Everything they have already taught stays exactly as it is, and so does their record.'
      + warn
      + (u ? `\n\nTheir login "${u.username}" will be disabled — delete it separately on the Logins tab if you want it gone.` : '')
    if (!window.confirm(msg)) return
    try {
      await setStaffLeft(st.staff_id)
      if (u && u.is_active) await updateUser(u.user_id, { is_active: false }, adminAuth)
      toast(`${st.name} marked as left`); load()
    } catch (e) { toast(e.message) }
  }

  async function reinstate(st) {
    try { await setStaffLeft(st.staff_id, null); toast(`${st.name} is back on the staff list`); load() }
    catch (e) { toast(e.message) }
  }

  async function saveApprover(v) {
    setApprover(v)
    try {
      await saveSetting('holiday_approver_staff_id', v === '' ? null : Number(v), adminAuth)
      toast(v === '' ? 'Holiday requests will go to the admins' : 'Holiday approver set')
    } catch (e) { toast(e.message) }
  }

  function toggleShowLeft(v) {
    setShowLeft(v)
    load(adminAuth, { withLeft: v })
  }

  // ── the gate ───────────────────────────────────────────────────────────────
  // ── one person's own page ──────────────────────────────────────────────────
  const openStaff = staff.find((s) => s.staff_id === accFor)
  if (openStaff) {
    const u = userForStaff(openStaff.staff_id)
    const days = holDays(openStaff.staff_id)
    return (
      <>
        <button className="linkbtn" style={{ marginBottom: 14 }} onClick={() => setAccFor(null)}>← All staff</button>
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>👤 {openStaff.name}
            {openStaff.leftOn && <span className="b pend">Left {fmtDate(openStaff.leftOn)}</span>}
            {u && <span className="tag">{u.username} · {ROLE_LABELS[u.role] || u.role}</span>}
          </h3>
          <div className="body muted small">
            {openStaff.email || 'no email'} · {openStaff.room || 'no room set'} ·{' '}
            {days ? `${days} holiday ${days === 1 ? 'day' : 'days'}` : 'no holidays booked'}
          </div>
        </div>
        <StaffAccreditations
          staffId={openStaff.staff_id}
          staffName={openStaff.name}
          onCount={(rows) => setAccCounts((c) => ({ ...c, [openStaff.staff_id]: summarise(rows) }))}
        />
      </>
    )
  }

  const staffWithoutLogin = staff.filter((s) => !s.leftOn && !userForStaff(s.staff_id))
  const current = staff.filter((s) => !s.leftOn)

  return (
    <>
      <div className="seg-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={'btn sm' + (tab === k ? '' : ' ghost')} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'staff' && (
        <div className="card">
          <h3>🎓 Staff <span className="tag">{current.length} current</span>
            <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setShowAdd(!showAdd)}>＋ New staff member</button>
          </h3>

          <div className="body">
            <span className="muted small">
              Click a name to open their record and their accreditations. Logins and roles are on the next tab.
            </span>
            <label className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <input type="checkbox" checked={showLeft} onChange={(e) => toggleShowLeft(e.target.checked)} />
              Show past staff
            </label>
          </div>

          {showAdd && (
            <div className="body">
              <div className="subform">
                <div className="sfh">New staff member</div>
                <div className="twocol">
                  <Inp label="Full name" v={nu.name} on={(v) => setNu({ ...nu, name: v })} />
                  <Inp label="Email" v={nu.email} on={(v) => setNu({ ...nu, email: v })} />
                </div>
                <div className="twocol">
                  <Inp label="Room (optional)" v={nu.room} on={(v) => setNu({ ...nu, room: v })} />
                  <Inp label="Username (for login)" v={nu.username} on={(v) => setNu({ ...nu, username: v })} />
                </div>
                <div className="twocol">
                  <div className="field">
                    <label className="fl">Role</label>
                    <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </div>
                  <Inp label="Initial password" type="password" v={nu.password} on={(v) => setNu({ ...nu, password: v })} />
                </div>
                <div className="inrow">
                  <button className="btn sm" onClick={addStaff}>Create staff member</button>
                  <button className="btn ghost sm" onClick={() => setShowAdd(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {loading ? <div className="loading">Loading staff…</div> : (
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Room</th><th>Holidays</th><th>Accreditations</th><th>Actions</th></tr></thead>
              <tbody>
                {staff.length === 0 && <tr><td colSpan={6} className="empty">No staff yet — add the first one above.</td></tr>}
                {staff.map((st) => {
                  const u = userForStaff(st.staff_id)
                  const isSelf = u && currentUser && u.user_id === currentUser.user_id
                  const editing = editId === st.staff_id
                  const acc = accCounts[st.staff_id]
                  return (
                    <tr key={st.staff_id}>
                      {editing ? (
                        <>
                          <td><input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                          <td><input type="text" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></td>
                          <td><input type="text" value={editForm.room} onChange={(e) => setEditForm({ ...editForm, room: e.target.value })} /></td>
                        </>
                      ) : (
                        <>
                          <td>
                            <b className="dn-link" onClick={() => setAccFor(st.staff_id)} title="Open this person's record">{st.name}</b>
                            {isSelf && <span className="muted small"> (you)</span>}
                            {st.leftOn && <span className="b pend" style={{ marginLeft: 6 }}>Left {fmtDate(st.leftOn)}</span>}
                          </td>
                          <td className="muted">{st.email || '—'}</td>
                          <td className="muted small">{st.room || '—'}</td>
                        </>
                      )}
                      <td className="muted small">{holDays(st.staff_id) ? holDays(st.staff_id) + (holDays(st.staff_id) === 1 ? ' day' : ' days') : '—'}</td>
                      <td>
                        {acc?.expired > 0 && <span className="b fail">{acc.expired} expired</span>}
                        {acc?.expired > 0 && acc?.due > 0 && ' '}
                        {acc?.due > 0 && <span className="b due">{acc.due} expiring</span>}
                        {!acc?.expired && !acc?.due && <span className="muted small">{acc?.total ? `${acc.total} held` : '—'}</span>}
                      </td>
                      <td>
                        {editing ? (
                          <span className="inrow">
                            <button className="btn sm" onClick={() => saveEdit(st)}>Save</button>
                            <button className="btn ghost sm" onClick={() => setEditId(null)}>Cancel</button>
                          </span>
                        ) : (
                          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <button className="btn ghost sm" onClick={() => { setEditId(st.staff_id); setEditForm({ name: st.name || '', email: st.email || '', room: st.room || '' }) }}>Edit</button>
                            {st.leftOn
                              ? <button className="btn ghost sm" onClick={() => reinstate(st)}>Reinstate</button>
                              : <button className="btn ghost sm" disabled={isSelf} title={isSelf ? 'You cannot remove yourself' : 'Remove from the staff list'} onClick={() => removeStaff(st)}>Remove</button>}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'staff' && (
        <div className="card" style={{ marginTop: 18 }}>
          <h3>🏖 Who approves holidays</h3>
          <div className="body">
            <div className="twocol">
              <div className="field">
                <label className="fl">Approver</label>
                <select value={approver} onChange={(e) => saveApprover(e.target.value)}>
                  <option value="">Any admin</option>
                  {current.map((st) => <option key={st.staff_id} value={st.staff_id}>{st.name}</option>)}
                </select>
              </div>
            </div>
            <span className="muted small">
              Requests are emailed to this person, and they see them on their dashboard. Any admin can still approve,
              so nothing waits a fortnight while one person is away. Their own time off goes straight on the calendar.
            </span>
          </div>
        </div>
      )}

      {tab === 'access' && (
        <>
          <div className="hint">
            Logins are verified inside Postgres (bcrypt) and the accounts table is locked so the app key cannot read
            password hashes. <b>Disable</b> keeps the account and shuts the door; <b>Delete</b> removes the account
            entirely and leaves the person's staff record and history untouched.
          </div>

          <SessionCheck />

          <SignedInNow adminAuth={adminAuth} />

          <div className="card">
            <h3>🔑 Logins <span className="tag">{users.length}</span></h3>
            {loading ? <div className="loading">Loading accounts…</div> : (
              <table>
                <thead><tr><th>Username</th><th>Person</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {users.length === 0 && <tr><td colSpan={5} className="empty">No accounts.</td></tr>}
                  {users.map((u) => {
                    const isSelf = currentUser && u.user_id === currentUser.user_id
                    const st = staff.find((s) => s.staff_id === u.staffId)
                    return (
                      <tr key={u.user_id}>
                        <td><b>{u.username}</b>{isSelf && <span className="muted small"> (you)</span>}</td>
                        <td>
                          {st
                            ? <>{st.name}{st.leftOn && <span className="b pend" style={{ marginLeft: 6 }}>left</span>}</>
                            : <span className="muted small">{u.name || 'not a staff member'}</span>}
                        </td>
                        <td>
                          <select className="rolesel" value={u.role} disabled={isSelf}
                            title={isSelf ? 'You cannot change your own role' : 'Change role'}
                            onChange={(e) => changeRole(u, e.target.value)}>
                            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </select>
                        </td>
                        <td>{u.is_active ? <span className="b pass">Active</span> : <span className="b fail">Disabled</span>}</td>
                        <td>
                          {resetId === u.user_id ? (
                            <span className="inrow" style={{ maxWidth: 320 }}>
                              <input type="password" placeholder="new password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} />
                              <button className="btn sm" onClick={() => saveReset(u)}>Save</button>
                              <button className="btn ghost sm" onClick={() => { setResetId(null); setResetPw('') }}>✕</button>
                            </span>
                          ) : (
                            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              <button className="btn ghost sm" onClick={() => { setResetId(u.user_id); setResetPw('') }}>Reset password</button>
                              <button className="btn ghost sm" disabled={isSelf} onClick={() => toggleActive(u)}>{u.is_active ? 'Disable' : 'Enable'}</button>
                              <button className="btn ghost sm" disabled={isSelf} title={isSelf ? 'You cannot delete the account you are signed in as' : 'Delete this login'} onClick={() => removeUser(u)}>Delete</button>
                              {!st && (
                                <label className="staffchk" title="Give this account a staff record so they can be assigned to courses, holidays and calendar entries">
                                  <input type="checkbox" checked={false} onChange={() => makeStaff(u)} /> Staff member
                                </label>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {staffWithoutLogin.length > 0 && (
            <div className="card" style={{ marginTop: 18 }}>
              <h3>Staff without a login <span className="tag">{staffWithoutLogin.length}</span></h3>
              <div className="body"><span className="muted small">They can be put on courses, but they cannot sign in.</span></div>
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Actions</th></tr></thead>
                <tbody>
                  {staffWithoutLogin.map((st) => (
                    <tr key={st.staff_id}>
                      <td><b>{st.name}</b></td>
                      <td className="muted">{st.email || '—'}</td>
                      <td>
                        {loginFor === st.staff_id ? (
                          <span className="inrow" style={{ flexWrap: 'wrap', maxWidth: 420 }}>
                            <input type="text" placeholder="username" value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} style={{ maxWidth: 140 }} />
                            <select className="rolesel" value={loginForm.role} onChange={(e) => setLoginForm({ ...loginForm, role: e.target.value })}>
                              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                            <input type="password" placeholder="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} style={{ maxWidth: 130 }} />
                            <button className="btn sm" onClick={() => createLogin(st.staff_id)}>Save</button>
                            <button className="btn ghost sm" onClick={() => setLoginFor(null)}>✕</button>
                          </span>
                        ) : (
                          <button className="btn ghost sm" onClick={() => { setLoginFor(st.staff_id); setLoginForm({ username: (st.email || st.name || '').trim(), role: 'STANDARD', password: '' }) }}>Create login</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'email' && <EmailSettings adminAuth={adminAuth} />}

      {tab === 'sage' && <SageSettings adminAuth={adminAuth} currentUser={currentUser} />}

      {created && <CreatedModal u={created} onClose={() => setCreated(null)} />}
    </>
  )
}

function CreatedModal({ u, onClose }) {
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const text = `SGAS Training Management — your login details
Sign in at: ${origin}
Username: ${u.username}
Temporary password: ${u.password}
Role: ${ROLE_LABELS[u.role] || u.role}

Please sign in and change your password after your first login.`
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600) }
    catch { toast('Could not copy — select the text and copy manually') }
  }
  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Login created — share these details</h3>
        <p className="muted small">No email is sent yet. Copy this and pass it to {u.name || u.username} securely.</p>
        <textarea readOnly rows={7} value={text} onFocus={(e) => e.target.select()} />
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn" onClick={copy}>{copied ? '✓ Copied' : 'Copy details'}</button>
        </div>
      </div>
    </div>
  )
}

function Inp({ label, v, on, type = 'text' }) {
  return (
    <div className="field">
      <label className="fl">{label}</label>
      <input type={type} value={v} onChange={(e) => on(e.target.value)} />
    </div>
  )
}
