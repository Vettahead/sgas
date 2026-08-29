// ─────────────────────────────────────────────────────────────────────────────
// Turning a notification into words.
//
// Split out of index.ts so it can be unit-tested with plain node
// (`node --experimental-strip-types`) — index.ts calls Deno.serve at import and
// cannot be loaded outside Deno. See tests/wording.mjs.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Dates arrive as plain YYYY-MM-DD. Parsed as UTC on purpose: new Date('2026-09-14')
// is midnight UTC, and reading it back with getDate() in a behind-UTC zone gives
// the 13th. Every date in this system is a calendar date, not an instant — which
// is the same trap todayISO() falls into elsewhere in the app.
export function parseDay(v: unknown): Date | null {
  const s = String(v ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00Z')
  return isNaN(d.getTime()) ? null : d
}

export const fmtDay = (d: Date) =>
  `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`

// "Mon 14 Sep 2026" / "Mon 14 – Wed 16 Sep 2026" / across a month or a year,
// both ends in full.
export function fmtRange(a: Date | null, b: Date | null): string {
  if (!a && !b) return 'dates to be confirmed'
  if (!a) return fmtDay(b as Date)
  if (!b || a.getTime() === b.getTime()) return fmtDay(a)
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()
  if (sameMonth) return `${DAY[a.getUTCDay()]} ${a.getUTCDate()} – ${fmtDay(b)}`
  return `${fmtDay(a)} – ${fmtDay(b)}`
}

export function fmtDays(a: Date | null, b: Date | null): string {
  if (!a) return ''
  const end = b ?? a
  const n = Math.round((end.getTime() - a.getTime()) / 86400000) + 1
  return n === 1 ? '1 day' : `${n} days`
}

export const fmtDelegates = (n: number) =>
  n === 0 ? 'nobody booked on yet' : n === 1 ? '1 delegate' : `${n} delegates`

// Unknown placeholders are left standing rather than blanked, so a typo in the
// Admin editor shows up in the preview instead of silently emptying a line.
export function render(template: string, tokens: Record<string, string>): string {
  return String(template ?? '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, name) => {
    const key = String(name).toLowerCase()
    return Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : whole
  })
}

// Holiday is counted in working days everywhere else in the app, so it is
// counted in working days here too. The context supplies the number; this only
// words it.
export const fmtWorkingDays = (n: number) =>
  n === 1 ? '1 working day' : `${n} working days`

// Everything a template can refer to. Anything not in here is a typo, and a
// typo is left standing in the rendered text rather than blanked.
//
// One map covers every kind of email. A holiday template referring to
// {{course}} gets an empty string rather than a crash — the per-template token
// list in Admin is what stops anyone writing that in the first place.
export function tokensFor(
  ctx: Record<string, unknown>, prevStart?: unknown, prevEnd?: unknown,
): Record<string, string> {
  const start = parseDay(ctx.start)
  const end = parseDay(ctx.end)
  const pStart = parseDay(prevStart)
  const pEnd = parseDay(prevEnd)
  const working = ctx.working_days == null ? null : Number(ctx.working_days)
  return {
    // course
    trainer: String(ctx.trainer ?? ''),
    course: String(ctx.course ?? ''),
    room: ctx.room ? String(ctx.room) : 'to be confirmed',
    delegates: fmtDelegates(Number(ctx.delegates ?? 0)),
    old_dates: pStart ? fmtRange(pStart, pEnd) : 'not recorded',
    // holiday
    staff: String(ctx.staff ?? ''),
    approver: String(ctx.approver ?? 'the office'),
    note: ctx.note ? String(ctx.note) : 'none given',
    reason: ctx.reason ? String(ctx.reason) : 'not given',
    // shared
    dates: fmtRange(start, end),
    start: start ? fmtDay(start) : '',
    end: end ? fmtDay(end) : '',
    days: working != null ? fmtWorkingDays(working) : fmtDays(start, end),
  }
}

// What each placeholder turns into. Which ones a given template may use is
// held per template in email_template.tokens, because {{course}} means nothing
// in a holiday email.
export const PLACEHOLDER_HELP: Record<string, string> = {
  trainer: 'the trainer’s name',
  course: 'the course name',
  dates: 'the dates, e.g. Mon 14 – Wed 16 Sep 2026',
  start: 'the first day only',
  end: 'the last day only',
  days: 'how long — working days for holiday, calendar days for a course',
  room: 'their assigned room, or “to be confirmed”',
  delegates: 'how many are booked on',
  old_dates: 'the dates before the change (course moved only)',
  staff: 'the name of the person the holiday is for',
  approver: 'whoever approves holidays',
  note: 'the note they put on the request, or “none given”',
  reason: 'the reason given for the decision, or “not given”',
}
