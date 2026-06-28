import { useEffect, useState } from 'react'
import { LIVE } from '../lib/supabase.js'
import { listUsers, createUser, updateUser, setUserPassword, listStaff, createStaff, updateStaff, listHolidays, weekdayDays } from '../lib/api.js'
import { ROLES, ROLE_LABELS } from '../lib/roles.js'
import { toast } from '../lib/toast.js'

// One place for staff: every staff person is assignable (Trainer/Assessor/Verifier)
// AND has a login with a role. Replaces the old separate Staff tab.
export default function Admin({ currentUser }) {
  const [unlocked, setUnlocked] = useState(!LIVE)
  const [adminAuth, setAdminAuth] = useState(LIVE ? null : undefined)
  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockErr, setUnlockErr] = useState('')

  const [users, setUsers] = useState([])
  const [staff, setStaff] = useState([])
  const [holidays, setHolidays] = useState([])
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

  async function load(auth) {
    setLoading(true)
    try { const [u, s, hol] = await Promise.all([listUsers(auth), listStaff(), listHolidays()]); setUsers(u); setStaff(s); setHolidays(hol) }
    catch (e) { toast(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (!LIVE) load(undefined) }, [])

  async function unlock(e) {
    e.preventDefault()
    setUnlockErr(''); setUnlocking(true)
    const auth = { username: currentUser.username, password: pw }
    try { await load(auth); setAdminAuth(auth); setUnlocked(true); setPw('') }
    catch (ex) { setUnlockErr(ex.message || 'Could not unlock') }
    finally { setUnlocking(false) }
  }

  const userForStaff = (staffId) => users.find((u) => u.staffId === staffId)
  const holDays = (staffId) => holidays.filter((h) => h.staffId === staffId).reduce((n, h) => n + weekdayDays(h.start, h.end), 0)

  async function addStaff() {
    if (!nu.name.trim()) return toast('Name is required')
    if (!nu.username.trim()) return toast('Username is required')
    if (!nu.password) return toast('Password is required')
    try {
      const st = await createStaff({ name: nu.name.trim(), email: nu.email, room: nu.room })
      await createUser({ username: nu.username.trim(), name: nu.name.trim(), email: nu.email, role: nu.role, password: nu.password, staffId: st.staff_id }, adminAuth)
      toast('Staff member created')
      setCreated({ username: nu.username.trim(), name: nu.name.trim(), email: nu.email, role: nu.role, password: nu.password })
      setNu({ name: '', email: '', room: '', username: '', role: 'STANDARD', password: '' })
      setShowAdd(false); load(adminAuth)
    } catch (e) { toast(e.message) }
  }
  async function createLogin(staffId) {
    if (!loginForm.username.trim() || !loginForm.password) return toast('Username and password required')
    const st = staff.find((s) => s.staff_id === staffId)
    try {
      await createUser({ username: loginForm.username.trim(), name: st?.name, email: st?.email, role: loginForm.role, password: loginForm.password, staffId }, adminAuth)
      toast('Login created')
      setCreated({ username: loginForm.username.trim(), name: st?.name, email: st?.email, role: loginForm.role, password: loginForm.password })
      setLoginFor(null); setLoginForm({ username: '', role: 'STANDARD', password: '' }); load(adminAuth)
    } catch (e) { toast(e.message) }
  }
  async function saveEdit(st) {
    try {
      await updateStaff(st.staff_id, { name: editForm.name, email: editForm.email, room: editForm.room })
      const u = userForStaff(st.staff_id)
      if (u) await updateUser(u.user_id, { name: editForm.name, email: editForm.email }, adminAuth)
      toast('Staff updated'); setEditId(null); load(adminAuth)
    } catch (e) { toast(e.message) }
  }
  async function changeRole(u, role) {
    if (role === u.role) return
    try { await updateUser(u.user_id, { role }, adminAuth); load(adminAuth) }
    catch (e) { toast(e.message) }
  }
  async function makeStaff(u) {
    try {
      const st = await createStaff({ name: u.name || u.username, email: u.email, room: '' })
      await updateUser(u.user_id, { staffId: st.staff_id }, adminAuth)
      toast(`${u.name || u.username} is now a staff member`)
      load(adminAuth)
    } catch (e) { toast(e.message) }
  }
  async function toggleActive(u) {
    try { await updateUser(u.user_id, { is_active: !u.is_active }, adminAuth); load(adminAuth) }
    catch (e) { toast(e.message) }
  }
  async function saveReset(u) {
    if (!resetPw) return toast('Enter a new password')
    try { await setUserPassword(u.user_id, resetPw, adminAuth); toast(`Password reset for ${u.username}`); setResetId(null); setResetPw('') }
    catch (e) { toast(e.message) }
  }

  if (!unlocked) {
    return (
      <div className="login-card" style={{ margin: '20px auto' }}>
        <div className="sfh" style={{ marginBottom: 12 }}>Confirm your password to manage staff</div>
        {unlockErr && <div className="login-err">{unlockErr}</div>}
        <form onSubmit={unlock}>
          <div className="field">
            <label className="fl">Your password ({currentUser.username})</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          </div>
          <button className="btn" style={{ width: '100%' }} disabled={unlocking}>{unlocking ? 'Checking…' : 'Unlock'}</button>
        </form>
      </div>
    )
  }

  const orphanAccounts = users.filter((u) => !u.staffId || !staff.some((s) => s.staff_id === u.staffId))

  return (
    <>
      <div className="hint">Everyone who delivers or assesses lives here. Adding a staff member creates both their <b>assignable record</b> (Trainer / Assessor / Verifier on a course block) and their <b>login</b> with a role. Logins are verified inside Postgres (bcrypt) and the accounts table is locked so the app key can't read password hashes.</div>

      <div className="card">
        <h3>🎓 Staff &amp; access <span className="tag">{staff.length} staff</span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setShowAdd(!showAdd)}>＋ New staff member</button>
        </h3>

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
            <thead><tr><th>Name</th><th>Email</th><th>Room</th><th>Holidays</th><th>Login</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {staff.length === 0 && <tr><td colSpan={8} className="empty">No staff yet — add the first one above.</td></tr>}
              {staff.map((st) => {
                const u = userForStaff(st.staff_id)
                const isSelf = u && currentUser && u.user_id === currentUser.user_id
                const editing = editId === st.staff_id
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
                        <td><b>{st.name}</b>{isSelf && <span className="muted small"> (you)</span>}</td>
                        <td className="muted">{st.email || '—'}</td>
                        <td className="muted small">{st.room || '—'}</td>
                      </>
                    )}
                    <td className="muted small">{holDays(st.staff_id) ? holDays(st.staff_id) + (holDays(st.staff_id) === 1 ? ' day' : ' days') : '—'}</td>
                    <td>{u ? <span>{u.username}</span> : <span className="muted small">no login</span>}</td>
                    <td>{u
                      ? <select className="rolesel" value={u.role} disabled={isSelf} title={isSelf ? "You can't change your own role" : 'Change role'} onChange={(e) => changeRole(u, e.target.value)}>
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      : '—'}</td>
                    <td>{u ? (u.is_active ? <span className="b pass">Active</span> : <span className="b fail">Disabled</span>) : <span className="muted small">—</span>}</td>
                    <td>
                      {editing ? (
                        <span className="inrow">
                          <button className="btn sm" onClick={() => saveEdit(st)}>Save</button>
                          <button className="btn ghost sm" onClick={() => setEditId(null)}>Cancel</button>
                        </span>
                      ) : (<span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button className="btn ghost sm" onClick={() => { setEditId(st.staff_id); setEditForm({ name: st.name || '', email: st.email || '', room: st.room || '' }) }}>Edit</button>
                      {u ? (
                        resetId === u.user_id ? (
                          <span className="inrow" style={{ maxWidth: 320 }}>
                            <input type="password" placeholder="new password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} />
                            <button className="btn sm" onClick={() => saveReset(u)}>Save</button>
                            <button className="btn ghost sm" onClick={() => { setResetId(null); setResetPw('') }}>✕</button>
                          </span>
                        ) : (
                          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <button className="btn ghost sm" onClick={() => { setResetId(u.user_id); setResetPw('') }}>Reset password</button>
                            <button className="btn ghost sm" disabled={isSelf} onClick={() => toggleActive(u)}>{u.is_active ? 'Disable' : 'Enable'}</button>
                          </span>
                        )
                      ) : (
                        loginFor === st.staff_id ? (
                          <span className="inrow" style={{ flexWrap: 'wrap', maxWidth: 380 }}>
                            <input type="text" placeholder="username" value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} style={{ maxWidth: 130 }} />
                            <select className="rolesel" value={loginForm.role} onChange={(e) => setLoginForm({ ...loginForm, role: e.target.value })}>
                              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                            <input type="password" placeholder="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} style={{ maxWidth: 120 }} />
                            <button className="btn sm" onClick={() => createLogin(st.staff_id)}>Save</button>
                            <button className="btn ghost sm" onClick={() => setLoginFor(null)}>✕</button>
                          </span>
                        ) : (
                          <button className="btn ghost sm" onClick={() => { setLoginFor(st.staff_id); setLoginForm({ username: (st.email || st.name || '').trim(), role: 'STANDARD', password: '' }) }}>Create login</button>
                        )
                      )}
                      </span>)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {orphanAccounts.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h3>🔑 Other accounts <span className="tag">{orphanAccounts.length}</span></h3>
          <div className="body" style={{ paddingBottom: 0 }}><span className="muted small">Logins not tied to a staff record (e.g. the original admin). Manage their role and access here.</span></div>
          <table>
            <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {orphanAccounts.map((u) => {
                const isSelf = currentUser && u.user_id === currentUser.user_id
                return (
                  <tr key={u.user_id}>
                    <td><b>{u.username}</b>{isSelf && <span className="muted small"> (you)</span>}</td>
                    <td>{u.name || '—'}</td>
                    <td>
                      <select className="rolesel" value={u.role} disabled={isSelf} onChange={(e) => changeRole(u, e.target.value)}>
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
                          <button className="btn ghost sm" title="Give this account a staff record so they can be assigned to courses, holidays and calendar entries" onClick={() => makeStaff(u)}>Make staff</button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

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
