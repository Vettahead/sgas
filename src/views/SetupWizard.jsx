import { useEffect, useMemo, useState } from 'react'
import {
  listCourses, listStaff, listHolidays, getPool, loadPool, listBlocks,
  createBlock, assignBlockRole, addDelegatesToBlock, staffOnHoliday, weekdayDays,
} from '../lib/api.js'
import { MiniMonth, MiniYear, shiftMonth, monthName } from './CalendarNext.jsx'
import { todayISO, fmt } from '../lib/util.js'
import { toast } from '../lib/toast.js'

// ─────────────────────────────────────────────────────────────────────────────
// SET UP A COURSE — the wizard.
//
// One question per screen: which course → when → who is teaching → who is
// attending → confirm. No dragging anywhere, so it behaves identically on a
// phone, a tablet and a desktop, and someone who has never seen the system can
// finish it without being shown how.
//
// It writes exactly what the calendar writes (createBlock → assignBlockRole →
// addDelegatesToBlock), so a course set up here is an ordinary course.
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = ['Course', 'Dates', 'Trainer', 'Delegates', 'Check']

// Clicking any sidebar item unmounts this screen, which used to bin everything
// entered. The draft is kept in the browser so leaving and coming back is safe.
const DRAFT_KEY = 'sgas_setup_draft'
const loadDraft = () => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {} } catch { return {} }
}
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY) } catch { /* private browsing */ } }

// Courses run Monday to Friday; nudge a weekend pick onto the working week.
function snapWeekday(d, dir) {
  const day = new Date(d + 'T00:00:00Z').getUTCDay()
  if (day !== 0 && day !== 6) return d
  const shift = dir === 'start' ? (day === 6 ? 2 : 1) : (day === 0 ? -2 : -1)
  const t = Date.parse(d + 'T00:00:00Z') + shift * 86400000
  return new Date(t).toISOString().slice(0, 10)
}
const addDaysISO = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)

