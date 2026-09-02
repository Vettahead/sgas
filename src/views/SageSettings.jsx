import { useEffect, useState } from 'react'
import {
  getSageStatus, saveSageApp, disconnectSage,
  startSageConnect, exchangeSageCode, syncSage, sageRedirectUri,
} from '../lib/api.js'
import { toast } from '../lib/toast.js'

// ─────────────────────────────────────────────────────────────────────────────
// Admin → Sage.
//
// READ ONLY, and the screen says so more than once on purpose. Jen's answer to
// the integration proposal was "stay with phase 1": SGAS reads whether an
// invoice has been paid and never writes anything into her accounts. Three
// things enforce it — the `readonly` scope Sage itself honours, an Edge
// Function with no write verb, and no database function that composes anything
// sendable. Somebody arriving at this screen in a year should be able to tell
// that from the screen, not only from the code.
//
// THE SECRET BOX IS WRITE-ONLY, same convention as the SMTP passwords: it
// starts empty, empties again after a save, and nothing the server returns can
// fill it. The API only ever reports WHETHER a secret is stored. An empty box
// means "keep the one already saved".
//
// THE RETURN FROM SAGE. Sage redirects the browser to the app root with
// ?code=… — App.jsx lifts it into sessionStorage and cleans the address bar
// before anything renders, so the code never sits in history or in a
// screenshot. This screen picks it up from there on mount, checks it against
// the state it issued, and completes the handshake.
//
// Styling: existing classes only (.card / .body / .subform / .field / .fl /
// .inrow / .twocol / .btn / .b / .tag / .hint / .pc-msg). No new CSS.
// ─────────────────────────────────────────────────────────────────────────────

export const SAGE_CODE_KEY = 'sgas.sage.code'     // set by App.jsx on the way back
export const SAGE_STATE_KEY = 'sgas.sage.state'   // set here on the way out

const fmtWhen = (t) => (t
  ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '')

