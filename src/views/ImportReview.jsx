import { useEffect, useState } from 'react'
import { LIVE } from '../lib/supabase.js'
import { listImportReview, actOnImportReview } from '../lib/api.js'
import { toast } from '../lib/toast.js'

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS → IMPORT REVIEW
//
// 4,674 assessment records came out of the old database belonging to about
// 3,164 people, and working out which records belong to the same person was
// done on the National Insurance number: it settled 97.5% of them outright.
//
// The rest are here, because the two ways of getting it wrong are not equally
// bad. Two people merged into one record is unrecoverable — their tickets,
// expiry dates and renewal letters are mixed together and nothing in the data
// says so. One person split into two is a duplicate: obvious, and joined back
// together in one click. So wherever it was not certain, it split, and left the
// question for somebody who knows these people.
//
// There is no clever ranking or confidence score here on purpose. Every one of
// these needs a human to look at two names, or two birthdays, and say which is
// which. What the screen owes them is the evidence, laid out plainly: every
// spelling of the name, every date of birth, and every date they were in.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (d) => (d ? String(d).split('-').reverse().join('/') : '—')

export default function ImportReview({ currentUser }) {
  const [auth, setAuth] = useState(null)
  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [err, setErr] = useState('')

  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState({})     // person_key -> chosen dob / client to merge into
  const [done, setDone] = useState([])

  async function load(a) { setRows(await listImportReview(a)) }

  async function unlock(e) {
    e.preventDefault()
    setErr(''); setUnlocking(true)
    const a = { username: currentUser.username, password: pw }
    try { await load(a); setAuth(a); setPw('') }
    catch (ex) {
      const m = String(ex.message || '')
      setErr(/Password incorrect|Not authorized/i.test(m)
        ? `That password does not match ${currentUser.username}.` : m || 'Could not unlock')
    } finally { setUnlocking(false) }
  }

  useEffect(() => { if (!LIVE) setAuth(undefined) }, [])

  async function act(r, action, extra = {}) {
    setBusy(true)
    try {
      const out = await actOnImportReview({ personKey: r.person_key, action, ...extra }, auth)
      setDone((d) => [{ key: r.person_key, who: `${r.forename} ${r.surname}`.trim(), said: out.said }, ...d].slice(0, 6))
      setRows((xs) => xs.filter((x) => x.person_key !== r.person_key))
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  if (!LIVE) {
    return <div className="card" style={{ marginTop: 18 }}><div className="body">
      <span className="muted small">There is nothing to review in the demo — this reads the imported records.</span>
    </div></div>
  }

  if (!auth) {
    return (
      <div className="login-card" style={{ margin: '20px auto' }}>
        <div className="sfh" style={{ marginBottom: 12 }}>Confirm your password to open the review</div>
        {err && <div className="login-err">{err}</div>}
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
      <div className="card" style={{ marginTop: 14 }}>
        <h3>People worth a second look{rows.length ? <span className="tag">{rows.length} left</span> : null}</h3>
        <div className="body">
          <span className="muted small">
            The old database held 4,674 assessments belonging to about 3,164 people, and the National Insurance number
            sorted 97.5% of them on its own. These are the ones it would not call. Where it was unsure it kept them
            apart rather than joining them, because two people merged into one record cannot be untangled afterwards —
            their tickets and renewal dates end up mixed with nobody any the wiser — whereas a record that turns out to
            be a duplicate is joined back together in one click. Nothing here is urgent and nothing expires: an
            unanswered question just stays, and the records work normally meanwhile.
          </span>
        </div>
      </div>

      {done.length > 0 && (
        <div className="card">
          <div className="body">
            {done.map((d) => (
              <div key={d.key}><span className="b pass">Done</span> <span className="muted small">{d.who} — {d.said}</span></div>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card"><div className="body">
          <span className="muted small">Nothing left to look at. Every imported person has been accounted for.</span>
        </div></div>
      ) : rows.map((r) => {
        const p = pick[r.person_key] || {}
        const dobs = (r.dobs || []).filter(Boolean)
        const names = (r.names || []).filter(Boolean)
        const seen = (r.seen || []).filter(Boolean)
        const cands = r.candidates || []
        return (
          <div className="card" key={r.person_key}>
            <h3>{r.forename} {r.surname} {r.n1 ? <span className="tag">{r.n1}</span> : <span className="tag">no N1 number</span>}</h3>
            <div className="body">
              <div><span className="b pend">{r.why}</span></div>

              <div style={{ marginTop: 10 }}>
                <span className="muted small">
                  Written {names.length === 1 ? 'as' : `${names.length} ways:`} {names.join(' · ')}
                </span>
              </div>
              <div>
                <span className="muted small">
                  {dobs.length > 1 ? 'Two dates of birth on file: ' : 'Date of birth: '}
                  {dobs.length ? dobs.map(fmt).join('  or  ') : 'none'}
                </span>
              </div>
              <div>
                <span className="muted small">
                  {r.records} assessment{r.records === 1 ? '' : 's'}
                  {seen.length ? `, most recently ${fmt(seen[0])}` : ''}
                </span>
              </div>

              {/* Which birthday is right. Nearly always a transposed day and
                  month, so both are shown and neither is preferred. */}
              {dobs.length > 1 && (
                <div className="inrow" style={{ marginTop: 12 }}>
                  <select value={p.dob || ''} disabled={busy}
                    onChange={(e) => setPick((x) => ({ ...x, [r.person_key]: { ...p, dob: e.target.value } }))}>
                    <option value="">— which date of birth is right? —</option>
                    {dobs.map((d) => <option key={d} value={d}>{fmt(d)}</option>)}
                  </select>
                  <button className="btn sm" disabled={busy || !p.dob}
                    onClick={() => act(r, 'set_dob', { dob: p.dob })}>Use that one</button>
                </div>
              )}

              {/* Somebody already on file this might be the same as. */}
              {cands.length > 0 && (
                <div className="inrow" style={{ marginTop: 12 }}>
                  <select value={p.into || ''} disabled={busy}
                    onChange={(e) => setPick((x) => ({ ...x, [r.person_key]: { ...p, into: e.target.value } }))}>
                    <option value="">— the same person as… —</option>
                    {cands.map((c) => (
                      <option key={c.client_id} value={c.client_id}>
                        {c.name.trim()}{c.dob ? ` · born ${fmt(c.dob)}` : ''}{c.n1 ? ` · ${c.n1}` : ''}
                      </option>
                    ))}
                  </select>
                  <button className="btn sm" disabled={busy || !p.into}
                    onClick={() => act(r, 'merge', { intoClientId: Number(p.into) })}>Join them together</button>
                </div>
              )}

              <div className="inrow" style={{ marginTop: 12 }}>
                <button className="btn sm ghost" disabled={busy} onClick={() => act(r, 'ok')}>
                  This is right — leave it
                </button>
                <span className="muted small">
                  {cands.length === 0 && dobs.length <= 1
                    ? 'Nobody on file looks like a match, so the only thing to say is whether this one is right.'
                    : 'Joining moves every assessment onto the other record and removes the duplicate.'}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
