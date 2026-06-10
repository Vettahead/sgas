import { useEffect, useState } from 'react'
import { LIVE } from '../lib/supabase.js'
import { listUsers, createUser, updateUser, setUserPassword } from '../lib/api.js'
import { ROLES, ROLE_LABELS } from '../lib/roles.js'
import { toast } from '../lib/toast.js'

export default function Admin({ currentUser }) {
  // In live mode the admin re-confirms their password to unlock management
  // (it is verified in the database). In demo mode no unlock is needed.
  const [unlocked, setUnlocked] = useState(!LIVE)
  const [adminAuth, setAdminAuth] = useState(LIVE ? null : undefined)
  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockErr, setUnlockErr] = useState('')

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(!LIVE)
  const [showAdd, setShowAdd] = useState(false)
  const [nu, setNu] = useState({ username: '', name: '', email: '', role: 'STANDARD', password: '' })
  const [resetId, setResetId] = useState(null)
  const [resetPw, setResetPw] = useState('')

  async function load(auth) {
    setLoading(true)
    try { setUsers(await listUsers(auth)) }
    catch (e) { toast(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (!LIVE) load(undefined) }, [])

  async function unlock(e) {
    e.preventDefault()
    setUnlockErr(''); setUnlocking(true)
    const auth = { username: currentUser.username, password: pw }
    try {
      const list = await listUsers(auth)
      setUsers(list); setAdminAuth(auth); setUnlocked(true); setPw('')
    } catch (ex) {
      setUnlockErr(ex.message || 'Could not unlock')
    } finally { setUnlocking(false) }
  }

  async function add() {
    try {
      await createUser(nu, adminAuth)
      toast(`User created: ${nu.username}`)
      setNu({ username: '', name: '', email: '', role: 'STANDARD', password: '' })
      setShowAdd(false)
      load(adminAuth)
    } catch (e) { toast(e.message) }
  }
  async function changeRole(u, role) {
    if (role === u.role) return
    try { await updateUser(u.user_id, { role }, adminAuth); load(adminAuth) }
    catch (e) { toast(e.message) }
  }
  async function toggleActive(u) {
    try { await updateUser(u.user_id, { is_active: !u.is_active }, adminAuth); load(adminAuth) }
    catch (e) { toast(e.message) }
  }
  async function saveReset(u) {
    if (!resetPw) return toast('Enter a new password')
    try {
      await setUserPassword(u.user_id, resetPw, adminAuth)
      toast(`Password reset for ${u.username}`)
      setResetId(null); setResetPw('')
    } catch (e) { toast(e.message) }
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

  return (
    <>
      <div className="hint">Staff accounts live in your database and are managed here. In live mode, logins are verified inside Postgres (bcrypt) and the accounts table is locked so the app key can't read password hashes. Each <b>role</b> sees only the screens it needs — Admin sees everything; Standard is reception; Scheduler builds the timetable; Assessor marks results; Accounts handles payments.</div>
      <div className="card">
        <h3>👥 Staff accounts <span className="tag">{users.length} users</span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setShowAdd(!showAdd)}>＋ New user</button>
        </h3>

        {showAdd && (
          <div className="body">
            <div className="subform">
              <div className="sfh">New staff account</div>
              <div className="twocol">
                <Inp label="Username" v={nu.username} on={(v) => setNu({ ...nu, username: v })} />
                <Inp label="Full name" v={nu.name} on={(v) => setNu({ ...nu, name: v })} />
              </div>
              <div className="twocol">
                <Inp label="Email" v={nu.email} on={(v) => setNu({ ...nu, email: v })} />
                <div className="field">
                  <label className="fl">Role</label>
                  <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
              </div>
              <Inp label="Initial password" type="password" v={nu.password} on={(v) => setNu({ ...nu, password: v })} />
              <div className="inrow">
                <button className="btn sm" onClick={add}>Create user</button>
                <button className="btn ghost sm" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {loading ? <div className="loading">Loading users…</div> : (
          <table>
            <thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map((u) => {
                const isSelf = currentUser && u.user_id === currentUser.user_id
                return (
                  <tr key={u.user_id}>
                    <td><b>{u.username}</b>{isSelf && <span className="muted small"> (you)</span>}</td>
                    <td>{u.name || '—'}</td>
                    <td className="muted">{u.email || '—'}</td>
                    <td><span className={'b ' + (u.role === 'ADMIN' ? 'due' : 'scheme')}>{ROLE_LABELS[u.role] || u.role}</span></td>
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
                          <select className="rolesel" value={u.role} disabled={isSelf} title={isSelf ? "You can't change your own role" : 'Change role'} onChange={(e) => changeRole(u, e.target.value)}>
                            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </select>
                          <button className="btn ghost sm" disabled={isSelf} onClick={() => toggleActive(u)}>{u.is_active ? 'Disable' : 'Enable'}</button>
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
    </>
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
