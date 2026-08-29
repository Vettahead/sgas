// Unit tests for the notification wording.
//
//   node --experimental-strip-types tests/wording.mjs
//   TZ=America/Los_Angeles node --experimental-strip-types tests/wording.mjs
//
// Run it in a behind-UTC zone too. Every date in SGAS is a calendar date, and
// the usual way to get it wrong is to parse one as an instant and print the day
// before — which is exactly the todayISO() bug already on the board.
import assert from 'node:assert/strict'
import {
  parseDay, fmtDay, fmtRange, fmtDays, fmtDelegates, render, tokensFor,
} from '../supabase/functions/send-email/wording.ts'

let n = 0
const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name) }

console.log(`wording (TZ=${process.env.TZ || 'system'})`)

ok('a plain date parses, anything else does not', () => {
  assert.ok(parseDay('2026-09-14'))
  assert.equal(parseDay('14/09/2026'), null)
  assert.equal(parseDay('2026-09-14T09:00:00Z'), null)   // an instant is not a calendar date
  assert.equal(parseDay(''), null)
  assert.equal(parseDay(null), null)
  assert.equal(parseDay(undefined), null)
  assert.equal(parseDay('not a date'), null)
})

ok('a date prints as itself, not the day before', () => {
  assert.equal(fmtDay(parseDay('2026-09-14')), 'Mon 14 Sep 2026')
  assert.equal(fmtDay(parseDay('2026-01-01')), 'Thu 1 Jan 2026')
  assert.equal(fmtDay(parseDay('2026-12-31')), 'Thu 31 Dec 2026')
})

ok('ranges read the way a person would say them', () => {
  const d = (s) => parseDay(s)
  assert.equal(fmtRange(d('2026-09-14'), d('2026-09-14')), 'Mon 14 Sep 2026')
  assert.equal(fmtRange(d('2026-09-14'), null), 'Mon 14 Sep 2026')
  assert.equal(fmtRange(d('2026-09-14'), d('2026-09-16')), 'Mon 14 – Wed 16 Sep 2026')
  assert.equal(fmtRange(d('2026-09-30'), d('2026-10-02')), 'Wed 30 Sep 2026 – Fri 2 Oct 2026')
  assert.equal(fmtRange(d('2026-12-30'), d('2027-01-05')), 'Wed 30 Dec 2026 – Tue 5 Jan 2027')
  assert.equal(fmtRange(null, null), 'dates to be confirmed')
})

ok('length counts both ends', () => {
  assert.equal(fmtDays(parseDay('2026-09-14'), parseDay('2026-09-14')), '1 day')
  assert.equal(fmtDays(parseDay('2026-09-14'), parseDay('2026-09-16')), '3 days')
  assert.equal(fmtDays(parseDay('2026-09-14'), null), '1 day')
  assert.equal(fmtDays(parseDay('2026-03-28'), parseDay('2026-03-30')), '3 days') // clocks go forward
  assert.equal(fmtDays(null, null), '')
})

ok('head count is a sentence, not a number', () => {
  assert.equal(fmtDelegates(0), 'nobody booked on yet')
  assert.equal(fmtDelegates(1), '1 delegate')
  assert.equal(fmtDelegates(6), '6 delegates')
})

ok('a typo in the editor survives instead of blanking the line', () => {
  assert.equal(render('Hello {{trainer}}', { trainer: 'Denis' }), 'Hello Denis')
  assert.equal(render('Hello {{ trainer }}', { trainer: 'Denis' }), 'Hello Denis')
  assert.equal(render('Hello {{TRAINER}}', { trainer: 'Denis' }), 'Hello Denis')
  assert.equal(render('Hello {{tranier}}', { trainer: 'Denis' }), 'Hello {{tranier}}')
  assert.equal(render('{{a}} {{a}}', { a: 'x' }), 'x x')
  assert.equal(render('', {}), '')
})

ok('the fallbacks are readable English, never blank', () => {
  const t = tokensFor({ trainer: 'Denis Brown', course: 'ACS Domestic', start: '2026-09-14', end: '2026-09-16', room: null, delegates: 0 })
  assert.equal(t.room, 'to be confirmed')
  assert.equal(t.delegates, 'nobody booked on yet')
  assert.equal(t.old_dates, 'not recorded')
  assert.equal(t.dates, 'Mon 14 – Wed 16 Sep 2026')
  assert.equal(t.days, '3 days')
  assert.equal(t.start, 'Mon 14 Sep 2026')
})

ok('a move quotes the dates it moved from', () => {
  const t = tokensFor(
    { trainer: 'Phil', course: 'CCN1', start: '2026-10-05', end: '2026-10-07', room: 'Bay Block A', delegates: 6 },
    '2026-09-14', '2026-09-16',
  )
  assert.equal(t.old_dates, 'Mon 14 – Wed 16 Sep 2026')
  assert.equal(t.dates, 'Mon 5 – Wed 7 Oct 2026')
  assert.equal(t.room, 'Bay Block A')
  assert.equal(t.delegates, '6 delegates')
})

ok('a made-up previous date is dropped, not printed', () => {
  const t = tokensFor({ start: '2026-10-05' }, '<script>alert(1)</script>', 'nonsense')
  assert.equal(t.old_dates, 'not recorded')
})

ok('the shipped templates render with nothing left over', () => {
  const subject = 'You are on {{course}}, {{dates}}'
  const body = [
    'Hello {{trainer}},', '', 'You have been put on {{course}}.', '',
    '  When:   {{dates}} ({{days}})', '  Where:  {{room}}', '  Booked: {{delegates}}',
  ].join('\n')
  const t = tokensFor({ trainer: 'Denis Brown', course: 'ACS Domestic', start: '2026-09-14', end: '2026-09-16', room: 'Bay Block A', delegates: 6 })
  assert.equal(render(subject, t), 'You are on ACS Domestic, Mon 14 – Wed 16 Sep 2026')
  const out = render(body, t)
  assert.ok(!/\{\{/.test(out), 'a placeholder was left unrendered:\n' + out)
  assert.ok(out.includes('When:   Mon 14 – Wed 16 Sep 2026 (3 days)'))
  assert.ok(out.includes('Where:  Bay Block A'))
  assert.ok(out.includes('Booked: 6 delegates'))
})

console.log(`\n${n} groups passed`)
