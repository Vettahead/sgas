import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../components/Modal.jsx'
import { fmt, todayISO } from '../lib/util.js'

// ─────────────────────────────────────────────────────────────────────────────
// TIMESHEET — one person, one year: what they trained and what they assisted.
//
// Simon (7 Sep): "filter the calendar by staff member returning what they
// TRAINED and what they ASSISTED, course type as a multi-select, filter by
// year, print it for accounts." He uses it to check Phil's invoice, so every
// figure here has to be one a person can put a finger on: a row per course per
// role, a day count on each, and the months totted up down the side.
//
// Everything is worked out from the same blocks the calendar draws, so this
// sheet and the calendar cannot disagree. Nothing is stored.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000
const dnum = (s) => Date.parse(s + 'T00:00:00Z')
const dow = (s) => new Date(s + 'T00:00:00Z').getUTCDay()
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

// Days on a course are Monday to Friday. A block that runs Mon–Mon is six
// working days, not eight, and that is the number on the invoice. A course
// that sits entirely on a weekend (it has happened) still counts its days.
export function workDays(from, to) {
  if (!from) return 0
  const a = dnum(from), b = dnum(to || from)
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0
  let n = 0, all = 0
  for (let t = a; t <= b; t += DAY) { all++; const d = new Date(t).getUTCDay(); if (d !== 0 && d !== 6) n++ }
  return n || all
}

export const ROLES = [
  ['trained', 'Trained', 'Down as the trainer for the whole course'],
  ['assisted', 'Assisted', 'Came in to help, for the days recorded on the course'],
  ['assessed', 'Assessed', 'Down as the assessor — counted as a course, not as days'],
  ['verified', 'Verified', 'Down as the verifier — counted as a course, not as days'],
]

// Every (course, role) pairing for one person in one year.
export function timesheetRows(blocks, staffId, year, roles, schemes) {
  const P = String(staffId)
  const y = String(year)
  const rows = []
  for (const b of blocks || []) {
    if (!b || b.isHoliday || b.isEngagement || b.isInternal || !b.start) continue
    if (!b.start.startsWith(y) && !(b.end || '').startsWith(y)) continue
    if (schemes.length && !schemes.includes(b.scheme || '')) continue
    const base = { id: b.id, course: b.course || b.title || '—', scheme: b.scheme || '', start: b.start, end: b.end || b.start, delegates: (b.delegates || []).length }
    if (roles.includes('trained') && String(b.trainerId) === P) rows.push({ ...base, key: b.id + ':t', role: 'trained', from: b.start, to: b.end || b.start, days: workDays(b.start, b.end) })
    if (roles.includes('assisted')) {
      for (const a of b.assists || []) {
        if (String(a.staffId) !== P) continue
        rows.push({ ...base, key: b.id + ':a' + a.id, role: 'assisted', from: a.from || b.start, to: a.to || a.from || b.end, days: workDays(a.from || b.start, a.to || a.from || b.end), note: a.note })
      }
    }
    if (roles.includes('assessed') && String(b.assessorId) === P) rows.push({ ...base, key: b.id + ':s', role: 'assessed', from: b.start, to: b.end || b.start, days: null })
    if (roles.includes('verified') && String(b.verifierId) === P) rows.push({ ...base, key: b.id + ':v', role: 'verified', from: b.start, to: b.end || b.start, days: null })
  }
  rows.sort((a, b) => a.from.localeCompare(b.from) || a.course.localeCompare(b.course))
  return rows
}

export function timesheetTotals(rows) {
  const byRole = {}
  const byMonth = new Map()
  for (const r of rows) {
    const t = byRole[r.role] || (byRole[r.role] = { courses: 0, days: 0 })
    t.courses++; t.days += r.days || 0
    const m = r.from.slice(0, 7)
    const mm = byMonth.get(m) || { month: m, trained: 0, assisted: 0, courses: 0 }
    mm.courses++
    if (r.role === 'trained') mm.trained += r.days || 0
    if (r.role === 'assisted') mm.assisted += r.days || 0
    byMonth.set(m, mm)
  }
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
  const days = (byRole.trained?.days || 0) + (byRole.assisted?.days || 0)
  return { byRole, months, days, courses: rows.length }
}

const ROLE_LABEL = Object.fromEntries(ROLES.map(([k, l]) => [k, l]))
const monthName = (m) => MONTHS[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4)

