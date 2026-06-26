import { useState } from 'react'
import { LIVE } from '../lib/supabase.js'
import { appLogin } from '../lib/api.js'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const user = await appLogin(username, password)
      onLogin(user)
    } catch (ex) {
      setErr(ex.message || 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-lg">SGAS</div>
        <div className="brand-sub">Training Management — staff sign in</div>
        {err && <div className="login-err">{err}</div>}
        <div className="field">
          <label className="fl">Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </div>
        <div className="field">
          <label className="fl">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {LIVE ? (
          <div className="login-note">Accounts are managed in the app's Admin screen by an administrator.</div>
        ) : (
          <div className="login-note">Demo mode — password is <b>demo</b> for every account. Try <b>admin</b>, <b>reception</b> (standard), <b>scheduler</b>, <b>assessor</b>, or <b>accounts</b> to see each role's view.</div>
        )}
      </form>
    </div>
  )
}
