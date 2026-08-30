import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listBlocks, listCourses, listStaff, listHolidays, getPool, loadPool,
  addDelegatesToBlock, assignBlockRole, updateBlock, returnToPool, staffOnHoliday,
  createBlock, setBookingAttendance,
} from '../lib/api.js'
import { todayISO, fmt } from '../lib/util.js'

/* Dates for the rail, where the column is 300px and a wrapped second line
   doubles a row's height. fmt() gives "01 Jul 2026", which is the year twice
   in a range that almost never crosses one. */
const shortDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—')
const span = (a, b) => {
  if (!a) return '—'
  if (!b || a === b) return shortDate(a)
  const [d1, d2] = [new Date(a), new Date(b)]
  // Same month: "6–10 Jul" rather than "6 Jul – 10 Jul".
  if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) {
    return `${d1.getDate()}\u2013${shortDate(b)}`
  }
  return `${shortDate(a)}\u2009\u2013\u2009${shortDate(b)}`
}
import { toast } from '../lib/toast.js'
import Popover from '../components/Popover.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR (NEW) — a visual revamp, on its own tab. Nothing existing is touched.
//
// Same structure as the calendar people already know — a month grid you drag on
// — but rebuilt to stop feeling like a spreadsheet: real type hierarchy, room
// to breathe, motion that explains what just happened, an agenda rail so the
// week reads at a glance, and a dark mode.
//
// Everything is namespaced `.cx-` so it cannot collide with the live calendar.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000
const iso = (d) => new Date(d).toISOString().slice(0, 10)
const dnum = (s) => Date.parse(s + 'T00:00:00Z')
const addDays = (s, n) => iso(dnum(s) + n * DAY)
const between = (a, b) => Math.round((dnum(b) - dnum(a)) / DAY)
const dow = (s) => new Date(s + 'T00:00:00Z').getUTCDay()
const isWknd = (s) => dow(s) === 0 || dow(s) === 6
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// How each delegate on a course is counted. The bar carries a stripe of these
// so a mixed course reads at a glance without opening it.
const KIND = {
  NEW:      { c: '#1f9d55', label: 'New' },
  REASSESS: { c: '#2f6fd0', label: 'Reassessment' },
  MIXED:    { c: '#7b2ff2', label: 'Mixed' },
  NYC:      { c: '#b7791f', label: 'Not yet competent' },
  NO_SHOW:  { c: '#c0392b', label: 'No-show' },
}
const kindOf = (k) => KIND[k] || KIND.NEW

/* The distinct reasons people are on a course, in the catalogue's own order.
   The bar used to draw one segment per delegate across its whole width, which
   on a one-delegate course is a solid line nobody reads as information and on
   a ten-delegate course is a smear. What anyone actually wants to know is
   whether this course is all one thing or a mixture. */
/* What a course says when you hover it. Deliberately repeats what the panel
   shows on click — a tip must never be the ONLY route to a fact, because a
   tablet has no hover. This is the shortcut for a mouse, not a hiding place. */
function barTip(b) {
  if (!b) return ''
  if (b.isHoliday) return `${b.course || b.title}\n${span(b.start, b.end)} \u00b7 time off`
  const days = between(b.start, b.end) + 1
  const lines = [
    b.course || b.title,
    `${span(b.start, b.end)} \u00b7 ${days} day${days === 1 ? '' : 's'}`,
    b.trainerGone ? `${b.trainer} \u2014 has left, needs a trainer`
      : b.trainer ? `Trainer: ${b.trainer}` : 'No trainer yet',
  ]
  const n = b.delegates?.length || 0
  const kinds = {}
  for (const d of b.delegates || []) {
    const l = kindOf(d.kind).label
    kinds[l] = (kinds[l] || 0) + 1
  }
  const mix = Object.entries(kinds).map(([l, c]) => `${c} ${l.toLowerCase()}`).join(', ')
  lines.push(n === 0 ? 'Nobody booked on yet' : `${n} booked${mix ? ` \u00b7 ${mix}` : ''}`)
  if (!b.ready) lines.push(!b.trainerId ? '\u26a0 Needs a trainer' : n === 0 ? '\u26a0 Needs delegates' : '\u26a0 Needs attention')
  return lines.join('\n')
}

const kindsOn = (delegates) => {
  const seen = new Set()
  for (const d of delegates || []) seen.add(kindOf(d.kind).c)
  return [...seen].slice(0, 4)
}
// A delegate doing only part of a course — the "split" case.
const isPart = (d) => !!(d.attendFrom || d.attendTo)

// A colour per scheme, so "who is waiting and what for" reads without being
// read. The schemes we actually run are pinned; anything new hashes to the same
// palette so it is at least stable between visits.
const SCHEME_C = {
  'ACS Domestic': '#2f6fd0', 'ACS Commercial': '#1d4ed8', 'Industrial': '#3730a3',
  'LPG': '#b45309', 'OFTEC': '#c2410c', 'Solid Fuel': '#7c2d12',
  'Renewables': '#1f9d55', 'Electrical': '#0f766e', 'F-gas': '#0891b2',
  'Water': '#0369a1', 'Meters': '#7b2ff2', 'IGAS': '#a21caf',
  'Catering': '#be185d', 'Laundry': '#9d174d', 'ESP': '#4d7c0f',
  'Limited Scope': '#57534e',
}
const PALETTE = ['#2f6fd0', '#1f9d55', '#b45309', '#7b2ff2', '#0891b2', '#be185d', '#4d7c0f', '#c2410c']
export function schemeColour(name) {
  if (!name) return '#94a3b8'
  if (SCHEME_C[name]) return SCHEME_C[name]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

const RAIL_KEY = 'sgas_cx_rail'
const CARDS_KEY = 'sgas_cx_cards'
const VIEW_KEY = 'sgas_cx_view'
const THEME_KEY = 'sgas_cx_theme'
const DENSE_KEY = 'sgas_cx_dense'
const readLS = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }

