import { useEffect, useState } from 'react'
import { LIVE } from '../lib/supabase.js'
import {
  listImportMappings, saveImportMapping, acceptImportProposals,
  listCategories, listStaff,
} from '../lib/api.js'
import { toast } from '../lib/toast.js'

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS → DATA IMPORT
//
// The Access database names its qualifications and its staff in free text, with
// twenty years of typos in it: "S GASDSDON", "S GADSDON", "S GASDSON" and "S G"
// are all Simon; OFT201 is our OFTEC201; cen1 is ticked 1,783 times and has no
// home in our catalogue at all.
//
// A computer can guess at those. It should not act on a guess — an import that
// silently invents a qualification is worse than one that stops and asks. So
// every distinct value in the file gets a row here, and this screen is where a
// person answers it. Nothing is imported until they have.
//
// ONE CONTROL PER ROW, deliberately. A dropdown that already contains the
// suggestion, the option to create the thing, and the option to ignore it —
// picking saves immediately. Three buttons and a text box per row would be
// more flexible and nobody would ever get to the end of the list.
// ─────────────────────────────────────────────────────────────────────────────

const KINDS = [
  ['qualification', 'Qualifications', 'Each tick column in the Access file. Map it to one of ours, create it, or ignore it.'],
  ['staff', 'Assessors, verifiers and trainers', 'Every name that appears against an assessment. Most have left — map those to a past staff record so the history keeps their name.'],
]

const BADGE = {
  exact: ['pass', 'exact match'],
  likely: ['due', 'probably'],
  none: ['pend', 'no match'],
  not_qual: ['pend', 'not a qualification'],
}

