import { useEffect, useState } from 'react'
import { LIVE } from '../lib/supabase.js'
import {
  listImportMappings, saveImportMapping, acceptImportProposals,
  listCategories, listStaff, listCompanies,
} from '../lib/api.js'
import { toast } from '../lib/toast.js'

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS → DATA IMPORT
//
// The Access database names things in free text, with twenty years of typing in
// it: "S GASDSDON", "S GADSDON", "S GASDSON" and "S G" are all Simon; OFT201 is
// our OFTEC201; "CENTRICA SEND CERT TO WORK" is Centrica with a note stuck on
// the end. A computer can guess at those. It should not act on a guess — an
// import that silently invents a qualification is worse than one that stops and
// asks.
//
// So every distinct value gets a row here, and this screen is where a person
// answers it. Three things make that bearable rather than a two-hour slog:
//
//   1. THE ANSWER IS ALREADY IN THE BOX. Where there is an exact or near match
//      the dropdown arrives set to it — the job is to press Confirm, not to
//      find the right line in a list of 110.
//   2. NOTHING SAVES UNTIL CONFIRMED. A pre-filled box that saved itself would
//      be a guess with extra steps.
//   3. CREATE TAKES YOUR NAME, NOT THEIRS. The Access spelling is only a
//      starting point; type what it should be called here and that is what gets
//      created.
//
// Two rows that create the same name end up as the same thing — which is how
// "EDINA" and "EDINA UK LTD" become one company: give them both the same name.
// ─────────────────────────────────────────────────────────────────────────────

const KINDS = [
  ['qualification', 'Qualifications',
   'Each tick column in the Access file. Match it to one of ours, create it under a name of your choosing, or ignore it.'],
  ['staff', 'Assessors and verifiers',
   'Every name that appears against an assessment. Most of these people have left — create them as past staff so the history keeps their name on it.'],
  ['employer', 'Employers',
   'Who the delegate worked for. We only hold ten companies, so most of these want creating. Give two of them the same name and they become one company.'],
]

const BADGE = {
  exact: ['pass', 'exact match'],
  likely: ['due', 'probably'],
  none: ['pend', 'no match'],
  not_qual: ['pend', 'not a qualification'],
}

// Company and people names read better in title case than in the shouting the
// Access file stores them in. Qualification codes stay as codes.
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())