export default function CalendarNext({ isAdmin, user, go }) {
  const [blocks, setBlocks] = useState(null)
  const [staff, setStaff] = useState([])
  const [holidays, setHolidays] = useState([])
  const [pool, setPool] = useState([])
  const [view, setView] = useState(() => readLS(VIEW_KEY, 'Month'))
  // One date drives every view. Keeping a separate `month` meant paging to
  // July in Month and then clicking Week threw you back to today.
  const [anchor, setAnchor] = useState(todayISO())
  const month = anchor.slice(0, 7)
  const [dir, setDir] = useState(0)              // -1 back, +1 forward: drives the slide
  const [open, setOpen] = useState(null)         // the course being viewed
  const [theme, setTheme] = useState(() => readLS(THEME_KEY, 'light'))
  const [dense, setDense] = useState(() => readLS(DENSE_KEY, '0') === '1')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(null)
  const [courses, setCourses] = useState([])
  const [creating, setCreating] = useState(null)   // { from, to } after a drag
  const [hint, setHint] = useState(null)     // the chip that rides the bar you drag
  // Selecting empty days has no bar to ride, so its chip follows the pointer.
  const [selHint, setSelHint] = useState(null)
  // Dragging a person out of the rail and onto the calendar. Pointer events,
  // not HTML5 drag-and-drop, which is dead on touch — the Schedule board still
  // proves that. Everything here is an accelerator: the popover keeps a
  // non-drag route for all four of these, which is what WCAG 2.2 asks for.
  const [drag, setDrag] = useState(null)   // { kind, item, label, colour, x, y, over }
  // While a course is being dragged its dates live here, and the whole grid
  // lays out from them. Nudging inline width/transform could not reflow a
  // course across a week boundary, so shrinking a two-row course looked stuck.
  const [preview, setPreview] = useState(null)     // { id, start, end }
  // A drag ends with a click. Without this the click opened the course you had
  // just finished dragging.
  const justDragged = useRef(false)
  const [at, setAt] = useState(null)   // the bar the popover is anchored to
  // The rail is a sidebar of things to deal with, not part of the calendar —
  // it slides in when you want it and gets out of the way when you don't.
  const [rail, setRail] = useState(() => {
    const v = readLS(RAIL_KEY, null)
    return v === null ? window.innerWidth >= 1280 : v === '1'
  })
  // With four cards the rail runs off the bottom of the screen, so each one
  // folds. Trainers starts folded: it is the one you reach for least.
  const [shut, setShut] = useState(() => {
    try { return JSON.parse(readLS(CARDS_KEY, '') || '{"trainers":1}') } catch { return { trainers: 1 } }
  })
  const toggleCard = (id) => setShut((c) => ({ ...c, [id]: c[id] ? 0 : 1 }))
  const [jump, setJump] = useState(false)
  // Off by default: the key is a reference, not part of reading the calendar.
  const [showKey, setShowKey] = useState(false)
  // The rail's headings always showed the true count while the list underneath
  // was cut to a handful with no way to reach the rest — so "Waiting to be
  // placed 8" listed six people and the other two were simply gone.
  const [showAll, setShowAll] = useState({})
  const cap = (id, list, n) => (showAll[id] ? list : list.slice(0, n))
  const More = ({ id, list, n }) => (list.length > n && !showAll[id] ? (
    <button type="button" className="cx-more" onClick={() => setShowAll((s) => ({ ...s, [id]: true }))}>
      Show the other {list.length - n}
    </button>
  ) : list.length > n ? (
    <button type="button" className="cx-more" onClick={() => setShowAll((s) => ({ ...s, [id]: false }))}>
      Show fewer
    </button>
  ) : null)
  const [jumpY, setJumpY] = useState(() => Number(todayISO().slice(0, 4)))

  async function load() {
    const [b, s, h, cs] = await Promise.all([listBlocks(), listStaff(), listHolidays(), listCourses()])
    setBlocks(b); setStaff(s); setHolidays(h); setPool(getPool())
    setCourses(cs.filter((c) => c.is_active !== false))
    return b
  }
  useEffect(() => { (async () => { try { await loadPool() } catch { /* optional */ } await load() })() }, [])
  useEffect(() => { try { localStorage.setItem(THEME_KEY, theme) } catch { /* private */ } }, [theme])
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* private */ } }, [view])
  useEffect(() => { try { localStorage.setItem(RAIL_KEY, rail ? '1' : '0') } catch { /* private */ } }, [rail])
  useEffect(() => { try { localStorage.setItem(CARDS_KEY, JSON.stringify(shut)) } catch { /* private */ } }, [shut])
  useEffect(() => { try { localStorage.setItem(DENSE_KEY, dense ? '1' : '0') } catch { /* private */ } }, [dense])

  const step = (n) => {
    setDir(n)
    if (view === 'Week') return setAnchor((a) => addDays(a, n * 7))
    if (view === 'Day') return setAnchor((a) => addDays(a, n))
    const by = view === 'Year' ? 12 : 1
    setAnchor((a) => {
      const d = new Date(a + 'T00:00:00Z')
      const day = d.getUTCDate()
      d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n * by)
      const len = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
      d.setUTCDate(Math.min(day, len))
      return d.toISOString().slice(0, 10)
    })
  }
  const goToday = () => { setDir(0); setAnchor(todayISO()) }
  // Open a course beside the bar you clicked, not over the middle of the screen.
  const openAt = (b, e) => {
    if (justDragged.current) return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    // Anchor by selector and by how far along the bar you clicked — not by the
    // rect, which is frozen the moment you click. A frozen rect left the panel
    // nailed to the screen while the calendar scrolled away underneath it.
    const fx = r.width ? ((e.clientX ?? (r.left + r.width / 2)) - r.left) / r.width : 0.5
    // Point the selector at the same KIND of element that was clicked. A rail
    // row must not resolve to the calendar bar for that course — the course may
    // not even be in the month you are looking at.
    const sel = el.dataset.d ? `[data-d="${el.dataset.d}"]`
      : el.dataset.bid ? `${el.classList.contains('cx-row') ? '.cx-row' : '.cx-bar'}[data-bid="${el.dataset.bid}"]`
        : null
    setAt(sel ? { sel, fx } : null)
    setOpen(b)
  }
  // Dragging the dates from inside the popover, the same commit path the
  // drag-on-the-grid uses.
  const saveDates = async (from, to) => {
    const next = { from: from || open.start, to: to || open.end }
    if (next.to < next.from) next.to = next.from
    setBusy(true)
    try {
      await updateBlock(open.id, next)
      const f = await load(); setOpen(f.find((x) => x.id === open.id) || null); toast('Dates changed')
    } catch (err) { toast(err.message) } finally { setBusy(false) }
  }
  useEffect(() => { setJumpY(Number(month.slice(0, 4))) }, [month])
  useEffect(() => {
    if (!jump) return
    const off = (e) => { if (!e.target.closest?.('.cx-jump, .cx-title')) setJump(false) }
    const esc = (e) => { if (e.key === 'Escape') setJump(false) }
    document.addEventListener('pointerdown', off); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc) }
  }, [jump])

  // Monday-first week containing the anchor.
  const weekDays = useMemo(() => {
    const back = (dow(anchor) + 6) % 7
    const mon = addDays(anchor, -back)
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  }, [anchor])
  const viewDays = view === 'Day' ? [anchor] : weekDays

  // Blocks as they should currently be drawn — the live drag included.
  const shown = useMemo(() => (blocks || []).map((b) => (
    preview && preview.id === b.id ? { ...b, start: preview.start, end: preview.end } : b
  )), [blocks, preview])

  // ── The six-week grid ─────────────────────────────────────────────────────
  const grid = useMemo(() => {
    const first = month + '-01'
    const lead = (dow(first) + 6) % 7                       // Monday-first
    const start = addDays(first, -lead)
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
    // Six rows are only needed when the month actually spills into one.
    const rows = days[35] && days[35].slice(0, 7) === month ? 6 : 5
    return { start, days: days.slice(0, rows * 7), rows }
  }, [month])

  // A block becomes one segment per week row it crosses.
  const segments = useMemo(() => {
    const out = []
    if (!blocks) return out
    const blocksForLayout = shown
    const last = grid.days[grid.days.length - 1]
    for (const b of blocksForLayout) {
      if (!b.start || !b.end || b.end < grid.start || b.start > last) continue
      let cur = b.start < grid.start ? grid.start : b.start
      const fin = b.end > last ? last : b.end
      while (cur <= fin) {
        const i = between(grid.start, cur)
        const col = i % 7, row = Math.floor(i / 7)
        const span = Math.min(7 - col, between(cur, fin) + 1)
        out.push({ b, row, col, span, key: b.id + ':' + cur, head: cur === b.start,
          tail: addDays(cur, span - 1) >= fin })
        cur = addDays(cur, span)
      }
    }
    // Lane-pack each row so overlapping courses stack instead of hiding.
    const byRow = new Map()
    for (const s of out) { if (!byRow.has(s.row)) byRow.set(s.row, []); byRow.get(s.row).push(s) }
    for (const list of byRow.values()) {
      list.sort((a, z) => a.col - z.col || z.span - a.span)
      const lanes = []
      for (const s of list) {
        let i = 0
        while (i < lanes.length && lanes[i] > s.col) i++
        if (i === lanes.length) lanes.push(0)
        lanes[i] = s.col + s.span; s.lane = i
      }
    }
    return out
  }, [shown, blocks, grid])

  const lanesIn = (r) => Math.max(0, ...segments.filter((s) => s.row === r).map((s) => s.lane + 1), 0)

  // ── The agenda rail: what is actually coming up ───────────────────────────
  // In Year view the rail has to cover the year, or it says "no courses this
  // month" next to a screen full of them.
  const inRange = (b) => (view === 'Year'
    ? b.start.slice(0, 4) <= month.slice(0, 4) && b.end.slice(0, 4) >= month.slice(0, 4)
    : b.start.slice(0, 7) <= month && b.end.slice(0, 7) >= month)
  const thisMonth = useMemo(() => (shown || [])
    .filter((b) => !b.isHoliday && !b.isEngagement && inRange(b))
    .sort((a, z) => a.start.localeCompare(z.start)), [shown, month, view])
  // Scoped to the month, this hid overdue problems the moment you paged away
  // from them. An alert is only an alert if it follows you.
  const needsWork = useMemo(() => (shown || [])
    .filter((b) => !b.isHoliday && !b.isEngagement && (!b.trainerId || b.trainerGone || !b.delegates.length))
    .sort((a, z) => a.start.localeCompare(z.start)), [shown])
  // What a trainer already has on, so you are not dropping blind.
  const teaching = (id) => {
    const n = thisMonth.filter((b) => String(b.trainerId) === String(id)).length
    return n ? `${n} course${n === 1 ? '' : 's'} ${view === 'Year' ? 'this year' : 'this month'}` : 'nothing booked'
  }
  const monthLabel = view === 'Year' ? month.slice(0, 4) : MONTHS[Number(month.slice(5, 7)) - 1]

  // ── Dragging people and trainers onto the calendar ───────────────────────
  // Pointer events, not HTML5 drag-and-drop, which is dead on touch — the
  // Schedule board still proves that. All four of these are accelerators: the
  // popover keeps a non-drag route for every one, which is what WCAG 2.2 asks.
  //
  // `over` is the drop target under the pointer right now:
  //   { type: 'course', id }  a course bar
  //   { type: 'day', d }      a day in any grid
  //   { type: 'pool' }        the waiting list, to take somebody off a course
  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y)
    if (!el) return null
    if (el.closest('.cx-droppool')) return { type: 'pool' }
    const bar = el.closest('.cx-bar[data-bid]')
    if (bar) return { type: 'course', id: bar.dataset.bid }
    const cell = el.closest('[data-d]')
    if (cell) return { type: 'day', d: cell.dataset.d }
    return null
  }

  // Would this drop do anything, and is it a good idea? One place decides, so
  // the highlight under the pointer and what actually happens can never differ.
  function dropVerdict(d, over) {
    if (!d || !over) return null
    const block = over.type === 'course' ? (blocks || []).find((b) => String(b.id) === String(over.id)) : null
    if (over.type === 'course' && (!block || block.isHoliday || block.isEngagement)) return null
    // A course that has already run is history. The Schedule board has always
    // refused to change one; this screen did not, so somebody could be dropped
    // onto a course that finished last year and the record would quietly change.
    if (block && block.end < todayISO()) {
      return { ok: false, why: `${block.course} has already finished` }
    }
    if (d.kind === 'staff') {
      if (over.type !== 'course') return null
      if (String(block.trainerId) === String(d.item.staff_id)) return { ok: false, why: `${d.label} already has it` }
      const away = staffOnHoliday(holidays, d.item.staff_id, block.start, block.end)
      return { ok: true, warn: away, why: away ? `${d.label} is on holiday then` : `${d.label} teaches ${block.course}` }
    }
    if (d.kind === 'pool') {
      if (over.type === 'course') {
        if (block.delegates.some((x) => x.name === d.label)) return { ok: false, why: `${d.label} is already on it` }
        const clash = d.item.scheme && block.scheme && d.item.scheme !== block.scheme
        return { ok: true, warn: clash, why: clash ? `${d.label} is waiting for ${d.item.scheme}, not ${block.scheme}` : `${d.label} joins ${block.course}` }
      }
      if (over.type === 'day') return { ok: true, why: `Book a course for ${d.label} on ${fmt(over.d)}` }
      return null
    }
    if (d.kind === 'delegate') {
      if (over.type === 'pool') return { ok: true, why: `${d.label} goes back on the waiting list` }
      if (over.type === 'course') return { ok: false, why: 'Put them back on the waiting list first' }
      return null
    }
    return null
  }

  // The class the thing under the pointer wears while you hover it. While
  // placing by tap there is no pointer, so everything droppable is marked.
  const dropClass = (type, key) => {
    if (placing) {
      const v = dropVerdict(placing, type === 'course' ? { type, id: key } : { type, d: key })
      return v ? (v.ok ? (v.warn ? ' drop-warn' : ' drop-ok') : '') : ''
    }
    if (!drag?.over || drag.over.type !== type) return ''
    if (type === 'course' && String(drag.over.id) !== String(key)) return ''
    if (type === 'day' && drag.over.d !== key) return ''
    const v = drag.verdict
    return v ? (v.ok ? (v.warn ? ' drop-warn' : ' drop-ok') : ' drop-no') : ' drop-no'
  }

  // Dragging a person the length of a phone screen is a bad gesture however
  // well it is built. So picking up is also a TAP: tap somebody, then tap where
  // they go. Same verdicts, same drops, no dragging at all.
  const [placing, setPlacing] = useState(null)   // { kind, item, label, colour }
  // Spring-loaded: hovering a folded card mid-drag opens it, and picking anybody
  // up opens the waiting list, so folding it away never costs you a drop target.
  useEffect(() => {
    if (!shut.pool) return
    if (drag?.over?.type === 'pool' || placing?.kind === 'delegate') setShut((c) => ({ ...c, pool: 0 }))
  }, [drag?.over?.type, placing, shut.pool])
  useEffect(() => {
    if (!placing) return
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setPlacing(null) } }
    document.addEventListener('keydown', esc, true)
    return () => document.removeEventListener('keydown', esc, true)
  }, [placing])

  // While placing, a tap anywhere on the calendar is the drop.
  async function placeAt(e) {
    if (!placing) return false
    const over = targetAt(e.clientX, e.clientY)
    // Only swallow the tap if it would actually DO something. Tapping another
    // person in the list should switch to them, not silently cancel.
    if (!over || !dropVerdict(placing, over)) return false
    e.preventDefault(); e.stopPropagation()
    const d = placing
    setPlacing(null)
    justDragged.current = true
    setTimeout(() => { justDragged.current = false }, 250)
    await performDrop(d, over)
    return true
  }

  function dragStart(kind, item, label, colour, e) {
    if (!isAdmin || (e.button != null && e.button !== 0)) return
    const x0 = e.clientX, y0 = e.clientY
    let live = false
    // On a phone or a tablet the rail sits BELOW the calendar, so the thing you
    // are dragging from and the thing you are dropping onto are never on screen
    // together. Holding near an edge scrolls the page under your finger.
    let py = y0, raf = 0
    // Inside EDGE_BAND the page scrolls; inside HARD_BAND it scrolls whatever
    // is under you, so there is always a way to keep going.
    const EDGE_BAND = 90, HARD_BAND = 40, MAX_STEP = 22
    const autoScroll = () => {
      raf = 0
      if (!live) return
      const vh = window.innerHeight
      // Found what you were looking for? Then hold still — a course near the
      // top of the screen used to slide out from under the pointer the moment
      // you reached it. Right at the very edge it always scrolls, so you are
      // never stuck on something you were only passing over.
      if (py > HARD_BAND && py < vh - HARD_BAND) {
        const here = targetAt(lastX, py)
        if (here && dropVerdict({ kind, item, label }, here)) { raf = requestAnimationFrame(autoScroll); return }
      }
      let dy = 0
      if (py < EDGE_BAND) dy = -MAX_STEP * (1 - py / EDGE_BAND)
      else if (py > vh - EDGE_BAND) dy = MAX_STEP * (1 - (vh - py) / EDGE_BAND)
      if (dy) {
        const before = window.scrollY
        window.scrollBy(0, dy)
        // Nothing left to scroll? Stop asking every frame.
        if (window.scrollY !== before) {
          const over = targetAt(lastX, py)
          setDrag((g) => (g ? { ...g, y: py, over, verdict: dropVerdict({ kind, item, label }, over) } : g))
        }
      }
      raf = requestAnimationFrame(autoScroll)
    }
    let lastX = x0
    const move = (ev) => {
      // A click must still be a click. Nothing happens until you mean it.
      if (!live) {
        if (Math.abs(ev.clientX - x0) < 5 && Math.abs(ev.clientY - y0) < 5) return
        live = true
        document.body.classList.add('cx-dragging')
      }
      lastX = ev.clientX; py = ev.clientY
      if (!raf) raf = requestAnimationFrame(autoScroll)
      const over = targetAt(ev.clientX, ev.clientY)
      setDrag({ kind, item, label, colour, x: ev.clientX, y: ev.clientY, over,
        verdict: dropVerdict({ kind, item, label }, over) })
    }
    const end = (ok) => async (ev) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cx)
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      document.body.classList.remove('cx-dragging')
      const over = live && ok ? targetAt(ev.clientX, ev.clientY) : null
      setDrag(null)
      if (!live) {
        // A tap, not a drag: pick them up and wait for you to tap a target.
        if (ok) {
          setPlacing((cur) => (cur && cur.label === label ? null : { kind, item, label, colour }))
          // Picked somebody up from inside the course panel? Get the panel out
          // of the way — on a phone it is a full-width sheet over the very list
          // you now have to tap.
          if (kind === 'delegate') setOpen(null)
        }
        return
      }
      // Swallow the click this drag is about to produce.
      justDragged.current = true
      setTimeout(() => { justDragged.current = false }, 250)
      if (over) await performDrop({ kind, item, label }, over)
    }
    const up = end(true), cx = end(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cx)
  }

  async function performDrop(d, over) {
    const v = dropVerdict(d, over)
    if (!v || !v.ok) { if (v?.why) toast(v.why); return }
    if (v.warn && !window.confirm(`${v.why}. Go ahead anyway?`)) return
    const block = over.type === 'course' ? (blocks || []).find((b) => String(b.id) === String(over.id)) : null
    setBusy(true)
    try {
      if (d.kind === 'staff') {
        await assignBlockRole(block.id, 'trainer', Number(d.item.staff_id))
        await load(); setFlash(String(block.id)); setTimeout(() => setFlash(null), 900)
        toast(`${d.label} is teaching ${block.course}`)
      } else if (d.kind === 'pool' && over.type === 'course') {
        await addDelegatesToBlock(block.id, [d.item.id])
        await load(); setFlash(String(block.id)); setTimeout(() => setFlash(null), 900)
        toast(`${d.label} added to ${block.course}`)
      } else if (d.kind === 'pool' && over.type === 'day') {
        // Booking a course FOR somebody: the panel opens on that day with the
        // course list narrowed to what they are waiting for, and they go on it
        // the moment it is booked.
        setAt({ sel: `[data-d="${over.d}"]`, fx: 0.5 })
        setCreating({ from: over.d, to: over.d, forPool: d.item })
      } else if (d.kind === 'delegate' && over.type === 'pool') {
        await returnToPool(d.item.bookingId)
        const f = await load()
        setOpen((o) => (o ? f.find((x) => x.id === o.id) || null : null))
        toast(`${d.label} is back on the waiting list`)
      }
    } catch (err) { toast(err.message) } finally { setBusy(false) }
  }

  // ── Drag to create, drag a bar to move ───────────────────────────────────
  const [sel, setSel] = useState(null)
  // Drag across days to book a course. Every grid that can be dragged on marks
  // its day cells with data-d, so this one handler serves the month grid, the
  // week and day all-day band, and the year rows.
  function cellDown(d, e) {
    if (!isAdmin || (e.button != null && e.button !== 0)) return
    setSel({ from: d, to: d })
    const x0 = e.clientX, y0 = e.clientY
    let moved = false
    let last = { from: d, to: d }
    const move = (ev) => {
      if (Math.abs(ev.clientX - x0) > 3 || Math.abs(ev.clientY - y0) > 3) moved = true
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const c = el?.closest?.('[data-d]')
      if (c?.dataset.d) {
        last = { from: d < c.dataset.d ? d : c.dataset.d, to: d < c.dataset.d ? c.dataset.d : d }
        setSel(last)
      }
      const n = between(last.from, last.to) + 1
      setSelHint({ x: ev.clientX, y: ev.clientY,
        text: `${n} day${n === 1 ? '' : 's'} · ${fmt(last.from)} – ${fmt(last.to)}` })
    }
    const end = (ok) => () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cx)
      setSelHint(null)
      // A drag books a course; a plain click does not. Judged on whether the
      // pointer moved, not on whether the dates differ — otherwise a one-day
      // course could never be booked by dragging.
      setSel((sl) => {
        if (ok && sl && moved) {
          setAt({ sel: `[data-d="${sl.to}"]`, fx: 0.5 })
          setCreating({ from: sl.from, to: sl.to })
        }
        return null
      })
    }
    const up = end(true), cx = end(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cx)
  }
  // Dragging a course. Three things make this feel right and all three were
  // missing: the bar has to follow in WHOLE DAY steps (pixel-following then
  // snapping on release feels mushy), its CSS transition has to be off while
  // you drag (or it rubber-bands a frame behind the pointer), and the resize
  // has to measure its starting width ONCE — reading offsetWidth each frame
  // just fed the bar its own value back, so it never moved at all.
  function barDown(b, e, mode) {
    if (!isAdmin) return
    e.preventDefault(); e.stopPropagation()
    const el = e.currentTarget.closest('.cx-bar')
    // Every draggable grid says how many columns it has, so one handler serves
    // the month, week and year views.
    const track = el.closest('[data-cols]')
    if (!track) return
    const colW = track.getBoundingClientRect().width / Number(track.dataset.cols)
    const x0 = e.clientX
    const spanDays = between(b.start, b.end) + 1
    el.setPointerCapture?.(e.pointerId)
    document.body.classList.add('cx-dragging')
    let delta = 0, moved = false

    const dates = (d) => {
      const from = mode === 'move' ? addDays(b.start, d) : b.start
      let to = addDays(b.end, d)
      if (to < from) to = from
      return { from, to }
    }

    const move = (ev) => {
      const dx = ev.clientX - x0
      if (Math.abs(dx) > 3) moved = true
      let d = Math.round(dx / colW)
      // Never shorter than a single day; otherwise shrink as far as you like,
      // including back down from a course that wrapped onto another week.
      if (mode === 'resize') d = Math.max(d, -(spanDays - 1))
      if (d !== delta) {
        delta = d
        const { from, to } = dates(d)
        // Re-lay the grid from these dates, so a course that spans two weeks
        // reflows as you drag instead of being stuck at its old shape.
        setPreview({ id: b.id, start: from, end: to })
      }
      const { from, to } = dates(delta)
      const n = between(from, to) + 1
      setHint(`${n} day${n === 1 ? '' : 's'} · ${fmt(from)} – ${fmt(to)}`)
    }

    const finish = async (commit) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      document.body.classList.remove('cx-dragging')
      setHint(null)
      if (moved) {
        // Swallow the click this drag is about to produce.
        justDragged.current = true
        setTimeout(() => { justDragged.current = false }, 250)
      }
      if (!commit || !moved || !delta) { setPreview(null); return }
      const { from, to } = dates(delta)
      // Keep it where it was dropped while the save runs.
      setBlocks((bs) => (bs || []).map((x) => (x.id === b.id ? { ...x, start: from, end: to } : x)))
      setPreview(null)
      setFlash(String(b.id)); setTimeout(() => setFlash(null), 800)
      setBusy(true)
      try { await updateBlock(b.id, { from, to }); await load() }
      catch (err) { toast(err.message); await load() }
      finally { setBusy(false) }
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const inSel = (d) => sel && d >= sel.from && d <= sel.to
  const title = view === 'Day'
    ? new Date(anchor + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : view === 'Week'
      ? `${fmt(weekDays[0])} – ${fmt(weekDays[6])}`
      : view === 'Year'
        ? month.slice(0, 4)
        : MONTHS[Number(month.slice(5, 7)) - 1] + ' ' + month.slice(0, 4)

  return (
    <div className={'cx' + (theme === 'dark' ? ' cx-dark' : '') + (dense ? ' cx-dense' : '')}>
      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <header className="cx-bar-top">
        <div className="cx-title-wrap">
          {/* Paging one month at a time from July to November was four clicks. */}
          <button type="button" className="cx-title" aria-haspopup="true" aria-expanded={jump}
            onClick={() => setJump((j) => !j)}>{title}<i /></button>
          {jump && (
            <div className="cx-jump" role="dialog" aria-label="Jump to a month">
              <div className="cx-jump-y">
                <button onClick={() => setJumpY((y) => y - 1)} aria-label="Previous year">‹</button>
                <b>{jumpY}</b>
                <button onClick={() => setJumpY((y) => y + 1)} aria-label="Next year">›</button>
              </div>
              <div className="cx-jump-g">
                {MONTHS.map((mn, i) => (
                  <button key={mn} className={month === `${jumpY}-${String(i + 1).padStart(2, '0')}` ? 'on' : ''}
                    onClick={() => { setDir(0); setAnchor(`${jumpY}-${String(i + 1).padStart(2, '0')}-01`); setJump(false) }}>
                    {mn.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="cx-steps">
            <button onClick={() => step(-1)} aria-label="Previous month" data-tip="Previous">‹</button>
            <button onClick={() => step(1)} aria-label="Next month" data-tip="Next">›</button>
          </div>
          <button className="cx-today" onClick={goToday} data-tip="Jump back to today">Today</button>
          {/* Beside the controls, not in a band of its own above the grid. */}
          <button type="button" className="cx-keybtn" aria-expanded={showKey}
            onClick={() => setShowKey((k) => !k)}>
            <i className="cx-chev" aria-hidden="true" />What the marks mean
          </button>
        </div>
        <div className="cx-tools">
          <div className="cx-seg" role="group" aria-label="View">
            {['Day', 'Week', 'Month', 'Year'].map((v) => (
              <button key={v} className={view === v ? 'on' : ''} onClick={() => { setDir(0); setView(v) }}>{v}</button>
            ))}
          </div>
          <button className={'cx-icon' + (dense ? ' on' : '')} onClick={() => setDense(!dense)}
            aria-pressed={dense} aria-label={dense ? 'Roomier rows' : 'Fit more in'}
            data-tip={dense ? 'Roomier rows' : 'Fit more courses on screen'}>{dense ? '\u2637' : '\u2630'}</button>
          <button className={'cx-icon cx-railbtn' + (rail ? ' on' : '')} onClick={() => setRail((r) => !r)}
            aria-pressed={rail} aria-label={rail ? 'Hide the side panel' : 'Show the side panel'}
            data-tip={rail ? 'Hide the side panel' : `Show the side panel${needsWork.length ? ` \u00b7 ${needsWork.length} need attention` : ''}`}>
            ▤{!rail && needsWork.length > 0 && <em>{needsWork.length}</em>}
          </button>
          <button className="cx-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            data-tip={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          {/* The words go on a phone: they cost about 100px, which is the
              difference between the toolbar fitting on two rows and spilling
              onto a third. The ＋ and the tooltip carry it. */}
          {isAdmin && (
            <button className="cx-primary" onClick={() => go?.('setup')} data-tip="Set up a new course">
              ＋<span className="cx-lbl">New course</span>
            </button>
          )}
        </div>
      </header>

      {/* The key used to be two permanent rows of capitals above the calendar —
          about 90px of a laptop screen spent explaining marks that most people
          need explained once. It is a click away instead, and the calendar
          starts 90px higher. */}
      {showKey && (
        <div className="cx-legend">
          <b>Dots on a course — why people are on it:</b>
          {Object.entries(KIND).filter(([k]) => k !== 'MIXED').map(([k, v]) => (
            <span key={k}><i style={{ background: v.c }} />{v.label}</span>
          ))}
          <span><i className="cx-l-part" />Doing part of it</span>
          <span className="cx-l-sep" />
          <span><i className="cx-l-warn" />Needs a trainer or delegates</span>
        </div>
      )}

      {drag && (
        <>
          <div className="cx-draghost" style={{ left: drag.x, top: drag.y, '--s': drag.colour }}>
            <b>{drag.label}</b>
            {drag.verdict && <small className={drag.verdict.ok ? (drag.verdict.warn ? 'warn' : 'ok') : 'no'}>{drag.verdict.why}</small>}
          </div>
        </>
      )}
      {selHint && (
        <div className="cx-chip-len float" style={{ left: selHint.x, top: selHint.y - 26 }}>{selHint.text}</div>
      )}
      {/* Placing by tap: one bar telling you what you are holding and how to
          put it down. This is the route that works on a phone, and it is the
          non-drag route WCAG 2.2 asks for on every device. */}
      {placing && (
        <div className="cx-placing" role="status">
          <span className="cx-placing-who">
            <i className="cx-placing-dot" style={{ background: placing.colour }} />
            <b>{placing.label}</b>
          </span>
          <span className="cx-placing-what">
            {placing.kind === 'delegate'
              ? 'Tap the waiting list to take them off'
              : placing.kind === 'staff'
                ? 'Tap a course to put them on it'
                : 'Tap a course to add them, or any day to book one'}
          </span>
          <button className="cx-x" onClick={() => setPlacing(null)}>Cancel</button>
        </div>
      )}
      <div className={'cx-body' + (rail ? '' : ' no-rail') + (placing ? ' placing' : '')}
        onPointerDownCapture={(e) => { if (placing) placeAt(e) }}>
        {/* ── Month grid ──────────────────────────────────────────────── */}
        <section className="cx-cal" aria-label={'Courses — ' + title}>
          {view === 'Month' && <div className="cx-dow">{DOW.map((d) => <div key={d}>{d}</div>)}</div>}

          {blocks === null ? (
            <div className="cx-skel">{Array.from({ length: 35 }, (_, i) => <div key={i} />)}</div>
          ) : view === 'Year' ? (
            <YearGrid year={month.slice(0, 4)} blocks={shown} onOpen={openAt} isAdmin={isAdmin}
              onBarDown={barDown} flash={flash} chip={hint && preview ? { id: preview.id, text: hint } : null}
              onCellDown={cellDown} inSel={inSel} isAdmin={isAdmin} dropClass={dropClass} />
          ) : view !== 'Month' ? (
            <DaysGrid days={viewDays} blocks={shown} onOpen={openAt} isAdmin={isAdmin}
              onBarDown={barDown} flash={flash} single={view === 'Day'} chip={hint && preview ? { id: preview.id, text: hint } : null}
              onCellDown={cellDown} inSel={inSel} dropClass={dropClass} />
          ) : (
            <div className={'cx-grid ' + (dir < 0 ? 'from-left' : dir > 0 ? 'from-right' : 'fade')} key={month}>
              {Array.from({ length: grid.rows }, (_, r) => (
                <div className="cx-week" data-cols="7" key={r} style={{ '--lanes': lanesIn(r) }}>
                  {Array.from({ length: 7 }, (_, c) => {
                    const d = grid.days[r * 7 + c]
                    const out = d.slice(0, 7) !== month
                    const today = d === todayISO()
                    return (
                      <div key={d} data-d={d}
                        className={'cx-cell' + (out ? ' out' : '') + (isWknd(d) ? ' wknd' : '') + (today ? ' today' : '') + (inSel(d) ? ' sel' : '') + dropClass('day', d)}
                        onPointerDown={(e) => cellDown(d, e)}>
                        <span className="cx-num">{today ? <b>{Number(d.slice(8))}</b> : Number(d.slice(8))}</span>
                      </div>
                    )
                  })}
                  {segments.filter((s) => s.row === r).map((s) => (
                    <button key={s.key} type="button" data-bid={s.b.id} data-head={s.head ? '1' : '0'}
                      className={'cx-bar' + (s.b.isHoliday ? ' hol' : '') + (!s.b.ready ? ' warn' : '') + (flash === String(s.b.id) ? ' flash' : '') + dropClass('course', s.b.id)}
                      style={{
                        left: `calc(${(s.col / 7) * 100}% + 4px)`,
                        width: `calc(${(s.span / 7) * 100}% - 8px)`,
                        top: `calc(var(--numh) + ${s.lane} * var(--barh) + ${s.lane} * 3px)`,
                        '--c': s.b.color || '#5b6b80',
                      }}
                      onPointerDown={(e) => {
                        if (e.target.classList.contains('cx-grab')) barDown(s.b, e, 'move')
                        else if (e.target.classList.contains('cx-resize')) barDown(s.b, e, 'resize')
                      }}
                      onClick={(e) => openAt(s.b, e)}
                      data-tip={barTip(s.b)}>
                      {isAdmin && !s.b.isHoliday && s.head && <span className="cx-grab" aria-hidden="true" />}
                      {/* Two lines, not one. A course is an object with a name
                          and a second fact about it — who is teaching it and how
                          many people are on it. Encoding that in a dot and a
                          count badge made every bar need a legend. The second
                          line is dropped in Compact, where the height is not
                          there to carry it. */}
                      <span className="cx-bar-t">
                        <span className="cx-bar-r1">
                          <span className="cx-bar-n">{s.head ? (s.b.course || s.b.title) : '↳ ' + (s.b.course || '')}</span>
                          {s.head && s.b.delegates?.some(isPart) && <span className="cx-part" title="Somebody is doing only part of this course">◧</span>}
                          {s.head && s.b.delegates?.length > 0 && (
                            <span className="cx-kinds" aria-hidden="true">
                              {kindsOn(s.b.delegates).map((c) => <i key={c} style={{ background: c }} />)}
                            </span>
                          )}
                          {s.head && !s.b.ready && !s.b.isHoliday &&
                            <em className="cx-warnflag" title="Needs a trainer or delegates" />}
                        </span>
                        {s.head && !s.b.isHoliday && (
                          <span className="cx-bar-sub">
                            {s.b.trainer || 'no trainer'} · {s.b.delegates?.length || 0} booked
                          </span>
                        )}
                      </span>
                      {isAdmin && !s.b.isHoliday && s.tail && <span className="cx-resize" aria-hidden="true" />}
                      {hint && preview?.id === s.b.id && s.head && <span className="cx-chip-len">{hint}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Agenda rail ─────────────────────────────────────────────── */}
        <aside className="cx-rail" hidden={!rail}>
          {needsWork.length > 0 && (
            <RailCard id="needs" title="Needs attention" count={needsWork.length}
              shut={shut} onToggle={toggleCard} className="cx-warn">
              {cap('needs', needsWork, 4).map((b) => (
                <button key={b.id} className="cx-row" data-bid={b.id} style={{ '--c': b.color || '#5b6b80' }}
                  data-tip={barTip(b)} onClick={(e) => openAt(b, e)}>
                  <i />
                  <span><b>{b.course}</b><small>{!b.trainerId ? 'no trainer' : b.trainerGone ? `${b.trainer} has left` : 'no delegates'} · {shortDate(b.start)}</small></span>
                  <em className="cx-flag" aria-hidden="true" />
                </button>
              ))}
              <More id="needs" list={needsWork} n={4} />
            </RailCard>
          )}

          <RailCard id="month" title={`In ${monthLabel}`} count={thisMonth.length}
            shut={shut} onToggle={toggleCard}>
            {thisMonth.length === 0 && <p className="cx-empty">No courses {view === 'Year' ? 'this year' : 'this month'}.</p>}
            {cap('month', thisMonth, 7).map((b) => (
              <button key={b.id} className="cx-row" data-bid={b.id} style={{ '--c': b.color || '#5b6b80' }}
                data-tip={barTip(b)} onClick={(e) => openAt(b, e)}>
                <i />
                <span>
                  <b>{b.course}</b>
                  <small>{span(b.start, b.end)} · {b.trainer || 'no trainer'} · {b.delegates.length} booked</small>
                </span>
              </button>
            ))}
            <More id="month" list={thisMonth} n={7} />
          </RailCard>

          <RailCard id="pool" title="Waiting to be placed" count={pool.length}
            shut={shut} onToggle={toggleCard}
            className={'cx-droppool' + (drag?.kind === 'delegate' || placing?.kind === 'delegate' ? ' armed' : '')
              + (drag?.over?.type === 'pool' ? ' on' : '')}>
            {isAdmin && <p className="cx-hintline">Drag or tap, then drop on a course.</p>}
            {pool.length === 0 && <p className="cx-empty">Nobody waiting.</p>}
            {cap('pool', pool, 6).map((p) => (
              <div key={p.id} className={'cx-row' + (isAdmin ? ' grabby' : ' static')}
                style={{ '--c': schemeColour(p.scheme) }}
                data-tip={`${p.name}\n${p.scheme || 'No scheme'} \u00b7 ${p.count} qualification${p.count === 1 ? '' : 's'} waiting${isAdmin ? '\nDrag or tap to put them on a course' : ''}`}
                onPointerDown={(e) => dragStart('pool', p, p.name, schemeColour(p.scheme), e)}>
                <i />
                <span><b>{p.name}</b><small>{p.scheme || '—'} · {p.count} qual{p.count === 1 ? '' : 's'}</small></span>
              </div>
            ))}
            <More id="pool" list={pool} n={6} />
            {(drag?.kind === 'delegate' || placing?.kind === 'delegate') &&
              <p className="cx-dropnote">{drag ? 'Drop here' : 'Tap here'} to take them off the course</p>}
          </RailCard>

          {isAdmin && staff.length > 0 && (
            <RailCard id="trainers" title="Trainers" count={staff.length} shut={shut} onToggle={toggleCard}>
              <p className="cx-hintline">Drag or tap one onto a course.</p>
              {cap('trainers', staff, 8).map((t) => (
                <div key={t.staff_id} className="cx-row grabby" style={{ '--c': '#334155' }}
                  data-tip={`${t.name}\n${teaching(t.staff_id)}\nDrag or tap to put them on a course`}
                  onPointerDown={(e) => dragStart('staff', t, t.name, '#334155', e)}>
                  <i />
                  <span><b>{t.name}</b><small>{teaching(t.staff_id)}</small></span>
                </div>
              ))}
              <More id="trainers" list={staff} n={8} />
            </RailCard>
          )}
        </aside>
      </div>



      {creating && (
        <Popover at={at} onClose={() => setCreating(null)} label="New course"
          className="cx-course-pop" dirty={!!creating.courseId}>
          <header className="cx-pop-head"
            style={{ '--c': courses.find((c) => String(c.course_id) === String(creating.courseId))?.color || '#5b6b80' }}>
            <span className="cx-pop-dot" />
            <h3 className="cx-pop-title">{creating.forPool ? `Book for ${creating.forPool.name}` : 'New course'}</h3>
            <button className="cx-icon" onClick={() => setCreating(null)} aria-label="Close">✕</button>
          </header>

          <div className="cx-when">
            <label className="cx-when-b">
              <small>Starts</small>
              <input type="date" value={creating.from}
                onChange={(e) => setCreating((c) => ({ ...c, from: e.target.value, to: c.to < e.target.value ? e.target.value : c.to }))} />
              <b>{fmt(creating.from)}</b>
            </label>
            <span className="cx-when-arrow" aria-hidden="true">›</span>
            <label className="cx-when-b">
              <small>Ends</small>
              <input type="date" value={creating.to} min={creating.from}
                onChange={(e) => setCreating((c) => ({ ...c, to: e.target.value }))} />
              <b>{fmt(creating.to)}</b>
            </label>
            <span className="cx-when-len">{between(creating.from, creating.to) + 1} days</span>
          </div>

          <div className="cx-rows">
            <div className={'cx-row2' + (creating.courseId ? '' : ' empty')}>
              <span className="cx-ricon" aria-hidden="true">📚</span>
              <span className="cx-rwrap">
                <span className="cx-rlabel">Which course</span>
                <select autoFocus value={creating.courseId || ''} aria-label="Which course"
                  onChange={(e) => setCreating({ ...creating, courseId: e.target.value })}>
                  <option value="">Pick a course</option>
                  {/* Dropped somebody here? Then what they are waiting for goes
                      at the top — that is the whole reason you dragged them. */}
                  {creating.forPool?.scheme && courses.some((c) => c.scheme === creating.forPool.scheme) && (
                    <optgroup label={`${creating.forPool.scheme} — what they are waiting for`}>
                      {courses.filter((c) => c.scheme === creating.forPool.scheme)
                        .map((c) => <option key={c.course_id} value={c.course_id}>{c.name}</option>)}
                    </optgroup>
                  )}
                  {creating.forPool?.scheme
                    ? <optgroup label="Everything else">
                        {courses.filter((c) => c.scheme !== creating.forPool.scheme)
                          .map((c) => <option key={c.course_id} value={c.course_id}>{c.name}</option>)}
                      </optgroup>
                    : courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.name}</option>)}
                </select>
              </span>
            </div>
          </div>

          <footer className="cx-pop-foot actions">
            <button className="cx-ghost" onClick={() => { setCreating(null); go?.('setup') }}>
              Full set-up instead
            </button>
            <button className="cx-primary" disabled={!creating.courseId || busy} onClick={async () => {
              setBusy(true)
              try {
                const id = await createBlock({ courseId: Number(creating.courseId), from: creating.from, to: creating.to })
                // Dragged somebody onto the calendar? They go on it, or the
                // drag did nothing and you would have to add them by hand.
                if (creating.forPool) { try { await addDelegatesToBlock(id, [creating.forPool.id]) } catch { /* the course is booked either way */ } }
                const who = creating.forPool?.name
                setCreating(null)
                const f = await load()
                const made = f.find((x) => String(x.id) === String(id))
                setFlash(String(id)); setTimeout(() => setFlash(null), 900)
                if (made) setOpen(made)
                toast(who ? `Course booked with ${who} on it — it needs a trainer` : 'Course booked — add a trainer and delegates')
              } catch (err) { toast(err.message) } finally { setBusy(false) }
            }}>{busy ? 'Booking…' : 'Book it'}</button>
          </footer>
        </Popover>
      )}

      {open && (
        <Popover at={at} onClose={() => setOpen(null)} label={open.course} className="cx-course-pop">
          {/* No edit mode. You type into it and it saves — the way Calendars
              does it — instead of asking you to unlock the thing first. */}
          <header className="cx-pop-head" style={{ '--c': open.color || '#5b6b80' }}>
            <span className="cx-pop-dot" />
            {isAdmin ? (
              <select className="cx-pop-title" value={open.courseId || ''} disabled={busy}
                onChange={async (e) => {
                  setBusy(true)
                  try {
                    await updateBlock(open.id, { courseId: Number(e.target.value) })
                    const f = await load(); setOpen(f.find((x) => x.id === open.id) || null); toast('Course changed')
                  } catch (err) { toast(err.message) } finally { setBusy(false) }
                }}>
                {!courses.some((c) => String(c.course_id) === String(open.courseId)) &&
                  <option value={open.courseId || ''}>{open.course}</option>}
                {courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.name}</option>)}
              </select>
            ) : <h3 className="cx-pop-title">{open.course}</h3>}
            <button className="cx-icon" onClick={() => setOpen(null)} aria-label="Close">✕</button>
          </header>

          {/* The dates as two blocks you can read across, not two small inputs. */}
          {/* One object, read across — two separate boxes and a floating pill
              made three things out of one fact. */}
          <div className="cx-when">
            <label className="cx-when-b">
              <small>Starts</small>
              <input type="date" value={open.start} disabled={!isAdmin || busy}
                onChange={(e) => saveDates(e.target.value, null)} />
              <b>{fmt(open.start)}</b>
            </label>
            <span className="cx-when-arrow" aria-hidden="true">›</span>
            <label className="cx-when-b">
              <small>Ends</small>
              <input type="date" value={open.end} min={open.start} disabled={!isAdmin || busy}
                onChange={(e) => saveDates(null, e.target.value)} />
              <b>{fmt(open.end)}</b>
            </label>
            <span className="cx-when-len">{between(open.start, open.end) + 1} days</span>
          </div>

          <div className="cx-rows">
            {/* Quiet rows you fill in as you need them, rather than a form
                showing every field at once. */}
            <div className={'cx-row2' + (open.trainerId ? '' : ' empty')}>
              <span className="cx-ricon" aria-hidden="true">👤</span>
              <span className="cx-rwrap">
              <span className="cx-rlabel">Trainer</span>
              {isAdmin ? (
                <select value={open.trainerId || ''} disabled={busy} aria-label="Trainer" onChange={async (e) => {
                  setBusy(true)
                  try {
                    await assignBlockRole(open.id, 'trainer', Number(e.target.value))
                    const f = await load(); setOpen(f.find((x) => x.id === open.id) || null); toast('Trainer set')
                  } catch (err) { toast(err.message) } finally { setBusy(false) }
                }}>
                  <option value="">Add a trainer</option>
                  {staff.map((s) => <option key={s.staff_id} value={s.staff_id}>
                    {s.name}{staffOnHoliday(holidays, s.staff_id, open.start, open.end) ? ' (on holiday)' : ''}
                  </option>)}
                </select>
              ) : <span className="cx-rtext">{open.trainer || 'No trainer'}</span>}
              </span>
            </div>

            <div className={'cx-row2 top' + (open.delegates.length ? '' : ' empty')}>
              <span className="cx-ricon" aria-hidden="true">👥</span>
              <div className="cx-rfill">
                <span className="cx-rlabel">On this course{open.delegates.length ? ` · ${open.delegates.length}` : ''}</span>
                {open.delegates.length === 0
                  ? <span className="cx-rtext">Nobody booked on yet</span>
                  : <ul className="cx-delg">{open.delegates.map((d) => (
                      <Delegate key={d.bookingId} d={d} block={open} isAdmin={isAdmin} busy={busy}
                        onDragStart={(e) => dragStart('delegate', { ...d, blockId: open.id }, d.name, schemeColour(open.scheme), e)}
                        onSplit={async (f, t) => {
                          setBusy(true)
                          try { await setBookingAttendance(d.bookingId, f, t); const x = await load(); setOpen(x.find((y) => y.id === open.id) || null); toast(f || t ? 'Part attendance set' : 'Back to the full course') }
                          catch (err) { toast(err.message) } finally { setBusy(false) }
                        }}
                        onRemove={async () => {
                          setBusy(true)
                          try { await returnToPool(d.bookingId); const x = await load(); setOpen(x.find((y) => y.id === open.id) || null) }
                          catch (err) { toast(err.message) } finally { setBusy(false) }
                        }} />))}
                    </ul>}
                {/* Quiet until you want it — eight name chips permanently on
                    show made the popover twice as tall as it needed to be. */}
                {isAdmin && pool.length > 0 && (() => {
                  // Whoever is waiting for THIS scheme belongs at the top, and
                  // everyone carries the colour of what they are waiting for —
                  // you can see who fits without reading a single line.
                  const fits = (x) => !!open.scheme && x.scheme === open.scheme
                  // Somebody can hold a second booking, so this is a warning
                  // rather than a filter — but adding the same person twice by
                  // accident is easy and nothing here undoes it.
                  const onIt = new Set(open.delegates.map((d) => d.name))
                  const sorted = [...pool].sort((a, z) => (fits(z) ? 1 : 0) - (fits(a) ? 1 : 0)
                    || (a.scheme || '').localeCompare(z.scheme || '') || a.name.localeCompare(z.name))
                  const n = sorted.filter(fits).length
                  return (
                    <details className="cx-add">
                      <summary>Add someone from the waiting list<span>{pool.length}</span></summary>
                      <div className="cx-chips">
                        {sorted.slice(0, 12).map((x) => (
                          <button key={x.id} className={'cx-chip cx-pchip' + (fits(x) ? ' fits' : '') + (onIt.has(x.name) ? ' already' : '')}
                            disabled={busy} style={{ '--s': schemeColour(x.scheme) }}
                            title={onIt.has(x.name)
                              ? `${x.name} is already on this course — this is a second booking`
                              : `${x.name} — waiting for ${x.scheme || 'no scheme'}, ${x.count} qualification${x.count === 1 ? '' : 's'}`}
                            onClick={async () => {
                              setBusy(true)
                              try { await addDelegatesToBlock(open.id, [x.id]); const f = await load(); setOpen(f.find((y) => y.id === open.id) || null); toast(`${x.name} added`) }
                              catch (err) { toast(err.message) } finally { setBusy(false) }
                            }}>
                            <b>{x.name}</b>
                            <small>{onIt.has(x.name) ? 'already on this course' : `${x.scheme || 'no scheme'} · ${x.count}`}</small>
                          </button>
                        ))}
                      </div>
                      <p className="cx-addnote">
                        {n > 0
                          ? <><b>{n} of these {n === 1 ? 'is' : 'are'} waiting for {open.scheme}</b> — shown first. </>
                          : <>Nobody here is waiting for {open.scheme || 'this scheme'}. </>}
                        The line down the side is what each person is waiting for.
                      </p>
                    </details>
                  )
                })()}
              </div>
            </div>

            <div className="cx-row2 empty">
              <span className="cx-ricon" aria-hidden="true">🏷</span>
              <span className="cx-rwrap">
                <span className="cx-rlabel">Scheme</span>
                <span className="cx-rtext">{open.scheme || 'No scheme'}</span>
              </span>
            </div>
          </div>
          {/* There is no Save button, so the popover has to say so. */}
          <footer className="cx-pop-foot">
            {busy ? <><span className="cx-spin" />Saving…</> : <>✓ Changes save as you make them</>}
          </footer>
        </Popover>
      )}
    </div>
  )
}

/* ── A rail card ───────────────────────────────────────────────────────────
   Four of these ran off the bottom of the screen, so each one folds. The count
   stays on the header when it is folded — folding "Needs attention" away must
   never hide that there are twelve courses without a trainer. */
function RailCard({ id, title, count, shut, onToggle, className = '', children }) {
  const open = !shut[id]
  return (
    <section className={'cx-card' + (open ? '' : ' shut') + (className ? ' ' + className : '')}>
      <h3>
        <button type="button" className="cx-cardtoggle" aria-expanded={open}
          onClick={() => onToggle(id)}>
          <i className="cx-chev" aria-hidden="true" />
          {title}
        </button>
        <span>{count}</span>
      </h3>
      {open && <div className="cx-cardbody">{children}</div>}
    </section>
  )
}

/* One person on a course: what they are here for, and whether they are only
   doing part of it — the "split" case. */
function Delegate({ d, block, isAdmin, busy, onSplit, onRemove, onDragStart }) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState(d.attendFrom || block.start)
  const [t, setT] = useState(d.attendTo || block.end)
  const part = isPart(d)
  const k = kindOf(d.kind)
  return (
    <li className={(part ? 'part' : '') + (isAdmin ? ' grabby' : '')} style={{ '--s': schemeColour(block.scheme) }}
      onPointerDown={(e) => { if (!e.target.closest('button, input')) onDragStart?.(e) }}>
      <span className="cx-kind" style={{ background: k.c }} title={k.label} />
      <span className="cx-dinfo">
        <b>{d.name}</b>
        <small>
          {k.label}
          {d.codes?.length ? ' · ' + d.codes.join(', ') : ''}
          {part ? ` · ${fmt(d.attendFrom || block.start)}–${fmt(d.attendTo || block.end)} only` : ' · full course'}
        </small>
      </span>
      {isAdmin && !edit && <button className="cx-x" onClick={() => setEdit(true)}>{part ? 'change days' : 'only some days'}</button>}
      {isAdmin && !edit && (
        <button className="cx-x danger" disabled={busy}
          onClick={() => { if (window.confirm(`Take ${d.name} off this course? They go back on the waiting list.`)) onRemove() }}>
          take off
        </button>
      )}
      {edit && (
        <span className="cx-split">
          <input type="date" value={f} min={block.start} max={block.end} onChange={(e) => setF(e.target.value)} />
          <input type="date" value={t} min={block.start} max={block.end} onChange={(e) => setT(e.target.value)} />
          <button className="cx-x" disabled={busy} onClick={() => { onSplit(f, t); setEdit(false) }}>save</button>
          <button className="cx-x" disabled={busy} onClick={() => { onSplit(null, null); setEdit(false) }}>all of it</button>
          <button className="cx-x" onClick={() => setEdit(false)}>cancel</button>
        </span>
      )}
    </li>
  )
}

/* ── Week and Day ──────────────────────────────────────────────────────────
   Courses run all day and for several days, so the band across the top is the
   main event, not an afterthought above a time grid. Below it sits the hour
   grid for timed entries, with a line showing where we are now. */
const H0 = 7, H1 = 20, HPX = 46
function DaysGrid({ days, blocks, onOpen, isAdmin, onBarDown, flash, single, chip, onCellDown, inSel, dropClass }) {
  const [hours, setHours] = useState(false)
  const first = days[0], last = days[days.length - 1]
  const allDay = useMemo(() => {
    const list = (blocks || []).filter((b) => b.start && b.end && b.end >= first && b.start <= last
      && !(b.isEngagement && b.startTime))
    const lanes = []
    return list.sort((a, z) => a.start.localeCompare(z.start) || between(z.start, z.end) - between(a.start, a.end))
      .map((b) => {
        const col = Math.max(0, between(first, b.start))
        const span = Math.min(days.length - col, between(b.start < first ? first : b.start, b.end > last ? last : b.end) + 1)
        let i = 0
        while (i < lanes.length && lanes[i] > col) i++
        if (i === lanes.length) lanes.push(0)
        lanes[i] = col + span
        return { b, col, span, lane: i }
      })
  }, [blocks, first, last, days.length])
  const laneCount = Math.max(1, ...allDay.map((x) => x.lane + 1))

  const timed = (blocks || []).filter((b) => b.isEngagement && b.startTime && b.start >= first && b.start <= last)
  const mins = (t) => Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5))
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const showNow = days.includes(todayISO()) && nowMin >= H0 * 60 && nowMin <= H1 * 60

  return (
    <div className={'cx-days' + (single ? ' one' : '')}>
      <div className="cx-days-head">
        <div className="cx-gutter" />
        {days.map((d) => (
          <div key={d} className={'cx-dhead' + (d === todayISO() ? ' today' : '') + (isWknd(d) ? ' wknd' : '')}>
            <span>{DOW[(dow(d) + 6) % 7]}</span>
            <b>{Number(d.slice(8))}</b>
          </div>
        ))}
      </div>

      {/* All-day band — where courses live. In Day view it just repeated the
          name of the course sitting in the card below it, so it is dropped. */}
      {!single && (
      <div className="cx-band-wrap">
        <div className="cx-gutter"><span>All day</span></div>
        <div className="cx-band" data-cols={days.length} style={{ height: laneCount * 28 + 10 }}>
          {days.map((d) => (
            <div key={d} data-d={d}
              className={'cx-band-cell' + (isWknd(d) ? ' wknd' : '') + (inSel?.(d) ? ' sel' : '') + (dropClass?.('day', d) || '')}
              onPointerDown={(e) => onCellDown?.(d, e)} />
          ))}
          {allDay.map(({ b, col, span, lane }) => (
            <button key={b.id} type="button" data-bid={b.id}
              className={'cx-bar' + (b.isHoliday ? ' hol' : '') + (!b.ready && !b.isHoliday && !b.isEngagement ? ' warn' : '') + (flash === String(b.id) ? ' flash' : '') + (dropClass?.('course', b.id) || '')}
              style={{ left: `calc(${(col / days.length) * 100}% + 4px)`, width: `calc(${(span / days.length) * 100}% - 8px)`,
                top: lane * 28 + 5, height: 24, '--c': b.color || '#5b6b80' }}
              onPointerDown={(e) => {
                if (!isAdmin || b.isHoliday) return
                if (e.target.classList.contains('cx-grab')) onBarDown(b, e, 'move')
                else if (e.target.classList.contains('cx-resize')) onBarDown(b, e, 'resize')
              }}
              onClick={(e) => onOpen(b, e)}>
              {isAdmin && !b.isHoliday && b.start >= first && <span className="cx-grab" title="Drag to move" />}
              <span className="cx-bar-t">
                <span className="cx-bar-n">{b.course || b.title}</span>
                {b.delegates?.some(isPart) && <span className="cx-part">◧</span>}
                {b.delegates?.length > 0 && (
                  <span className="cx-kinds" aria-hidden="true">
                    {kindsOn(b.delegates).map((c) => <i key={c} style={{ background: c }} />)}
                  </span>
                )}
                {b.delegates?.length > 0 && <em>{b.delegates.length}</em>}
              </span>
              {isAdmin && !b.isHoliday && b.end <= last && <span className="cx-resize" title="Drag to change the length" />}
              {chip && String(chip.id) === String(b.id) && <span className="cx-chip-len">{chip.text}</span>}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* A roster, not a second copy of the bar. In Day view the question is
          never "what time" — courses run all day — it is "who is on it and
          who is teaching it". */}
      {single && (
        <div className="cx-roster">
          {allDay.length === 0 && <p className="cx-empty">Nothing booked on this day.</p>}
          {allDay.map(({ b }) => (
            <article key={b.id} className="cx-rcard" style={{ '--c': b.color || '#5b6b80' }}>
              <header>
                <button type="button" className="cx-rname" onClick={(e) => onOpen(b, e)}>{b.course || b.title}</button>
                <span className="cx-rdate">{fmt(b.start)} – {fmt(b.end)}</span>
              </header>
              <p className={'cx-rtrainer' + (b.trainerId ? '' : ' none')}>
                {b.trainerId ? (b.trainer || 'Trainer booked') : 'No trainer yet'}
              </p>
              {b.delegates?.length ? (
                <ul className="cx-rlist">
                  {b.delegates.map((d) => (
                    <li key={d.bookingId}>
                      <i style={{ background: kindOf(d.kind).c, opacity: isPart(d) ? 0.5 : 1 }} />
                      <b>{d.name}</b>
                      <span>{kindOf(d.kind).label}{isPart(d) ? ' · part of it' : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="cx-rnone">Nobody booked on yet.</p>}
            </article>
          ))}
        </div>
      )}

      {/* Hour grid — only worth its space when something actually has a time
          on it. Almost every course here is an all-day, multi-day thing, so an
          empty 07:00–20:00 ruler was most of the screen saying nothing. */}
      {timed.length === 0 && !hours ? (
        <button type="button" className="cx-hours-toggle" onClick={() => setHours(true)}>
          Courses run all day · show the hour grid
        </button>
      ) : (<>
      {timed.length === 0 && (
        <button type="button" className="cx-hours-toggle" onClick={() => setHours(false)}>
          Nothing has a time on it {single ? 'today' : 'this week'} · hide the hour grid
        </button>
      )}
      <div className="cx-time">
        <div className="cx-gutter">
          {Array.from({ length: H1 - H0 }, (_, i) => (
            <div key={i} className="cx-hour" style={{ height: HPX }}><span>{String(H0 + i).padStart(2, '0')}:00</span></div>
          ))}
        </div>
        <div className="cx-cols">
          {days.map((d) => (
            <div key={d} className={'cx-col' + (isWknd(d) ? ' wknd' : '')} style={{ height: (H1 - H0) * HPX }}>
              {Array.from({ length: H1 - H0 }, (_, i) => <div key={i} className="cx-hline" style={{ top: i * HPX }} />)}
              {timed.filter((t) => t.start === d).map((t) => (
                <button key={t.id} className="cx-ev" onClick={(e) => onOpen(t, e)}
                  style={{ top: ((mins(t.startTime) - H0 * 60) / 60) * HPX,
                    height: Math.max(22, ((mins(t.endTime) - mins(t.startTime)) / 60) * HPX - 2) }}>
                  <b>{t.title || t.course}</b><span>{String(t.startTime).slice(0, 5)}</span>
                </button>
              ))}
              {showNow && d === todayISO() && (
                <div className="cx-now" style={{ top: ((nowMin - H0 * 60) / 60) * HPX }}>
                  <i /><b>{String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}</b>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      </>)}
    </div>
  )
}

/* ── Year ──────────────────────────────────────────────────────────────────
   Months as rows, the whole year in one screen. This is the view Teamup did
   well and the one Simon reads the shape of the business from. */
function YearGrid({ year, blocks, onOpen, isAdmin, onBarDown, flash, chip, onCellDown, inSel, dropClass }) {
  const y = Number(year)
  const TICKS = [1, 5, 10, 15, 20, 25, 31]
  return (
    <div className="cx-year">
      {/* Without a date scale you could see the shape of the year but not read
          a single date off it. */}
      <div className="cx-yhead" aria-hidden="true">
        <div className="cx-ylabel" />
        <div className="cx-ytrack">
          {Array.from({ length: 31 }, (_, i) => (
            <span key={i} className={'cx-ytick' + (TICKS.includes(i + 1) ? ' on' : '')}
              style={{ left: `${(i / 31) * 100}%`, width: `${(1 / 31) * 100}%` }}>
              {TICKS.includes(i + 1) ? i + 1 : ''}
            </span>
          ))}
        </div>
      </div>
      {MONTHS.map((name, m) => {
        const first = `${y}-${String(m + 1).padStart(2, '0')}-01`
        const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
        const last = `${y}-${String(m + 1).padStart(2, '0')}-${String(dim).padStart(2, '0')}`
        const rows = (blocks || []).filter((b) => b.start && b.end && b.end >= first && b.start <= last)
        const lanes = []
        const laid = rows.sort((a, z) => a.start.localeCompare(z.start)).map((b) => {
          const col = Math.max(0, between(first, b.start))
          const span = Math.min(dim - col, between(b.start < first ? first : b.start, b.end > last ? last : b.end) + 1)
          let i = 0
          while (i < lanes.length && lanes[i] > col) i++
          if (i === lanes.length) lanes.push(0)
          lanes[i] = col + span
          return { b, col, span, lane: i }
        })
        // How much clear room each bar has before the next one in its lane —
        // a name spilling over the following course is worse than no name.
        for (const x of laid) {
          const next = laid.filter((z) => z.lane === x.lane && z.col > x.col).sort((a, z) => a.col - z.col)[0]
          x.gap = (next ? next.col : 31) - (x.col + x.span)
        }
        const laneN = Math.max(1, ...laid.map((x) => x.lane + 1))
        return (
          <div className="cx-yrow" key={m}>
            <div className="cx-ylabel">{name.slice(0, 3)}</div>
            {/* Every row is drawn on the same 31-day scale — otherwise 1 Feb
                sat under 3 Jan and you could not read a date down a column. */}
            <div className="cx-ytrack" data-cols={31} style={{ height: Math.max(40, laneN * 22 + 12) }}>
              {Array.from({ length: dim }, (_, i) => {
                const d = `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
                return <div key={d} data-d={d}
                  className={'cx-ycell' + (isWknd(d) ? ' wknd' : '') + (d === todayISO() ? ' today' : '') + (inSel?.(d) ? ' sel' : '') + (dropClass?.('day', d) || '')}
                  onPointerDown={(e) => onCellDown?.(d, e)}
                  style={{ left: `${(i / 31) * 100}%`, width: `${(1 / 31) * 100}%` }} />
              })}
              {dim < 31 && <div className="cx-ydead" style={{ left: `${(dim / 31) * 100}%`, width: `${((31 - dim) / 31) * 100}%` }} />}
              {laid.map(({ b, col, span, lane, gap }) => (
                <button key={b.id} type="button" data-bid={b.id} title={`${b.course || b.title} · ${fmt(b.start)} – ${fmt(b.end)}`}
                  className={'cx-bar cx-ybar' + (b.isHoliday ? ' hol' : '') + (flash === String(b.id) ? ' flash' : '') + (dropClass?.('course', b.id) || '')}
                  style={{ left: `calc(${(col / 31) * 100}% + 2px)`, width: `calc(${(span / 31) * 100}% - 4px)`,
                    top: lane * 22 + 6, height: 18, '--c': b.color || '#5b6b80' }}
                  onPointerDown={(e) => {
                    if (!isAdmin || b.isHoliday) return
                    if (e.target.classList.contains('cx-grab')) onBarDown(b, e, 'move')
                    else if (e.target.classList.contains('cx-resize')) onBarDown(b, e, 'resize')
                  }}
                  onClick={(e) => onOpen(b, e)}>
                  {isAdmin && !b.isHoliday && <span className="cx-grab" />}
                  {/* The name lives INSIDE the bar, always, clipped to it. It
                      used to spill out to the right when the bar was too narrow
                      to hold it, which on a date-scaled row reads as the course
                      running on days it does not. A bar too small for any of
                      its name shows none: the colour, the tooltip and the rail
                      carry it, and the bar's length stays honest either way. */}
                  {span >= 3 && <span className="cx-bar-t"><span className="cx-bar-n">{b.course || b.title}</span></span>}
                  {isAdmin && !b.isHoliday && <span className="cx-resize" />}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
