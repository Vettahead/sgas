import { useState } from 'react'
import { completePasswordReset } from '../lib/api.js'
import logoUrl from '../assets/sgas-logo.png'

// ─────────────────────────────────────────────────────────────────────────────
// The screen the emailed link opens. Reached before sign-in, because the whole
// point is that this person cannot sign in.
//
// The token in the URL is the only credential. It works once, it dies after an
// hour, and using it kills any other outstanding link for the same account —
// so a chain of "I clicked it twice" resets cannot leave a spare key lying
// around in somebody's inbox.
// ─────────────────────────────────────────────────────────────────────────────
export default function ResetPassword({ token, onDone }) {
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (pw !== again) { setErr('The two passwords do not match.'); return }
    if (pw.length < 8) { setErr('Choose a password of at least 8 characters.'); return }
    setBusy(true)
    try {
      await completePasswordReset(token, pw)
      setDone(true)
    } catch (ex) { setErr(ex.message || 'That link could not be used') } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <img className="login-logo" src={logoUrl} alt="SGAS — Specialist Gas Assessment Services" />
          <div className="brand-sub">Password changed</div>
          <p className="muted small">
            Your new password is saved, and we have emailed you to say so. Sign in with it now.
          </p>
          <button className="btn" style={{ width: '100%' }} onClick={onDone}>Go to sign in</button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img className="login-logo" src={logoUrl} alt="SGAS — Specialist Gas Assessment Services" />
        <div className="brand-sub">Choose a new password</div>
        {err && <div className="login-err">{err}</div>}
        <div className="field">
          <label className="fl">New password</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="new-password" />
        </div>
        <div className="field">
          <label className="fl">Type it again</label>
          <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
        </div>
        <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
        <div className="login-note">
          At least 8 characters. The link you used works once and stops working an hour after it was sent —
          if it has expired, ask for another from the sign-in screen.
        </div>
        <button type="button" className="linkbtn" style={{ marginTop: 10 }} onClick={onDone}>Back to sign in</button>
      </form>
    </div>
  )
}
