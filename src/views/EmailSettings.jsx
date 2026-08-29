import { useEffect, useState } from 'react'
import {
  getSmtpSettings, saveSmtpSettings, sendTestEmail, listEmailLog,
  listEmailTemplates, saveEmailTemplate, previewEmailTemplate,
} from '../lib/api.js'
import { toast } from '../lib/toast.js'

// ─────────────────────────────────────────────────────────────────────────────
// Admin → Email.
//
// Three tabs, because this screen now holds three different jobs and stacking
// them made an already-long Admin page longer:
//   Server      — where it sends from, and a test send.
//   Wording     — what the automatic emails say. Editable, because Chris asked
//                 to be able to change them without a deploy.
//   What's sent — the log.
//
// The password boxes are WRITE-ONLY. They start empty, they go back to empty
// after a save, and nothing the server returns can fill them — the API only
// ever reports WHETHER a password is stored, never the password itself. So an
// empty box means "keep the one already saved", and the only way to change one
// is to type a new one. A password you can read back off a screen is a password
// anyone who reaches that screen can read back.
//
// Styling: this reuses the app's existing classes (.card / .body / .field /
// .fl / .inrow / .twocol / .seg-tabs / .cgroup / .btn / .b / .tag) and adds none
// of its own.
// ─────────────────────────────────────────────────────────────────────────────

const PORT_HINT = {
  465: 'SSL/TLS on connect — the usual choice, leave Secure ticked',
  587: 'STARTTLS — untick Secure for this one',
  25: 'Unencrypted — avoid unless the host insists',
}

// Kept in step with supabase/functions/send-email/wording.ts, which is what
// actually fills them in. If you add one there, add it here so it is offered.
const PLACEHOLDERS = [
  ['trainer', 'the trainer’s name'],
  ['course', 'the course name'],
  ['dates', 'the dates, e.g. Mon 14 – Wed 16 Sep 2026'],
  ['start', 'the first day only'],
  ['end', 'the last day only'],
  ['days', 'how long, e.g. 3 days'],
  ['room', 'their assigned room, or “to be confirmed”'],
  ['delegates', 'how many are booked on'],
  ['old_dates', 'the dates before the change (course moved only)'],
]

// Why nothing was sent. These are ordinary outcomes, not failures, so they are
// worded as statements rather than errors.
const SKIP_REASON = {
  template_off: 'This one is switched off, so nothing would be sent.',
  no_trainer: 'That course has no trainer on it.',
  no_email: 'That trainer has no email address on their record.',
  no_session: 'That course no longer exists.',
  no_staff: 'That person is not on the staff list.',
  already_sent: 'The same email went out in the last few minutes, so it was not repeated.',
}