export default function ImportMapping({ currentUser }) {
  const [auth, setAuth] = useState(null)
  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [err, setErr] = useState('')

  const [rows, setRows] = useState([])
  const [cats, setCats] = useState([])
  const [staff, setStaff] = useState([])
  const [companies, setCompanies] = useState([])
  const [kind, setKind] = useState('qualification')
  const [onlyTodo, setOnlyTodo] = useState(true)
  const [draft, setDraft] = useState({})       // key -> { choice, name }
  const [busy, setBusy] = useState(false)

  const keyOf = (r) => r.kind + '|' + r.source_value

  // What the box should say before anybody touches it.
  function seed(r) {
    if (r.decision === 'map') return { choice: 'map:' + r.target_code, name: '' }
    if (r.decision === 'create') return { choice: 'create', name: r.target_code || '' }
    if (r.decision === 'ignore') return { choice: 'ignore', name: '' }
    if (r.kind === 'employer') {
      // We hold almost no companies, so the answer is nearly always "create" —
      // under the tidied-up name if I had a suggestion, otherwise their own.
      return { choice: 'create', name: titleCase(r.proposed || r.source_value) }
    }
    if (r.proposed) return { choice: 'map:' + r.proposed, name: '' }
    return { choice: '', name: r.kind === 'qualification' ? String(r.source_value).toUpperCase() : titleCase(r.source_value) }
  }

  async function load(a) {
    const [m, c, s, co] = await Promise.all([
      listImportMappings(a), listCategories(), listStaff({ includeLeft: true }), listCompanies(),
    ])
    setRows(m); setCats(c); setStaff(s); setCompanies(co)
    const d = {}
    for (const r of m) d[r.kind + '|' + r.source_value] = seed(r)
    setDraft(d)
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

  const setD = (k, patch) => setDraft((d) => ({ ...d, [k]: { ...d[k], ...patch } }))

  async function confirm(r) {
    const k = keyOf(r)
    const d = draft[k] || {}
    let decision = null, targetCode = null, targetId = null

    if ((d.choice || '').startsWith('map:')) {
      decision = 'map'; targetCode = d.choice.slice(4)
      if (r.kind === 'staff') targetId = (staff.find((x) => x.name === targetCode) || {}).staff_id ?? null
      else if (r.kind === 'employer') targetId = (companies.find((x) => x.name === targetCode) || {}).company_id ?? null
      else {
        const c = cats.find((x) => (x.code || '').toUpperCase() === targetCode.toUpperCase())
        targetId = c ? c.category_id : null
      }
    } else if (d.choice === 'create') {
      decision = 'create'
      targetCode = (d.name || '').trim()
      if (!targetCode) { toast('Give it a name first'); return }
    } else if (d.choice === 'ignore') {
      decision = 'ignore'
    } else { toast('Choose what it is first'); return }

    setBusy(true)
    try {
      await saveImportMapping({ kind: r.kind, source: r.source_value, decision, targetCode, targetId }, auth)
      setRows((rs) => rs.map((x) => (keyOf(x) === k
        ? { ...x, decision, target_code: targetCode, target_id: targetId } : x)))
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  async function acceptAll() {
    setBusy(true)
    try {
      const n = await acceptImportProposals(kind, auth)
      toast(n ? `${n} taken from the suggestions` : 'Nothing left that I had a suggestion for')
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

  const meta = KINDS.find(([k]) => k === kind)
  const mine = rows.filter((r) => r.kind === kind)
  const done = mine.filter((r) => r.decision).length
  const shown = onlyTodo ? mine.filter((r) => !r.decision) : mine
  const options = kind === 'staff'
    ? staff.map((s) => [s.name, s.name + (s.leftOn ? ' (past staff)' : '')])
    : kind === 'employer'
      ? companies.map((c) => [c.name, c.name])
      : cats.map((c) => [c.code, `${c.code} — ${c.description || ''}`.trim()])

  // What is stored, so a row can say whether the box in front of you matches it.
  const stored = (r) => (r.decision === 'map' ? 'map:' + r.target_code : r.decision || '')
  const dirty = (r) => {
    const d = draft[keyOf(r)] || {}
    if (!r.decision) return true
    if (stored(r) !== d.choice) return true
    return r.decision === 'create' && (d.name || '').trim() !== (r.target_code || '')
  }

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
            <tr><th>In the Access file</th><th>Used</th><th>What it is</th><th /></tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={4} className="empty">
                {mine.length ? 'All decided — nothing left on this list.' : 'Nothing to decide here.'}
              </td></tr>
            )}
            {shown.map((r) => {
              const k = keyOf(r)
              const d = draft[k] || { choice: '', name: '' }
              const [cls, label] = BADGE[r.confidence] || BADGE.none
              return (
                <tr key={k}>
                  <td>
                    <b>{r.source_value}</b>
                    <div><span className={'b ' + cls}>{label}</span></div>
                  </td>
                  <td className="muted small nowrap">{r.occurrences ? r.occurrences.toLocaleString('en-GB') : '—'}</td>
                  <td>
                    <select value={d.choice} disabled={busy} onChange={(e) => setD(k, { choice: e.target.value })}>
                      <option value="">— choose —</option>
                      <optgroup label={kind === 'staff' ? 'One of our staff' : kind === 'employer' ? 'A company we already hold' : 'One of our qualifications'}>
                        {options.map(([v, l]) => <option key={v} value={'map:' + v}>{l}</option>)}
                      </optgroup>
                      <optgroup label="Or">
                        <option value="create">
                          {kind === 'staff' ? 'Create as past staff…' : kind === 'employer' ? 'Create as a company…' : 'Create as a new qualification…'}
                        </option>
                        <option value="ignore">Ignore — leave it out of the import</option>
                      </optgroup>
                    </select>
                    {d.choice === 'create' && (
                      <div className="field" style={{ marginTop: 6 }}>
                        <label className="fl">{kind === 'qualification' ? 'Code to create it under' : 'Name to create it under'}</label>
                        <input type="text" value={d.name || ''} disabled={busy}
                          placeholder={r.source_value}
                          onChange={(e) => setD(k, { name: e.target.value })} />
                      </div>
                    )}
                  </td>
                  <td className="nowrap">
                    {dirty(r)
                      ? <button className="btn sm" disabled={busy} onClick={() => confirm(r)}>Confirm</button>
                      : <span className="b pass">Saved</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="body">
          <span className="muted small">
            Nothing is saved until you press Confirm — a box that filled itself in and saved itself would just be a
            guess with extra steps. Creating happens when the import runs, not now, so a name typed here can still be
            changed. Two rows created under the same name become one thing, which is how “EDINA” and “EDINA UK LTD”
            end up as one company.
          </span>
        </div>
      </div>
    </>
  )
}
