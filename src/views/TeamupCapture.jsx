import { useEffect, useMemo, useState } from 'react'
import { LIVE } from '../lib/supabase.js'
import { teamupStats, teamupPull, teamupClassify, teamupLook, teamupLookAct } from '../lib/api.js'
import { toast } from '../lib/toast.js'

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS → TEAMUP
//
// SGAS's real working schedule lives in Teamup, and that subscription lapses in
// OCTOBER. Nothing had ever come out of it, so on the day it lapsed the forward
// schedule would simply have gone.
//
// Three jobs, in order, and keeping them separate is the point:
//
//   1. TAKE THE COPY. One button. It reads every event out of Teamup and keeps
//      it here, word for word, including the original Teamup record. Once that
//      has run, October stops being a deadline. It reads only — it cannot
//      change or delete anything in Teamup — so it is safe to run today, while
//      everyone is still working in there, and again on the day you switch.
//
//   2. READ IT. Every event is classified from its own title, its Candidates
//      list and the calendar it sits on: which course, whose day, on site or
//      not, trained-and-assessed or assessed only. Then it goes on the
//      calendar. Both are keyed on Teamup's own event id, so this is safe to
//      press as often as you like.
//
//   3. LOOK AT WHAT IT COULD NOT SETTLE. This is the part that used to be a
//      list of 25 calendars to hand-sort, which was the wrong unit — the
//      calendars are not split by course and never were. It is now a list of
//      REASONS. "187 events never said which course" is one decision, not 187.
// ─────────────────────────────────────────────────────────────────────────────

// The reason the classifier gave up, and what a person can do about it.
const REASON = {
  which_course: {
    title: 'Nothing said which course',
    blurb: 'Neither the title nor the Candidates list named a scheme. They are on the '
      + 'calendar as an assessment day, which for most of them is the true answer — '
      + 'a day where somebody assessed whoever turned up.',
    keep: 'These are all assessment days',
  },
  mixed: {
    title: 'A mix of re-sits and first-timers',
    blurb: 'The Candidates list has both people re-sitting and people taking it for the '
      + 'first time, so no single course fits the day. On the calendar as an assessment day.',
    keep: 'These are all assessment days',
  },
  initial_or_resit: {
    title: 'Nothing said initial or re-sit',
    blurb: 'The scheme is clear but nothing said whether the people on it were re-sitting '
      + 'or taking it for the first time, and that scheme has a separate course for each.',
    keep: 'These are all assessment days',
  },
  whose: {
    title: 'We cannot tell whose day this is',
    blurb: 'A holiday, an office day or a meeting with nobody named in the title and on a '
      + 'calendar shared by everyone. Until somebody says whose it was, it sits on the '
      + 'calendar with no name against it.',
    keep: 'Leave these without a name',
  },
}

const KIND_OF_DAY = [
  ['course', 'A course'],
  ['holiday', 'Time off'],
  ['whereabouts', 'Somewhere else'],
  ['engagement', 'A meeting or a visit'],
  ['closed', 'The centre was shut'],
]
const WHERE = [
  ['office', 'In the office'],
  ['wfh', 'Working from home'],
  ['training', 'Training or audit prep'],
  ['sick', 'Off sick'],
  ['unavailable', 'Not available'],
  ['other', 'Something else'],
]

