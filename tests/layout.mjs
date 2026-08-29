// What the plain text somebody typed turns into.
//   node --experimental-strip-types tests/layout.mjs
import assert from 'node:assert/strict'
import { parseBlocks, preheader, toHtml, esc } from '../supabase/functions/send-email/layout.ts'

let n = 0
const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name) }
console.log('email layout')

const SAMPLE = [
  'Hello Denis Brown,', '',
  'You are booked on to ACS Domestic.', '',
  '  When:  Mon 14 – Wed 16 Sep 2026 (3 days)',
  '  Where: Specialist Gas Assessment Services', '',
  '  What you are taking: CCN1, CENWAT', '',
  'PLEASE BRING PHOTOGRAPHIC ID. Without it we cannot assess you and the day is',
  'wasted.', '',
  'SGAS Training Management',
].join('\n')

ok('the shape of the text becomes the shape of the email', () => {
  const b = parseBlocks(SAMPLE)
  const kinds = b.map((x) => x.t)
  // One details table, not two: a blank line between detail lines is how a
  // person breathes, not a new table. Two tables means two label columns of
  // different widths sitting on top of each other, and nothing lines up.
  assert.deepEqual(kinds, ['p', 'p', 'rows', 'callout'])
  assert.equal(b[2].rows.length, 3)
  assert.deepEqual(b[2].rows[0], ['When', 'Mon 14 – Wed 16 Sep 2026 (3 days)'])
  assert.deepEqual(b[2].rows[2], ['What you are taking', 'CCN1, CENWAT'])
})

ok('a paragraph between two detail blocks does keep them apart', () => {
  const b = parseBlocks([
    '  When: Monday', '',
    'Something in between.', '',
    '  Where: Bay Block A',
  ].join('\n'))
  assert.deepEqual(b.map((x) => x.t), ['rows', 'p', 'rows'])
})

ok('the sign-off is dropped — the footer says it', () => {
  const b = parseBlocks(SAMPLE)
  assert.ok(!JSON.stringify(b).includes('SGAS Training Management'))
})

ok('a line that is only a link becomes a button', () => {
  const b = parseBlocks('Open this:\n\nhttps://sgas-opal.vercel.app/?reset=abc123\n\nIt lasts an hour.')
  assert.deepEqual(b.map((x) => x.t), ['p', 'button', 'p'])
  assert.equal(b[1].href, 'https://sgas-opal.vercel.app/?reset=abc123')
})

ok('a link inside a sentence stays inside the sentence', () => {
  const html = toHtml('Sign in at https://sgas-opal.vercel.app/ when you can.', 'x')
  assert.ok(html.includes('<a href="https://sgas-opal.vercel.app/"'))
  assert.ok(!html.includes('Open the link'))
})

ok('a sentence with a colon is not mistaken for a detail row', () => {
  const b = parseBlocks('One thing: it must not become a table row.')
  assert.deepEqual(b.map((x) => x.t), ['p'])
})

ok('a short shout is not a callout', () => {
  // "ACS" alone is a word, not a warning.
  assert.deepEqual(parseBlocks('ACS').map((x) => x.t), ['p'])
  assert.deepEqual(parseBlocks('BRING PHOTO ID').map((x) => x.t), ['callout'])
})

ok('anything typed is escaped, never rendered', () => {
  const html = toHtml('Hello <script>alert(1)</script> & "friends"', 'x')
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('&amp;'))
  assert.equal(esc('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;')
})

ok('the preview line skips the greeting', () => {
  assert.equal(preheader(SAMPLE), 'You are booked on to ACS Domestic.')
  assert.ok(preheader(SAMPLE).length <= 90)
})

ok('it is a whole document, sized and themed for email', () => {
  const html = toHtml(SAMPLE, 'You are booked on ACS Domestic')
  assert.ok(html.startsWith('<!doctype html>'))
  assert.ok(html.includes('width="600"'))
  assert.ok(html.includes('role="presentation"'))
  assert.ok(html.includes('prefers-color-scheme:dark'))
  assert.ok(html.includes('name="color-scheme"'))
  assert.ok(!/<img/i.test(html), 'no images — a blocked image is a broken email')
  assert.ok(html.length < 102000, 'under the Gmail clipping threshold')
})

console.log(`\n${n} groups passed`)
