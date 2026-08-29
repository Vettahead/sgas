import { useState } from 'react'
import { LIVE } from '../lib/supabase.js'
import { appLogin, requestPasswordReset } from '../lib/api.js'
import logoUrl from '../assets/sgas-logo.png'

// `notice` explains WHY they are looking at this screen when they did not ask
// to be. Without it, being signed out by an expired session is
// indistinguishable from the system having lost their login.
export default function Login({ onLogin, notice }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // Forgotten-password sits behind a link rather than on the form: it is the
  // rarer thing, and two password boxes on one screen invites the wrong one.
  const [forgot, setForgot] = useState(false)
  const [who, setWho] = useState('')
  const [sent, setSent] = useState(false)

  async function askReset(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try { await requestPasswordReset(who); setSent(true) }
    catch (ex) { setErr(ex.message || 'Could not send that') }
    finally { setBusy(false) }
  }

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

  if (forgot) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={askReset}>
          <img className="login-logo" src={logoUrl} alt="SGAS — Specialist Gas Assessment Services" />
          <div className="brand-sub">Forgotten your password?</div>
          {err && <div className="login-err">{err}</div>}
          {sent ? (
            <>
              {/* Deliberately the same message whether or not that account
                  exists — otherwise this form is a way to find out who works
                  here. */}
              <p className="muted small">
                If that matches an account, an email is on its way with a link to set a new password.
                It works once and lasts an hour. Check the junk folder if it does not appear.
              </p>
              <button type="button" className="btn" style={{ width: '100%' }}
                onClick={() => { setForgot(false); setSent(false); setWho('') }}>Back to sign in</button>
            </>
          ) : (
            <>
              <div className="field">
                <label className="fl">Username or email address</label>
                <input type="text" value={who} onChange={(e) => setWho(e.target.value)} autoFocus />
              </div>
              <button className="btn" style={{ width: '100%' }} disabled={busy}>
                {busy ? 'Sending…' : 'Email me a link'}
              </button>
              <button type="button" className="linkbtn" style={{ marginTop: 10 }}
                onClick={() => { setForgot(false); setErr('') }}>Back to sign in</button>
            </>
          )}
        </form>
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img className="login-logo" src={logoUrl} alt="SGAS — Specialist Gas Assessment Services" />
        <div className="brand-sub">Training Management — staff sign in</div>
        {notice && !err && <div className="login-info">{notice}</div>}
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
        <button type="button" className="linkbtn" style={{ marginTop: 10 }}
          onClick={() => { setForgot(true); setErr('') }}>Forgotten your password?</button>
        {LIVE ? (
          <div className="login-note">Accounts are managed in the app's Admin screen by an administrator.</div>
        ) : (
          <div className="login-note">Demo mode — password is <b>demo</b> for every account. Try <b>admin</b>, <b>reception</b> (standard), <b>scheduler</b>, <b>assessor</b>, or <b>accounts</b> to see each role's view.</div>
        )}
      </form>
    </div>
  )
}