export default function TeamupCapture({ currentUser }) {
  const [auth, setAuth] = useState(null)
  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [err, setErr] = useState('')

  const [stats, setStats] = useState(null)
  const [look, setLook] = useState({ buckets: [], events: [], courses: [], people: [] })
  const [open, setOpen] = useState('')
  const [busy, setBusy] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [reading, setReading] = useState(false)
  const [result, setResult] = useState('')
  const [read, setRead] = useState(null)

  async function load(a) {
    const [st, lk] = await Promise.all([teamupStats(a), teamupLook(a)])
    setStats(st); setLook(lk)
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

  async function reread() {
    setReading(true)
    try {
      const out = await teamupClassify(auth)
      setRead(out)
      toast('Read again and put on the calendar')
      await load(auth)
    } catch (e) { toast(e.message) } finally { setReading(false) }
  }

  async function act(payload) {
    setBusy(true)
    try {
      const out = await teamupLookAct(payload, auth)
      await load(auth)
      toast(out.still_needing_a_look
        ? `${out.still_needing_a_look} left to look at`
        : 'Nothing left to look at')
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  const byReason = useMemo(() => {
    const m = {}
    for (const e of look.events || []) (m[e.reason] ||= []).push(e)
    return m
  }, [look])

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

  const when = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—')
  const n = (v) => Number(v || 0).toLocaleString('en-GB')
  const left = (look.buckets || []).reduce((t, b) => t + Number(b.n || 0), 0)

  return (
    <>
      {/* ── 1. the copy ──────────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Copy of the Teamup calendar
          {stats?.events ? <span className="tag">{n(stats.events)} events held</span> : null}
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

      {/* ── 2. reading it ────────────────────────────────────────────────── */}
      <div className="card">
        <h3>What we made of it</h3>
        <div className="body">
          <span className="muted small">
            Every event is read from its own title, the Candidates list inside it and the calendar it sits on, then put on
            the calendar here. Nothing you have already answered below is overwritten. Press this again after checking
            Teamup, or at any time — it updates rather than duplicates.
          </span>
          {read && (
            <div className="inrow" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
              <span className="tag">{n(read.sessions)} courses</span>
              <span className="tag">{n(read.holidays)} holidays</span>
              <span className="tag">{n(read.engagements)} other days</span>
              <span className="tag">{n(read.days_the_centre_was_shut)} days shut</span>
              <span className="tag">{n(read.sessions_with_an_assessor)} with an assessor</span>
              {read.withdrawn_because_reclassified
                ? <span className="tag">{n(read.withdrawn_because_reclassified)} withdrawn</span> : null}
            </div>
          )}
          <div className="inrow" style={{ marginTop: 10 }}>
            <button className="btn" disabled={reading} onClick={reread}>
              {reading ? 'Reading…' : 'Read it again and put it on the calendar'}
            </button>
          </div>
        </div>
      </div>

      {/* ── 3. what it could not settle ──────────────────────────────────── */}
      <div className="card">
        <h3>Worth a look {left ? <span className="tag">{n(left)} events</span> : <span className="b pass">All clear</span>}</h3>
        <div className="body">
          <span className="muted small">
            These are grouped by the reason we could not settle them, because the reason is the decision. If a whole group
            is right as it stands, say so once and it goes away — the events stay exactly where they are on the calendar,
            they just stop being asked about. Anything you answer here is kept even if the calendar is read again.
          </span>
        </div>

        {left === 0 && (
          <div className="body"><span className="muted small">
            Nothing outstanding. Everything captured from Teamup is on the calendar.
          </span></div>
        )}

        {(look.buckets || []).map((b) => {
          const meta = REASON[b.reason] || { title: b.reason, blurb: '', keep: 'These are all right' }
          const rows = byReason[b.reason] || []
          const isOpen = open === b.reason
          return (
            <div key={b.reason} className="body" style={{ borderTop: '1px solid var(--line, #e5e5e5)' }}>
              <div className="inrow" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <b>{meta.title}</b> <span className="tag">{n(b.n)}</span>
                  <div className="muted small" style={{ marginTop: 4 }}>{meta.blurb}</div>
                </div>
                <div className="inrow nowrap" style={{ gap: 6 }}>
                  <button className="btn sm ghost" onClick={() => setOpen(isOpen ? '' : b.reason)}>
                    {isOpen ? 'Hide them' : 'Show them'}
                  </button>
                  <button className="btn sm" disabled={busy}
                    onClick={() => act({ action: 'keep', reason: b.reason })}>
                    {meta.keep}
                  </button>
                </div>
              </div>

              {isOpen && (
                <table style={{ marginTop: 10 }}>
                  <thead>
                    <tr><th>What it says in Teamup</th><th>When</th><th>Filed as</th><th>Or say</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <EventRow key={e.event_id} e={e} look={look} busy={busy} act={act} when={when} />
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={4} className="empty">Nothing left in this group.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// One event, and the three things a person can say about it that a computer
// could not: which course it was, whose day it was, or that it is not the kind
// of day we took it for.
function EventRow({ e, look, busy, act, when }) {
  const [course, setCourse] = useState('')
  const [person, setPerson] = useState('')
  const [kind, setKind] = useState('')
  const [where, setWhere] = useState('')

  return (
    <tr>
      <td>
        <b>{e.title}</b>
        {e.calendars ? <div className="muted small">{e.calendars}</div> : null}
        {e.delegates ? <div className="muted small">{e.delegates} named in Candidates</div> : null}
        {e.notes && e.notes.trim() ? <div className="muted small">{e.notes.trim().slice(0, 140)}</div> : null}
      </td>
      <td className="muted small nowrap">
        {when(e.on)}{e.until ? <> – {when(e.until)}</> : null}
      </td>
      <td className="muted small">
        {e.course || (e.kind === 'holiday' ? 'Time off' : e.kind === 'closed' ? 'Centre shut' : 'Not a course')}
        {e.person ? <div>{e.person}</div> : null}
        {e.why ? <div style={{ marginTop: 2 }}>{e.why}</div> : null}
      </td>
      <td style={{ minWidth: 230 }}>
        <div className="field">
          <label className="fl">It was this course</label>
          <div className="inrow" style={{ gap: 6 }}>
            <select value={course} disabled={busy} onChange={(ev) => setCourse(ev.target.value)}>
              <option value="">— choose —</option>
              {(look.courses || []).map((c) => <option key={c.course_id} value={c.course_id}>{c.name}</option>)}
            </select>
            {course && (
              <button className="btn sm" disabled={busy}
                onClick={() => act({ action: 'course', eventId: e.event_id, courseId: Number(course) })}>Save</button>
            )}
          </div>
        </div>

        <div className="field" style={{ marginTop: 6 }}>
          <label className="fl">It was this person's day</label>
          <div className="inrow" style={{ gap: 6 }}>
            <select value={person} disabled={busy} onChange={(ev) => setPerson(ev.target.value)}>
              <option value="">— choose —</option>
              {(look.people || []).map((p) => <option key={p.staff_id} value={p.staff_id}>{p.name}</option>)}
            </select>
            {person && (
              <button className="btn sm" disabled={busy}
                onClick={() => act({ action: 'person', eventId: e.event_id, staffId: Number(person) })}>Save</button>
            )}
          </div>
        </div>

        <div className="field" style={{ marginTop: 6 }}>
          <label className="fl">It is not that kind of day</label>
          <div className="inrow" style={{ gap: 6 }}>
            <select value={kind} disabled={busy} onChange={(ev) => { setKind(ev.target.value); setWhere('') }}>
              <option value="">— choose —</option>
              {KIND_OF_DAY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {kind === 'whereabouts' && (
              <select value={where} disabled={busy} onChange={(ev) => setWhere(ev.target.value)}>
                <option value="">— where —</option>
                {WHERE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
            {kind && (kind !== 'whereabouts' || where) && (
              <button className="btn sm" disabled={busy}
                onClick={() => act({
                  action: 'kind', eventId: e.event_id, kind,
                  where: kind === 'whereabouts' ? where : null,
                  staffId: person ? Number(person) : null,
                })}>Save</button>
            )}
          </div>
        </div>

        <button className="btn sm ghost" style={{ marginTop: 8 }} disabled={busy}
          onClick={() => act({ action: 'keep', eventId: e.event_id })}>
          This one is right
        </button>
      </td>
    </tr>
  )
}