// The sheet itself. Used twice: on screen inside the modal, and on paper
// inside the calendar's print area, so what you print is what you saw.
export function TimesheetSheet({ data, print = false }) {
  const { who, year, rows, totals, schemes, roles } = data
  const span = (r) => (r.from === r.to ? fmt(r.from) : `${fmt(r.from)} – ${fmt(r.to)}`)
  return (
    <div className={'ts-sheet' + (print ? ' ts-print' : '')}>
      {print && <h1>Timesheet — {who} — {year}</h1>}
      <p className="cx-print-sub ts-sub">
        {roles.map((r) => ROLE_LABEL[r]).join(' + ')}
        {schemes.length ? ` · ${schemes.join(', ')}` : ' · all course types'}
        {' · days are Monday to Friday'}
        {print ? ` · printed ${fmt(todayISO())}` : ''}
      </p>
      <div className="ts-totals">
        {ROLES.filter(([k]) => roles.includes(k)).map(([k, l]) => {
          const t = totals.byRole[k]
          return (
            <span key={k} className="ts-tot">
              <b>{l}</b> {t ? `${t.courses} course${t.courses === 1 ? '' : 's'}` : 'none'}
              {t && (k === 'trained' || k === 'assisted') ? ` · ${t.days} day${t.days === 1 ? '' : 's'}` : ''}
            </span>
          )
        })}
        <span className="ts-tot ts-grand"><b>Total</b> {totals.days} day{totals.days === 1 ? '' : 's'}</span>
      </div>
      {totals.months.length > 0 && (
        <table className="ts-months">
          <thead><tr><th>Month</th><th>Courses</th><th>Trained (days)</th><th>Assisted (days)</th><th>Days</th></tr></thead>
          <tbody>
            {totals.months.map((m) => (
              <tr key={m.month}>
                <td>{monthName(m.month)}</td><td>{m.courses}</td><td>{m.trained}</td><td>{m.assisted}</td><td><b>{m.trained + m.assisted}</b></td>
              </tr>
            ))}
            <tr className="ts-sum">
              <td>Year</td><td>{totals.courses}</td><td>{totals.byRole.trained?.days || 0}</td><td>{totals.byRole.assisted?.days || 0}</td><td><b>{totals.days}</b></td>
            </tr>
          </tbody>
        </table>
      )}
      <table className="ts-rows">
        <thead><tr><th>Dates</th><th>Course</th><th>Type</th><th>Role</th><th>Days</th><th>On it</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="nowrap">{span(r)}</td>
              <td>{r.course}{r.note ? <span className="muted small"> — {r.note}</span> : null}</td>
              <td>{r.scheme}</td>
              <td><span className={'ts-role ' + r.role}>{ROLE_LABEL[r.role]}</span></td>
              <td>{r.days == null ? '—' : r.days}</td>
              <td>{r.delegates}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="empty">Nothing for {who} in {year}{schemes.length ? ' on those course types' : ''}.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// A drop-down of tick boxes: the multi-select Simon asked for by name.
function CheckDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', off); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc) }
  }, [open])
  const text = value.length === 0 ? `All ${label.toLowerCase()}` : value.length <= 2 ? value.join(', ') : `${value.length} ${label.toLowerCase()}`
  return (
    <div className={'ts-dd' + (open ? ' open' : '')} ref={ref}>
      <button type="button" className="ts-ddbtn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{text}<i /></button>
      {open && (
        <div className="ts-ddlist" role="listbox" aria-multiselectable="true">
          {options.map((o) => (
            <label key={o} className="chk">
              <input type="checkbox" checked={value.includes(o)} onChange={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])} /> {o}
            </label>
          ))}
          {value.length > 0 && <button type="button" className="linkbtn" onClick={() => onChange([])}>Clear — show all</button>}
        </div>
      )}
    </div>
  )
}

export default function Timesheet({ blocks, staff, user, onClose, onPrint }) {
  const years = useMemo(() => {
    const ys = new Set([todayISO().slice(0, 4)])
    for (const b of blocks || []) if (b.start && !b.isHoliday && !b.isEngagement) ys.add(b.start.slice(0, 4))
    return [...ys].sort().reverse()
  }, [blocks])
  const schemesAll = useMemo(
    () => [...new Set((blocks || []).filter((b) => !b.isHoliday && !b.isEngagement && !b.isInternal).map((b) => b.scheme).filter(Boolean))].sort(),
    [blocks])
  // Start on yourself if you are on the staff list, otherwise the first person.
  const [staffId, setStaffId] = useState(() => String(user?.staffId || staff?.[0]?.staff_id || ''))
  const [year, setYear] = useState(() => todayISO().slice(0, 4))
  const [roles, setRoles] = useState(['trained', 'assisted'])
  const [schemes, setSchemes] = useState([])
  const who = (staff || []).find((s) => String(s.staff_id) === staffId)?.name || '—'

  const rows = useMemo(() => timesheetRows(blocks, staffId, year, roles, schemes), [blocks, staffId, year, roles, schemes])
  const totals = useMemo(() => timesheetTotals(rows), [rows])
  const data = { who, year, rows, totals, schemes, roles }

  return (
    <Modal onClose={onClose} label="Timesheet" className="ts-modal">
      <div className="ts-head">
        <h3 style={{ margin: 0 }}>🧾 Timesheet</h3>
        <span className="muted small">What one person trained and assisted on, for accounts. Days are Monday to Friday.</span>
      </div>
      <div className="ts-controls">
        <label className="ts-ctl"><span>Person</span>
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {(staff || []).map((s) => <option key={s.staff_id} value={String(s.staff_id)}>{s.name}</option>)}
          </select>
        </label>
        <label className="ts-ctl"><span>Year</span>
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <div className="ts-ctl"><span>Course types</span>
          <CheckDropdown label="Course types" options={schemesAll} value={schemes} onChange={setSchemes} />
        </div>
        <div className="ts-ctl ts-roles"><span>Count</span>
          <div className="ts-rolechips">
            {ROLES.map(([k, l, tip]) => (
              <button key={k} type="button" className={'inq-chip' + (roles.includes(k) ? ' on' : '')} aria-pressed={roles.includes(k)} title={tip}
                onClick={() => setRoles((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]))}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <TimesheetSheet data={data} />
      <div className="ts-foot">
        <button type="button" className="btn" onClick={() => onPrint(data)} disabled={!rows.length} data-tip="Print this sheet for accounts">🖨 Print this timesheet</button>
        <button type="button" className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