export default function EmailSettings({ adminAuth }) {
  const [tab, setTab] = useState('server')
  const [cfg, setCfg] = useState(null)
  const [pw, setPw] = useState({})          // key -> typed password. Never loaded, only sent.
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [testTo, setTestTo] = useState('')
  const [testFrom, setTestFrom] = useState('crm')
  const [log, setLog] = useState(null)

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
      setLog(null)               // it is out of date now
    } catch (e) {
      // The mail server's own words. That is what makes a failure diagnosable
      // instead of just "it didn't work".
      setErr(e.message); toast('The send failed — the reason is shown above')
    } finally { setBusy(false) }
  }

  async function openLog() {
    setTab('log')
    if (log) return
    try { setLog(await listEmailLog(adminAuth)) } catch (e) { toast(e.message) }
  }

  if (!cfg) {
    return (
      <div className="card" style={{ marginTop: 18 }}>
        <h3>✉️ Email</h3>
        <div className="body">{err ? <span className="b fail">{err}</span> : <span className="muted small">Loading…</span>}</div>
      </div>
    )
  }

  const ready = cfg.mailboxes.filter((m) => m.password_set).length

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h3>
        ✉️ Email
        <span className="tag">{ready} of {cfg.mailboxes.length} mailboxes ready</span>
      </h3>

      <div className="body">
        <div className="seg-tabs">
          <button className={'btn sm' + (tab === 'server' ? '' : ' ghost')} onClick={() => setTab('server')}>Server</button>
          <button className={'btn sm' + (tab === 'wording' ? '' : ' ghost')} onClick={() => setTab('wording')}>Wording</button>
          <button className={'btn sm' + (tab === 'log' ? '' : ' ghost')} onClick={openLog}>What has been sent</button>
        </div>
        {err && <p className="b fail">{err}</p>}
      </div>

      {tab === 'server' && (
        <>
          <div className="body">
            <span className="muted small">
              Where the system sends from. Passwords are stored encrypted and are never shown again —
              leave a box empty to keep the one already saved.
            </span>
          </div>

          <div className="body">
            <div className="twocol">
              <div className="field">
                <label className="fl">Outgoing server</label>
                <input type="text" value={cfg.host || ''} onChange={(e) => setCfg({ ...cfg, host: e.target.value })} />
              </div>
              <div className="field">
                <label className="fl">Port</label>
                <div className="inrow">
                  <input type="text" inputMode="numeric" value={cfg.port || ''}
                    onChange={(e) => setCfg({ ...cfg, port: e.target.value })} />
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
                  <td><input type="text" value={m.from_name || ''} placeholder="SGAS"
                    onChange={(e) => setMb(m.key, { from_name: e.target.value })} /></td>
                  <td><input type="text" value={m.username || ''}
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
                <input type="text" value={testTo} placeholder="you@example.com"
                  onChange={(e) => setTestTo(e.target.value)} />
              </div>
            </div>
            <button className="btn ghost sm" disabled={busy} onClick={test}>Send test email</button>
          </div>
        </>
      )}

      {tab === 'wording' && <Wording adminAuth={adminAuth} mailboxes={cfg.mailboxes} />}

      {tab === 'log' && (
        <table>
          <thead><tr><th>When</th><th>From</th><th>To</th><th>Subject</th><th>Result</th></tr></thead>
          <tbody>
            {log === null && <tr><td colSpan={5}><span className="muted small">Loading…</span></td></tr>}
            {log !== null && log.length === 0 && <tr><td colSpan={5}><span className="muted small">Nothing sent yet.</span></td></tr>}
            {(log || []).map((r, i) => (
              <tr key={i}>
                <td className="muted nowrap">{new Date(r.sent_at).toLocaleString('en-GB')}</td>
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

// ─────────────────────────────────────────────────────────────────────────────
// The wording tab. One collapsible block per automatic email.
// ─────────────────────────────────────────────────────────────────────────────
function Wording({ adminAuth, mailboxes }) {
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(null)
  const [draft, setDraft] = useState({})     // key -> {subject, body, enabled, mailbox}
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      try { setRows(await listEmailTemplates(adminAuth)) } catch (e) { setErr(e.message) }
    })()
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (t) => draft[t.key] || t
  const patch = (key, p) => setDraft((d) => ({ ...d, [key]: { ...(d[key] || rows.find((r) => r.key === key)), ...p } }))
  const dirty = (t) => {
    const d = draft[t.key]
    return !!d && (d.subject !== t.subject || d.body !== t.body || d.enabled !== t.enabled || d.mailbox !== t.mailbox)
  }

  async function saveOne(t) {
    const d = edit(t)
    setBusy(true); setErr('')
    try {
      const next = await saveEmailTemplate({
        key: t.key, subject: d.subject, body: d.body, enabled: d.enabled, mailbox: d.mailbox,
      }, adminAuth)
      setRows(next)
      setDraft((x) => { const y = { ...x }; delete y[t.key]; return y })
      toast('Wording saved')
    } catch (e) { setErr(e.message); toast(e.message) } finally { setBusy(false) }
  }

  // The preview is built by the code that does the sending, against a real
  // course, so it cannot drift from what actually goes out. Unsaved edits are
  // NOT previewed — it renders what is stored, which is what would send.
  async function showPreview(t) {
    setBusy(true); setErr(''); setPreview(null)
    try {
      const r = await previewEmailTemplate(t.key, adminAuth)
      if (r.demo) setErr('Previews need the live system — the demo has no courses to render against.')
      else if (r.none) setErr('No course has a trainer on it yet, so there is nothing to preview against.')
      else if (r.skipped) setErr(SKIP_REASON[r.skipped] || `Nothing to preview (${r.skipped}).`)
      else setPreview({ key: t.key, ...r })
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (err && !rows) return <div className="body"><span className="b fail">{err}</span></div>
  if (!rows) return <div className="body"><span className="muted small">Loading…</span></div>

  return (
    <>
      <div className="body">
        <span className="muted small">
          What the system sends on its own. Anything in double braces is filled in when it sends —
          the list is under each one. Switch one off and it stops going out; nothing else changes.
        </span>
        {err && <p className="b fail">{err}</p>}
      </div>

      <div className="body">
        {rows.map((t) => {
          const d = edit(t)
          const isOpen = open === t.key
          return (
            <div className={'cgroup' + (isOpen ? '' : ' collapsed')} key={t.key}>
              <div className="ch" onClick={() => setOpen(isOpen ? null : t.key)}>
                <span className="tw">▼</span>
                <span className="nm">{t.name}</span>
                {t.enabled ? <span className="b pass">On</span> : <span className="b pend">Off</span>}
                {dirty(t) && <span className="b due">Unsaved</span>}
                <span className="ct">{t.mailbox}</span>
              </div>
              <div className="cbody">
                <span className="muted small">{t.description}</span>

                <div className="field" style={{ marginTop: 10 }}>
                  <label className="fl">Subject</label>
                  <input type="text" value={d.subject || ''}
                    onChange={(e) => patch(t.key, { subject: e.target.value })} />
                </div>

                <div className="field">
                  <label className="fl">Message</label>
                  <textarea rows={12} value={d.body || ''}
                    onChange={(e) => patch(t.key, { body: e.target.value })} />
                </div>

                <div className="twocol">
                  <div className="field">
                    <label className="fl">Send from</label>
                    <select value={d.mailbox} onChange={(e) => patch(t.key, { mailbox: e.target.value })}>
                      {mailboxes.map((m) => <option key={m.key} value={m.key}>{m.address}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="fl">Switched on</label>
                    <label className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={!!d.enabled}
                        onChange={(e) => patch(t.key, { enabled: e.target.checked })} />
                      Send this one
                    </label>
                  </div>
                </div>

                <div className="banner">
                  <b className="small">You can use:</b>{' '}
                  {PLACEHOLDERS.map(([name, what]) => (
                    <span key={name} className="muted small" style={{ display: 'block' }}>
                      <b>{`{{${name}}}`}</b> — {what}
                    </span>
                  ))}
                </div>

                <div style={{ marginTop: 10 }}>
                  <button className="btn sm" disabled={busy || !dirty(t)} onClick={() => saveOne(t)}>
                    {busy ? 'Saving…' : 'Save wording'}
                  </button>{' '}
                  <button className="btn ghost sm" disabled={busy} onClick={() => showPreview(t)}>
                    Preview
                  </button>{' '}
                  {t.updated_at && (
                    <span className="muted small">Last changed {new Date(t.updated_at).toLocaleString('en-GB')}</span>
                  )}
                </div>

                {preview && preview.key === t.key && (
                  <div className="hint" style={{ marginTop: 10 }}>
                    <div className="small"><b>To:</b> {preview.to}</div>
                    <div className="small"><b>Subject:</b> {preview.subject}</div>
                    <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{preview.text}</div>
                    <div className="muted small" style={{ marginTop: 8 }}>
                      Built from a real course, by the same code that sends it. Save first to preview an edit.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
