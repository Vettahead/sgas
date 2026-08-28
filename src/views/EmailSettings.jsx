import { useEffect, useState } from 'react'
import { getSmtpSettings, saveSmtpSettings, sendTestEmail, listEmailLog } from '../lib/api.js'
import { toast } from '../lib/toast.js'

// ─────────────────────────────────────────────────────────────────────────────
// Admin → Email settings.
//
// The password boxes are WRITE-ONLY. They start empty, they go back to empty
// after a save, and nothing the server returns can fill them — the API only
// ever reports WHETHER a password is stored, never the password itself. So an
// empty box means "keep the one already saved", and the only way to change one
// is to type a new one. A password you can read back off a screen is a password
// anyone who reaches that screen can read back.
//
// The server settings come pre-filled with SGAS's own, so in practice the only
// thing anyone ever types here is a password.
//
// Styling: this reuses the app's existing classes (.card / .body / .field /
// .fl / .inrow / .twocol / .btn / .b / .tag) and adds none of its own.
// ─────────────────────────────────────────────────────────────────────────────

const PORT_HINT = {
  465: 'SSL/TLS on connect — the usual choice, leave Secure ticked',
  587: 'STARTTLS — untick Secure for this one',
  25: 'Unencrypted — avoid unless the host insists',
}

export default function EmailSettings({ adminAuth }) {
  const [cfg, setCfg] = useState(null)
  const [pw, setPw] = useState({})          // key -> typed password. Never loaded, only sent.
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [testTo, setTestTo] = useState('')
  const [testFrom, setTestFrom] = useState('crm')
  const [log, setLog] = useState([])
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    (async () => {
      try { setCfg(await getSmtpSettings(adminAuth)) } catch (e) { setErr(e.message) }
    })()
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const setMb = (key, patch) => setCfg((c) => ({
    ...c, mailboxes: c.mailboxes.map((m) => (m.key === key ? { ...m, ...patch } : m)),
  }))

  async function save() {
    setBusy(true); setErr('')
    try {
      const next = await saveSmtpSettings({
        host: cfg.host, port: cfg.port, secure: cfg.secure,
        mailboxes: cfg.mailboxes.map((m) => ({
          key: m.key, address: m.address, username: m.username, from_name: m.from_name,
          // Only ever send a password that was typed in this session.
          password: pw[m.key] || null,
        })),
      }, adminAuth)
      setCfg(next)
      setPw({})                    // empty the boxes again the moment they are stored
      toast('Email settings saved')
    } catch (e) { setErr(e.message); toast(e.message) } finally { setBusy(false) }
  }

  async function clearPassword(key, address) {
    if (!window.confirm(`Remove the stored password for ${address}?\n\nNothing will send from it until you enter a new one.`)) return
    setBusy(true)
    try {
      setCfg(await saveSmtpSettings({
        host: cfg.host, port: cfg.port, secure: cfg.secure,
        mailboxes: [{ key, password: '__CLEAR__' }],
      }, adminAuth))
      toast('Password removed')
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  async function test() {
    if (!testTo) { toast('Enter an address to send the test to'); return }
    setBusy(true); setErr('')
    try {
      const r = await sendTestEmail({ mailbox: testFrom, to: testTo }, adminAuth)
      toast(r.demo ? 'Demo mode — nothing was actually sent' : `Test sent from ${r.from}`)
      if (showLog) setLog(await listEmailLog(adminAuth))
    } catch (e) {
      // The mail server's own words. That is what makes a failure diagnosable
      // instead of just "it didn't work".
      setErr(e.message); toast('The send failed — the reason is shown above')
    } finally { setBusy(false) }
  }

  async function toggleLog() {
    const next = !showLog
    setShowLog(next)
    if (next) { try { setLog(await listEmailLog(adminAuth)) } catch (e) { toast(e.message) } }
  }

  if (!cfg) {
    return (
      <div className="card" style={{ marginTop: 18 }}>
        <h3>✉️ Email settings</h3>
        <div className="body">{err ? <span className="b fail">{err}</span> : <span className="muted small">Loading…</span>}</div>
      </div>
    )
  }

  const ready = cfg.mailboxes.filter((m) => m.password_set).length

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h3>
        ✉️ Email settings
        <span className="tag">{ready} of {cfg.mailboxes.length} ready</span>
      </h3>

      <div className="body">
        <span className="muted small">
          Where the system sends from. Passwords are stored encrypted and are never shown again —
          leave a box empty to keep the one already saved.
        </span>
        {err && <p className="b fail" style={{ marginTop: 10 }}>{err}</p>}
      </div>

      <div className="body">
        <div className="twocol">
          <div className="field">
            <label className="fl">Outgoing server</label>
            <input value={cfg.host || ''} onChange={(e) => setCfg({ ...cfg, host: e.target.value })} />
          </div>
          <div className="field">
            <label className="fl">Port</label>
            <div className="inrow">
              <input type="number" value={cfg.port || ''} onChange={(e) => setCfg({ ...cfg, port: e.target.value })} />
              <label className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!cfg.secure}
                  onChange={(e) => setCfg({ ...cfg, secure: e.target.checked })} />
                Secure
              </label>
            </div>
          </div>
        </div>
        <span className="muted small">{PORT_HINT[Number(cfg.port)] || ''}</span>
      </div>

      <table>
        <thead>
          <tr><th>Mailbox</th><th>Shows as</th><th>Username</th><th>Password</th><th>Status</th></tr>
        </thead>
        <tbody>
          {cfg.mailboxes.map((m) => (
            <tr key={m.key}>
              <td><b>{m.address}</b></td>
              <td><input value={m.from_name || ''} placeholder="SGAS"
                onChange={(e) => setMb(m.key, { from_name: e.target.value })} /></td>
              <td><input value={m.username || ''}
                onChange={(e) => setMb(m.key, { username: e.target.value })} /></td>
              <td>
                <input type="password" autoComplete="new-password" value={pw[m.key] || ''}
                  placeholder={m.password_set ? '•••••••• stored' : 'not set yet'}
                  onChange={(e) => setPw({ ...pw, [m.key]: e.target.value })} />
              </td>
              <td>
                {m.password_set
                  ? <>
                      <span className="b pass">Stored</span>{' '}
                      <button className="btn ghost sm" disabled={busy}
                        onClick={() => clearPassword(m.key, m.address)}>remove</button>
                    </>
                  : <span className="b fail">Needed</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="body">
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</button>
        {cfg.updated_at && (
          <span className="muted small"> Last changed {new Date(cfg.updated_at).toLocaleString('en-GB')}</span>
        )}
      </div>

      <div className="body">
        <div className="twocol">
          <div className="field">
            <label className="fl">Send a test from</label>
            <select value={testFrom} onChange={(e) => setTestFrom(e.target.value)}>
              {cfg.mailboxes.map((m) => <option key={m.key} value={m.key}>{m.address}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="fl">To</label>
            <input value={testTo} placeholder="you@example.com" onChange={(e) => setTestTo(e.target.value)} />
          </div>
        </div>
        <button className="btn ghost sm" disabled={busy} onClick={test}>Send test email</button>{' '}
        <button className="btn ghost sm" onClick={toggleLog}>{showLog ? 'Hide' : 'Show'} what has been sent</button>
      </div>

      {showLog && (
        <table>
          <thead><tr><th>When</th><th>From</th><th>To</th><th>Subject</th><th>Result</th></tr></thead>
          <tbody>
            {log.length === 0 && <tr><td colSpan={5}><span className="muted small">Nothing sent yet.</span></td></tr>}
            {log.map((r, i) => (
              <tr key={i}>
                <td>{new Date(r.sent_at).toLocaleString('en-GB')}</td>
                <td>{r.mailbox}</td>
                <td>{r.to_address}</td>
                <td>{r.subject}</td>
                <td>
                  {r.ok ? <span className="b pass">Sent</span> : <span className="b fail">Failed</span>}
                  {!r.ok && r.error && <div className="muted small">{r.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
