import { useEffect, useState } from 'react'
import { LIVE } from '../lib/supabase.js'
import {
  teamupSubcalendars, teamupStats, teamupMapSave, teamupPull,
  listCourses, listStaff,
} from '../lib/api.js'
import { toast } from '../lib/toast.js'

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS → TEAMUP
//
// SGAS's real working schedule lives in Teamup, and that subscription lapses in
// OCTOBER. Nothing had ever come out of it, so on the day it lapsed the forward
// schedule would simply have gone.
//
// This screen does two separate jobs, and keeping them separate is the point:
//
//   1. TAKE THE COPY. One button. It reads every event out of Teamup and keeps
//      it here, word for word, including the original Teamup record. Once that
//      has run, October stops being a deadline. It reads only — it cannot
//      change or delete anything in Teamup — so it is safe to run today, while
//      everyone is still working in there, and again on the day you switch.
//
//   2. SAY WHAT EACH STREAM IS. Teamup keeps three different kinds of thing in
//      one list: courses, individual people's diaries, and time that is not
//      teaching at all. This system has a different place for each. That is a
//      judgement, not a copy, so it is asked here rather than guessed — and it
//      can be answered at leisure, after the copy is safe.
// ─────────────────────────────────────────────────────────────────────────────

const KIND = {
  course:     ['Courses',   'Blocks that go on the calendar as courses.'],
  staff:      ['A person',  "One member of staff's own diary."],
  holiday:    ['Holidays',  'Time off — becomes a holiday record.'],
  engagement: ['Other work','Meetings, on site, office days — becomes an engagement.'],
  ignore:     ['Leave out', 'Nothing here needs bringing across.'],
}