export default function SetupWizard({ go }) {
  const draft = loadDraft()
  const [step, setStep] = useState(draft.step || 0)
  const [resumed, setResumed] = useState(!!draft.courseId)
  const [courses, setCourses] = useState([])
  const [staff, setStaff] = useState([])
  const [holidays, setHolidays] = useState([])
  const [pool, setPool] = useState([])
  const [existing, setExisting] = useState([])          // what is already booked, for context
  const [pickView, setPickView] = useState('Month')     // Month | Year
  // A plain 'YYYY-MM' now, not the old calendar's date object.
  const [anchor, setAnchor] = useState(() => todayISO().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)

  // What the wizard is building up.
  const [courseId, setCourseId] = useState(draft.courseId || '')
  const [from, setFrom] = useState(draft.from || '')
  const [to, setTo] = useState(draft.to || '')
  const [trainerId, setTrainerId] = useState(draft.trainerId || '')
  const [picked, setPicked] = useState(() => new Set(draft.picked || []))
  const [search, setSearch] = useState('')

  useEffect(() => {
    (async () => {
      try { await loadPool() } catch { /* pool optional */ }
      const [c, s, h, b] = await Promise.all([listCourses(), listStaff(), listHolidays(), listBlocks()])
      setCourses(c.filter((x) => x.is_active !== false)); setStaff(s); setHolidays(h); setPool(getPool())
      setExisting(b)
      setLoading(false)
    })()
  }, [])

  // Save the draft whenever anything meaningful changes.
  useEffect(() => {
    if (!courseId && !from && !trainerId && !picked.size) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, courseId, from, to, trainerId, picked: [...picked] }))
    } catch { /* private browsing */ }
  }, [step, courseId, from, to, trainerId, picked])

  const course = useMemo(() => courses.find((c) => String(c.course_id) === String(courseId)), [courses, courseId])

  // Only offer people who are waiting for this course's scheme; everyone else
  // is a mistake waiting to happen.
  const candidates = useMemo(() => {
    const scheme = course?.scheme
    let list = pool
    if (scheme) list = list.filter((p) => !p.scheme || p.scheme === scheme)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q))
    }
    return list
  }, [pool, course, search])

  const clashes = useMemo(
    () => (from && to ? staff.filter((s) => staffOnHoliday(holidays, s.staff_id, from, to)) : []),
    [staff, holidays, from, to]
  )
  const trainer = staff.find((s) => String(s.staff_id) === String(trainerId))
  const days = from && to ? weekdayDays(from, to) : 0

  // Choosing a course suggests dates; picking a start suggests an end.
  function chooseCourse(id) {
    setCourseId(id)
    if (!from) {
      const start = snapWeekday(addDaysISO(todayISO(), 14), 'start')
      setFrom(start); setTo(snapWeekday(addDaysISO(start, 4), 'end'))
      setAnchor(start.slice(0, 7))
    }
    setStep(1)
  }
  // Take whatever was dragged and turn it into a sane Mon-Fri range.
  // A drag that lands entirely on a weekend has no working days in it, so both
  // ends would snap past each other and invert — that becomes the next Monday.
  function applyRange(a, b) {
    const lo = a < b ? a : b
    const hi = a < b ? b : a
    let f = snapWeekday(lo, 'start')
    let t = snapWeekday(hi, 'end')
    if (f > t) t = f
    setFrom(f); setTo(t)
  }

  function setStart(v) {
    if (!v) return setFrom('')
    const start = snapWeekday(v, 'start')
    setFrom(start)
    if (!to || to < start) setTo(snapWeekday(addDaysISO(start, 4), 'end'))
  }

  const canNext = [
    !!courseId,
    !!from && !!to && to >= from,
    true,                 // a trainer can be added later
    true,                 // so can delegates
    true,
  ][step]

  async function finish() {
    setSaving(true)
    try {
      const id = await createBlock({ courseId: Number(courseId), from, to })
      if (trainerId) await assignBlockRole(id, 'trainer', Number(trainerId))
      if (picked.size) await addDelegatesToBlock(id, [...picked])
      clearDraft()
      setDone({ id, course: course?.name, from, to, trainer: trainer?.name, n: picked.size })
    } catch (e) { toast(e.message || 'Could not set that up') } finally { setSaving(false) }
  }

  function reset() {
    clearDraft(); setResumed(false)
    setDone(null); setStep(0); setCourseId(''); setFrom(''); setTo('')
    setTrainerId(''); setPicked(new Set()); setSearch('')
  }

  if (loading) return <div className="empty">Loading…</div>

  if (done) {
    return (
      <div className="card wz-done">
        <div className="body">
          <div className="wz-tick">✓</div>
          <h3 className="wz-h">{done.course} is set up</h3>
          <p className="muted">
            {fmt(done.from)} – {fmt(done.to)}
            {done.trainer ? <> · {done.trainer} teaching</> : <> · no trainer yet</>}
            {done.n ? <> · {done.n} delegate{done.n === 1 ? '' : 's'} on it</> : <> · nobody on it yet</>}
          </p>
          <div className="inrow" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="btn" onClick={reset}>Set up another</button>
            <button className="btn ghost" onClick={() => go('calendarnext')}>See it on the calendar</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="wz">
      <ol className="wz-steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <button onClick={() => i < step && setStep(i)} disabled={i > step}>
              <span className="wz-n">{i < step ? '✓' : i + 1}</span>{label}
            </button>
          </li>
        ))}
      </ol>

      {resumed && (
        <div className="banner" style={{ marginBottom: 12 }}>
          Picked up where you left off.{' '}
          <button className="linkbtn" onClick={reset}>Start again</button>
        </div>
      )}

      <div className="card">
        <div className="body wz-body">
          {step === 0 && (
            <>
              <h3 className="wz-h">Which course is it?</h3>
              <p className="muted wz-sub">Pick the course you are putting on.</p>
              <div className="wz-grid">
                {courses.map((c) => (
                  <button key={c.course_id} className={'wz-pick' + (String(courseId) === String(c.course_id) ? ' on' : '')}
                    onClick={() => chooseCourse(String(c.course_id))}>
                    <span className="wz-swatch" style={{ background: c.color || 'var(--slate)' }} />
                    <span><b>{c.name}</b><span className="muted small">{c.scheme || 'no scheme set'}</span></span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h3 className="wz-h">When does it run?</h3>
              <p className="muted wz-sub">
                Drag across the days it runs. Courses already booked are shown so you can
                see what else is on — Monday to Friday, so a weekend edge moves to the
                nearest working day.
              </p>

              <div className="wz-caltop">
                <div className="seg">
                  <button className={pickView === 'Month' ? 'on' : ''} onClick={() => setPickView('Month')}>Month</button>
                  <button className={pickView === 'Year' ? 'on' : ''} onClick={() => setPickView('Year')}>Year</button>
                </div>
                <div className="cal-nav-grp">
                  <button className="cal-nav" aria-label="Back"
                    onClick={() => setAnchor((m) => shiftMonth(m, pickView === 'Year' ? -12 : -1))}>‹</button>
                  <span className="wz-caltitle">{pickView === 'Year' ? anchor.slice(0, 4) : monthName(anchor)}</span>
                  <button className="cal-nav" aria-label="Forward"
                    onClick={() => setAnchor((m) => shiftMonth(m, pickView === 'Year' ? 12 : 1))}>›</button>
                </div>
                <button className="btn ghost sm" onClick={() => setAnchor((from || todayISO()).slice(0, 7))}>
                  {from ? 'Back to the dates' : 'Today'}
                </button>
              </div>

              <div className="wz-cal">
                {/* The SAME grid and the SAME drag as the Calendar screen —
                    this step used to draw the old calendar, which is the last
                    reason that file existed. */}
                {pickView === 'Month' ? (
                  <MiniMonth
                    month={anchor} onMonth={setAnchor} nav={false}
                    blocks={existing}
                    selection={from && to ? { from, to } : null}
                    onPick={applyRange}
                  />
                ) : (
                  <MiniYear
                    year={anchor.slice(0, 4)}
                    blocks={existing}
                    selection={from && to ? { from, to } : null}
                    onPick={applyRange}
                  />
                )}
              </div>

              <div className="wz-caldates">
                <span className="wz-picked">
                  {from && to
                    ? <><b>{fmt(from)}</b> to <b>{fmt(to)}</b> · {days} working day{days === 1 ? '' : 's'}</>
                    : <span className="muted">Nothing picked yet — drag across the calendar above.</span>}
                </span>
                <details className="wz-manual">
                  <summary className="muted small">Type the dates instead</summary>
                  <div className="twocol" style={{ marginTop: 10 }}>
                    <div className="field"><label className="fl">First day</label>
                      <input type="date" value={from} onChange={(e) => setStart(e.target.value)} /></div>
                    <div className="field"><label className="fl">Last day</label>
                      <input type="date" value={to} min={from} onChange={(e) => {
                        const t = snapWeekday(e.target.value, 'end')
                        setTo(t < from ? from : t)
                      }} /></div>
                  </div>
                </details>
              </div>
              {from && to && to < todayISO() && <div className="hint">These dates are in the past.</div>}
            </>
          )}

          {step === 2 && (
            <>
              <h3 className="wz-h">Who is teaching it?</h3>
              <p className="muted wz-sub">You can leave this and set it later.</p>
              <div className="wz-grid">
                <button className={'wz-pick' + (trainerId === '' ? ' on' : '')} onClick={() => setTrainerId('')}>
                  <span className="wz-swatch" style={{ background: 'var(--pend)' }} />
                  <span><b>Decide later</b><span className="muted small">the course will show as needing a trainer</span></span>
                </button>
                {staff.map((s) => {
                  const off = staffOnHoliday(holidays, s.staff_id, from, to)
                  return (
                    <button key={s.staff_id} disabled={off}
                      className={'wz-pick' + (String(trainerId) === String(s.staff_id) ? ' on' : '') + (off ? ' off' : '')}
                      onClick={() => setTrainerId(String(s.staff_id))}>
                      <span className="wz-swatch" style={{ background: s.color || 'var(--slate)' }} />
                      <span><b>{s.name}</b><span className="muted small">{off ? 'on holiday those dates' : (s.room || 'available')}</span></span>
                    </button>
                  )
                })}
              </div>
              {clashes.length > 0 && <div className="hint">{clashes.map((c) => c.name).join(', ')} {clashes.length === 1 ? 'is' : 'are'} on holiday during these dates.</div>}
            </>
          )}

          {step === 3 && (
            <>
              <h3 className="wz-h">Who is attending?</h3>
              <p className="muted wz-sub">
                {course?.scheme ? <>People waiting for {course.scheme}. </> : null}
                Tap to add or remove. You can leave this empty and add people later.
              </p>
              <div className="field">
                <input type="text" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {candidates.length === 0
                ? <div className="empty">Nobody is waiting for this course. Book a delegate first, or add people later.</div>
                : (
                  <div className="wz-grid">
                    {candidates.map((p) => (
                      <button key={p.id} className={'wz-pick' + (picked.has(p.id) ? ' on' : '')}
                        onClick={() => setPicked((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}>
                        <span className="wz-check">{picked.has(p.id) ? '✓' : ''}</span>
                        <span><b>{p.name}</b><span className="muted small">{p.count} qualification{p.count === 1 ? '' : 's'}{p.prefFrom ? ' · wants ' + fmt(p.prefFrom) : ''}</span></span>
                      </button>
                    ))}
                  </div>
                )}
            </>
          )}

          {step === 4 && (
            <>
              <h3 className="wz-h">Does this look right?</h3>
              <table className="wz-check-t">
                <tbody>
                  <tr><th>Course</th><td>{course?.name}<span className="muted small"> · {course?.scheme || 'no scheme'}</span></td></tr>
                  <tr><th>Dates</th><td>{fmt(from)} – {fmt(to)}<span className="muted small"> · {days} working day{days === 1 ? '' : 's'}</span></td></tr>
                  <tr><th>Trainer</th><td>{trainer ? trainer.name : <span className="muted">to be decided</span>}</td></tr>
                  <tr><th>Delegates</th><td>
                    {picked.size === 0 ? <span className="muted">nobody yet</span>
                      : [...picked].map((id) => pool.find((p) => p.id === id)?.name).filter(Boolean).join(', ')}
                  </td></tr>
                </tbody>
              </table>
              {(!trainer || !picked.size) && (
                <div className="hint">
                  This course will show as needing attention until it has {!trainer ? 'a trainer' : ''}{!trainer && !picked.size ? ' and ' : ''}{!picked.size ? 'at least one delegate' : ''}. That is fine — you can finish it later.
                </div>
              )}
            </>
          )}
        </div>

        <div className="wz-foot">
          <button className="btn ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>← Back</button>
          <span className="muted small">Step {step + 1} of {STEPS.length}</span>
          {step < STEPS.length - 1
            ? <button className="btn" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next →</button>
            : <button className="btn" disabled={saving} onClick={finish}>{saving ? 'Setting up…' : 'Set the course up'}</button>}
        </div>
      </div>
    </div>
  )
}