export default function ImportMapping({ currentUser }) {
  const [auth, setAuth] = useState(null)
  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [err, setErr] = useState('')

  const [rows, setRows] = useState([])
  const [cats, setCats] = useState([])
  const [staff, setStaff] = useState([])
  const [kind, setKind] = useState('qualification')
  const [onlyTodo, setOnlyTodo] = useState(true)
  const [busy, setBusy] = useState(false)

  async function load(a) {
    const [m, c, s] = await Promise.all([
      listImportMappings(a),
      listCategories(),
      listStaff({ includeLeft: true }),
    ])
    setRows(m); setCats(c); setStaff(s)
  }

  async function unlock(e) {
    e.preventDefault()
    setErr(''); setUnlocking(true)
    const a = { username: currentUser.username, password: pw }
    try { await load(a); setAuth(a); setPw('') }
    catch (ex) {
      const m = String(ex.message || '')
      setErr(/Password incorrect|Not authorized/i.test(m)
        ? `That password does not match ${currentUser.username}.`
        : m || 'Could not unlock')
    } finally { setUnlocking(false) }
  }

  useEffect(() => { if (!LIVE) setAuth(undefined) }, [])

  async function decide(row, value) {
    // value is either "map:<code>", "create", "ignore", or "" for undecided
    let decision = null, targetCode = null, targetId = null
    if (value.startsWith('map:')) {
      decision = 'map'; targetCode = value.slice(4)
      if (kind === 'staff') {
        const st = staff.find((x) => x.name === targetCode)
        targetId = st ? st.staff_id : null
      } else {
        const c = cats.find((x) => (x.code || '').toUpperCase() === targetCode.toUpperCase())
        targetId = c ? (c.category_id ?? c.id ?? null) : null
      }
    } else if (value === 'create') {
      decision = 'create'; targetCode = row.source_value
    } else if (value === 'ignore') {
      decision = 'ignore'
    }
    setBusy(true)
    try {
      await saveImportMapping({ kind: row.kind, source: row.source_value, decision, targetCode, targetId }, auth)
      setRows((rs) => rs.map((r) => (r.kind === row.kind && r.source_value === row.source_value
        ? { ...r, decision, target_code: targetCode, target_id: targetId } : r)))
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  async function acceptAll() {
    setBusy(true)
    try {
      const n = await acceptImportProposals(kind, auth)
      toast(n ? `${n} filled in from the suggestions` : 'Nothing left to fill in')
      await load(auth)
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  if (!LIVE) {
    return <div className="card" style={{ marginTop: 18 }}><div className="body">
      <span className="muted small">The import worklist needs the live system — there is no Access data in the demo.</span>
    </div></div>
  }

  if (!auth) {
    return (
      <div className="login-card" style={{ margin: '20px auto' }}>
        <div className="sfh" style={{ marginBottom: 12 }}>Confirm your password to open the import</div>
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

  const mine = rows.filter((r) => r.kind === kind)
  const done = mine.filter((r) => r.decision).length
  const shown = onlyTodo ? mine.filter((r) => !r.decision) : mine
  const options = kind === 'staff'
    ? staff.map((s) => [s.name, s.name + (s.leftOn ? ' (past staff)' : '')])
    : cats.map((c) => [c.code, `${c.code} — ${c.description || ''}`.trim()])
  const [, meta] = [null, KINDS.find(([k]) => k === kind)]

  const valueOf = (r) => (r.decision === 'map' ? 'map:' + r.target_code : r.decision === 'create' ? 'create' : r.decision === 'ignore' ? 'ignore' : '')

  return (
    <>
      <div className="seg-tabs" style={{ marginTop: 14 }}>
        {KINDS.map(([k, label]) => {
          const list = rows.filter((r) => r.kind === k)
          const left = list.filter((r) => !r.decision).length
          return (
            <button key={k} className={'btn sm' + (kind === k ? '' : ' ghost')} onClick={() => setKind(k)}>
              {label}{left ? ` · ${left} to do` : ' ✓'}
            </button>
          )
        })}
      </div>

      <div className="card">
        <h3>{meta[1]} <span className="tag">{done} of {mine.length} decided</span></h3>
        <div className="body">
          <span className="muted small">{meta[2]}</span>
          <div className="inrow" style={{ marginTop: 10 }}>
            <button className="btn sm" disabled={busy} onClick={acceptAll}>Accept every suggestion</button>
            <label className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />
              Only show what still needs deciding
            </label>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>In the Access file</th><th>Used</th><th>My guess</th><th>What it is</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={4} className="empty">
                {mine.length ? 'All decided — nothing left on this list.' : 'Nothing to decide here.'}
              </td></tr>
            )}
            {shown.map((r) => {
              const [cls, label] = BADGE[r.confidence] || BADGE.none
              return (
                <tr key={r.kind + r.source_value}>
                  <td><b>{r.source_value}</b></td>
                  <td className="muted small nowrap">{r.occurrences ? r.occurrences.toLocaleString('en-GB') : '—'}</td>
                  <td>
                    <span className={'b ' + cls}>{label}</span>
                    {r.proposed && <span className="muted small"> {r.proposed}</span>}
                  </td>
                  <td>
                    <select value={valueOf(r)} disabled={busy} onChange={(e) => decide(r, e.target.value)}>
                      <option value="">— not decided —</option>
                      <optgroup label={kind === 'staff' ? 'This is one of our staff' : 'This is one of our qualifications'}>
                        {options.map(([v, label2]) => (
                          <option key={v} value={'map:' + v}>{label2}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Or">
                        <option value="create">
                          {kind === 'staff' ? `Create "${r.source_value}" as past staff` : `Create "${r.source_value}" as a new qualification`}
                        </option>
                        <option value="ignore">Ignore — do not import this</option>
                      </optgroup>
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="body">
          <span className="muted small">
            Picking saves straight away. “Create” makes the qualification or the staff record when the import runs,
            not now. “Ignore” leaves that column or name out of the import altogether — which is the right answer for
            the ones that are plainly data-entry rubbish.
          </span>
        </div>
      </div>
    </>
  )
}