export default function SageSettings({ adminAuth, currentUser }) {
  const [st, setSt] = useState(null)
  const [clientId, setClientId] = useState('')
  const [secret, setSecret] = useState('')       // typed only, never loaded
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [sync, setSync] = useState(null)

  async function load() {
    const s = await getSageStatus(adminAuth)
    setSt(s)
    setClientId(s?.client_id || '')
    return s
  }

  useEffect(() => {
    (async () => {
      try {
        await load()
        // Did we just come back from Sage?
        const code = sessionStorage.getItem(SAGE_CODE_KEY)
        if (code) await finish(code)
      } catch (e) { setErr(e.message) }
    })()
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── completing the handshake ───────────────────────────────────────────────
  async function finish(code) {
    // Whatever happens next, that code is used up. Clearing it first means a
    // refresh cannot replay a failed exchange over and over.
    sessionStorage.removeItem(SAGE_CODE_KEY)
    setBusy(true); setErr(''); setNote('')
    try {
      const r = await exchangeSageCode({ code, connectedBy: currentUser?.username || null }, adminAuth)
      await load()
      setNote(r.business
        ? `Connected to ${r.business}. Nothing can be written to it — the connection is read only.`
        : 'Connected. Nothing can be written to Sage — the connection is read only.')
      toast('Connected to Sage')
    } catch (e) {
      setErr(e.message)
      toast('The connection could not be completed — the reason is on the screen')
    } finally {
      sessionStorage.removeItem(SAGE_STATE_KEY)
      setBusy(false)
    }
  }

  // ── saving the registered app ──────────────────────────────────────────────
  async function saveApp() {
    setBusy(true); setErr(''); setNote('')
    try {
      const s = await saveSageApp({ clientId: clientId.trim(), clientSecret: secret || null }, adminAuth)
      setSt(s); setSecret('')          // empty the box the moment it is stored
      setNote('Saved.')
      toast('Sage app details saved')
    } catch (e) { setErr(e.message); toast(e.message) } finally { setBusy(false) }
  }

  async function clearSecret() {
    if (!window.confirm('Remove the stored client secret?\n\nThe connection will stop working until a new one is entered.')) return
    setBusy(true)
    try {
      setSt(await saveSageApp({ clientId: null, clientSecret: '__CLEAR__' }, adminAuth))
      toast('Client secret removed')
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  // ── going to Sage ──────────────────────────────────────────────────────────
  async function connect() {
    setBusy(true); setErr(''); setNote('')
    try {
      const r = await startSageConnect(adminAuth)
      if (r.demo) { setNote('Demo mode — there is no Sage to connect to.'); return }
      // Kept so the way back can be checked against the way out.
      sessionStorage.setItem(SAGE_STATE_KEY, r.state)
      window.location.assign(r.url)
    } catch (e) { setErr(e.message); toast(e.message); setBusy(false) }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect from Sage?\n\nThe stored tokens are destroyed and payment status stops updating. Nothing in Sage is changed, and the invoices already read are kept along with any matches made by hand.')) return
    setBusy(true); setErr('')
    try { setSt(await disconnectSage(adminAuth)); toast('Disconnected from Sage') }
    catch (e) { setErr(e.message); toast(e.message) } finally { setBusy(false) }
  }

  async function runSync() {
    setBusy(true); setErr(''); setNote(''); setSync(null)
    try {
      const r = await syncSage({}, adminAuth)
      setSync(r)
      await load()
      toast(r.demo ? 'Demo mode — nothing was read' : `Read ${r.read} invoices from Sage`)
    } catch (e) { setErr(e.message); toast('The sync failed — the reason is on the screen') }
    finally { setBusy(false) }
  }

  if (!st) {
    return (
      <div className="card" style={{ marginTop: 18 }}>
        <h3>🧾 Sage</h3>
        <div className="body">{err ? <span className="b fail">{err}</span> : <span className="muted small">Loading…</span>}</div>
      </div>
    )
  }

  // One sentence for the state of the thing, chosen so the next step is obvious.
  const stage = !st.client_id ? 'no_app'
    : !st.client_secret_set ? 'no_secret'
      : !st.connected ? 'not_connected' : 'connected'
  const STAGE_TAG = {
    no_app: ['pend', 'Not set up'],
    no_secret: ['due', 'Secret needed'],
    not_connected: ['due', 'Not connected'],
    connected: ['pass', 'Connected'],
  }
  const [tagClass, tagText] = STAGE_TAG[stage]

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h3>
        🧾 Sage
        <span className="tag"><span className={'b ' + tagClass}>{tagText}</span></span>
      </h3>

      <div className="body">
        <p className="muted small" style={{ marginTop: 0 }}>
          SGAS asks Sage whether an invoice has been paid, so the outstanding and chase lists
          look after themselves. <b>Nothing is ever written to Sage.</b> The connection is granted
          read-only permission, so a write would be refused by Sage itself even if this system
          asked for one — and it has no way to ask.
        </p>
        {err && <p className="b fail">{err}</p>}
        {note && <p className="pc-msg ok">{note}</p>}
      </div>

      {/* ── 1. the registered app ─────────────────────────────────────────── */}
      <div className="body">
        <div className="subform">
          <div className="sfh">The Sage app</div>
          <p className="muted small" style={{ marginTop: 0 }}>
            From the Sage developer portal. The secret is stored encrypted and is never shown
            again — leave the box empty to keep the one already saved.
          </p>
          <div className="twocol">
            <div className="field">
              <label className="fl" htmlFor="sage-cid">Client id</label>
              <input id="sage-cid" type="text" value={clientId} autoComplete="off"
                onChange={(e) => setClientId(e.target.value)} placeholder="from the Sage portal" />
            </div>
            <div className="field">
              <label className="fl" htmlFor="sage-secret">
                Client secret {st.client_secret_set && <span className="b pass">stored</span>}
              </label>
              <input id="sage-secret" type="password" value={secret} autoComplete="new-password"
                onChange={(e) => setSecret(e.target.value)}
                placeholder={st.client_secret_set ? 'leave empty to keep the stored one' : 'paste it here'} />
            </div>
          </div>
          <div className="inrow">
            <button className="btn" disabled={busy} onClick={saveApp}>Save</button>
            {st.client_secret_set && (
              <button className="btn ghost sm" disabled={busy} onClick={clearSecret}>Remove stored secret</button>
            )}
          </div>
          <p className="muted small">
            The return address registered with Sage must be exactly <b>{sageRedirectUri() || 'the app address'}</b>,
            including the trailing slash.
          </p>
        </div>
      </div>

      {/* ── 2. the connection ─────────────────────────────────────────────── */}
      <div className="body">
        <div className="subform">
          <div className="sfh">Connection</div>
          {st.connected ? (
            <>
              <table>
                <tbody>
                  <tr>
                    <td>Business</td>
                    <td><b>{st.business_name || st.business_id || 'unknown'}</b></td>
                  </tr>
                  <tr>
                    <td>Permission</td>
                    <td><span className="b pass">read only</span> <span className="muted small">Sage will refuse any write</span></td>
                  </tr>
                  <tr>
                    <td>Connected</td>
                    <td className="muted nowrap">
                      {fmtWhen(st.connected_at)}{st.connected_by ? ` by ${st.connected_by}` : ''}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="inrow">
                <button className="btn ghost" disabled={busy} onClick={disconnect}>Disconnect</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 0 }}>
                {stage === 'no_app' && 'Enter the client id and secret above first.'}
                {stage === 'no_secret' && 'The client id is saved. Enter the secret above, then connect.'}
                {stage === 'not_connected' && 'You will be sent to Sage to sign in and approve read-only access, then brought back here.'}
              </p>
              <div className="inrow">
                <button className="btn" disabled={busy || stage !== 'not_connected'} onClick={connect}>
                  Connect to Sage
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 3. reading ────────────────────────────────────────────────────── */}
      {st.connected && (
        <div className="body">
          <div className="subform">
            <div className="sfh">Payment status</div>
            <table>
              <tbody>
                <tr>
                  <td>Last checked</td>
                  <td>
                    {st.last_sync_at
                      ? <span className="muted nowrap">{fmtWhen(st.last_sync_at)}</span>
                      : <span className="muted small">never</span>}
                    {' '}
                    {st.last_sync_ok === true && <span className="b pass">ok</span>}
                    {st.last_sync_ok === false && <span className="b fail">failed</span>}
                  </td>
                </tr>
                {st.last_sync_error && (
                  <tr>
                    <td>What went wrong</td>
                    <td className="small">{st.last_sync_error}</td>
                  </tr>
                )}
                <tr>
                  <td>Invoices not yet matched</td>
                  <td>
                    {st.unmatched_invoices > 0
                      ? <span className="b due">{st.unmatched_invoices}</span>
                      : <span className="b pass">none</span>}
                    <span className="muted small"> — an invoice has to be tied to a booking before its payment status can show against one</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="inrow">
              <button className="btn" disabled={busy} onClick={runSync}>Sync now</button>
            </div>
            {sync && (
              <p className="pc-msg ok">
                Read {sync.read} invoice{sync.read === 1 ? '' : 's'} from Sage,
                {' '}updated {sync.applied} booking{sync.applied === 1 ? '' : 's'}.
              </p>
            )}
            <p className="hint">
              Matching invoices to bookings is not built yet, so no booking will change until it is.
              Sage never creates the invoice on our side, which means nothing links the two on its own —
              that is the next piece of work, and it needs a decision from SGAS about how they would
              like it done.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