export default function TeamupCapture({ currentUser }) {
  const [auth, setAuth] = useState(null)
  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [err, setErr] = useState('')

  const [subs, setSubs] = useState([])
  const [stats, setStats] = useState(null)
  const [courses, setCourses] = useState([])
  const [staff, setStaff] = useState([])
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [result, setResult] = useState('')

  function seed(s) {
    if (s.decision === 'course') return { d: 'course', course: s.target_course_id || '', staff: '' }
    if (s.decision === 'staff') return { d: 'staff', course: '', staff: s.target_staff_id || '' }
    if (s.decision) return { d: s.decision, course: '', staff: '' }
    return { d: s.proposed || '', course: '', staff: '' }
  }

  async function load(a) {
    const [sc, st, co, sf] = await Promise.all([
      teamupSubcalendars(a), teamupStats(a), listCourses(), listStaff({ includeLeft: true }),
    ])
    setSubs(sc); setStats(st); setCourses(co); setStaff(sf)
    const d = {}
    for (const s of sc) d[s.subcalendar_id] = seed(s)
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

  async function pull() {
    setPulling(true); setResult('')
    try {
      const out = await teamupPull(auth)
      setResult(
        `${out.events_seen} events copied across ${out.subcalendars} sub-calendars`
        + (out.events_gone ? `, and ${out.events_gone} that are no longer in Teamup have been marked rather than removed` : '')
        + '.'
      )
      toast('Copied from Teamup')
      await load(auth)
    } catch (e) { toast(e.message); setResult(e.message) } finally { setPulling(false) }
  }

  async function confirm(s) {
    const d = draft[s.subcalendar_id] || {}
    if (!d.d) { toast('Choose what it is first'); return }
    if (d.d === 'course' && !d.course) { toast('Pick which course'); return }
    if (d.d === 'staff' && !d.staff) { toast('Pick which person'); return }
    setBusy(true)
    try {
      await teamupMapSave({
        subcalendarId: s.subcalendar_id, decision: d.d,
        courseId: d.d === 'course' ? Number(d.course) : null,
        staffId: d.d === 'staff' ? Number(d.staff) : null,
      }, auth)
      setSubs((xs) => xs.map((x) => (x.subcalendar_id === s.subcalendar_id
        ? { ...x, decision: d.d, target_course_id: d.d === 'course' ? Number(d.course) : null,
            target_staff_id: d.d === 'staff' ? Number(d.staff) : null }
        : x)))
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  if (!LIVE) {
    return <div className="card" style={{ marginTop: 18 }}><div className="body">
      <span className="muted small">Teamup needs the live system — there is nothing to copy in the demo.</span>
    </div></div>
  }

  if (!auth) {
    return (
      <div className="login-card" style={{ margin: '20px auto' }}>
        <div className="sfh" style={{ marginBottom: 12 }}>Confirm your password to open Teamup</div>
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

  const decided = subs.filter((s) => s.decision).length
  const dirty = (s) => {
    const d = draft[s.subcalendar_id] || {}
    if (!s.decision) return !!d.d
    if (s.decision !== d.d) return true
    if (d.d === 'course') return Number(d.course || 0) !== Number(s.target_course_id || 0)
    if (d.d === 'staff') return Number(d.staff || 0) !== Number(s.target_staff_id || 0)
    return false
  }
  const when = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—')

  return (
    <>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Copy of the Teamup calendar
          {stats?.events ? <span className="tag">{Number(stats.events).toLocaleString('en-GB')} events held</span> : null}
        </h3>
        <div className="body">
          <span className="muted small">
            {stats?.events
              ? <>Everything in Teamup is held here as well, from {when(stats.first)} to {when(stats.last)}, last checked {when(stats.pulled)}.
                  Run it again whenever you like — it updates what has changed rather than making second copies, and anything
                  deleted in Teamup is marked here rather than lost.</>
              : <>Nothing has been copied yet. Teamup is the only place the working schedule exists, and that subscription
                  ends in October. This reads it and keeps a copy here — it cannot change or delete anything in Teamup, so it
                  is safe to run while everyone is still using it.</>}
          </span>
          <div className="inrow" style={{ marginTop: 10 }}>
            <button className="btn" disabled={pulling} onClick={pull}>
              {pulling ? 'Copying…' : stats?.events ? 'Check Teamup again' : 'Copy Teamup across now'}
            </button>
          </div>
          {result && <div style={{ marginTop: 10 }}><span className="muted small">{result}</span></div>}
        </div>
      </div>

      <div className="card">
        <h3>What each Teamup list is <span className="tag">{decided} of {subs.length} decided</span></h3>
        <div className="body">
          <span className="muted small">
            Teamup keeps three different kinds of thing in one list of {subs.length}: the courses themselves, individual
            people’s diaries, and time that is not teaching at all. Each one has its own place in this system, so say which
            is which. The copy above is already safe either way — this only decides how it appears once it comes across.
          </span>
        </div>

        <table>
          <thead>
            <tr><th>In Teamup</th><th>Events</th><th>What it is</th><th /></tr>
          </thead>
          <tbody>
            {subs.length === 0 && (
              <tr><td colSpan={4} className="empty">Nothing here yet — copy Teamup across first.</td></tr>
            )}
            {subs.map((s) => {
              const d = draft[s.subcalendar_id] || { d: '' }
              return (
                <tr key={s.subcalendar_id}>
                  <td>
                    <b>{s.name}</b>
                    {s.sample_titles?.length ? (
                      <div className="muted small">e.g. {s.sample_titles.slice(0, 3).join(' · ')}</div>
                    ) : null}
                    {s.first_event ? <div className="muted small">{when(s.first_event)} – {when(s.last_event)}</div> : null}
                  </td>
                  <td className="muted small nowrap">{s.events ? s.events.toLocaleString('en-GB') : '—'}</td>
                  <td>
                    <select value={d.d} disabled={busy} onChange={(e) => setD(s.subcalendar_id, { d: e.target.value })}>
                      <option value="">— choose —</option>
                      {Object.entries(KIND).map(([k, [label, hint]]) => (
                        <option key={k} value={k}>{label} — {hint}</option>
                      ))}
                    </select>
                    {d.d === 'course' && (
                      <div className="field" style={{ marginTop: 6 }}>
                        <label className="fl">Which course</label>
                        <select value={d.course} disabled={busy} onChange={(e) => setD(s.subcalendar_id, { course: e.target.value })}>
                          <option value="">— choose —</option>
                          {courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.name}</option>)}
                        </select>
                      </div>
                    )}
                    {d.d === 'staff' && (
                      <div className="field" style={{ marginTop: 6 }}>
                        <label className="fl">Whose diary</label>
                        <select value={d.staff} disabled={busy} onChange={(e) => setD(s.subcalendar_id, { staff: e.target.value })}>
                          <option value="">— choose —</option>
                          {staff.map((x) => <option key={x.staff_id} value={x.staff_id}>{x.name}{x.leftOn ? ' (past staff)' : ''}</option>)}
                        </select>
                      </div>
                    )}
                  </td>
                  <td className="nowrap">
                    {dirty(s)
                      ? <button className="btn sm" disabled={busy} onClick={() => confirm(s)}>Confirm</button>
                      : s.decision ? <span className="b pass">Saved</span> : <span className="b pend">To do</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="body">
          <span className="muted small">
            Where the name made it obvious the box is already set — press Confirm to agree. The three called “Spare”
            deliberately arrive with nothing chosen: they are named spare but are in daily use for something else, which is
            exactly the sort of thing worth a person’s eye rather than a computer’s guess.
          </span>
        </div>
      </div>
    </>
  )
}
