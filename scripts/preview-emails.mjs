// Look at the emails before anyone else does.
//   node --experimental-strip-types scripts/preview-emails.mjs
// Writes one .html per sample into /tmp/sgas-emails/ so they can be opened in a
// browser (or screenshotted headless) at 600px and at phone width. The samples
// are the wording as it stands with the placeholders already filled in — what
// lands in somebody's inbox, not what Chris sees in the Admin textarea.
import { writeFileSync, mkdirSync } from 'node:fs'
import { toHtml } from '../supabase/functions/send-email/layout.ts'

const SAMPLES = {
  booking: ['You are booked on to ACS Domestic Initial', [
    'Hello Denis Brown,', '',
    'You are booked on to ACS Domestic Initial.', '',
    '  When:  Mon 14 – Wed 16 Sep 2026 (3 days)',
    '  Where: Specialist Gas Assessment Services', '',
    '  What you are taking: CCN1, CENWAT, HTR1', '',
    'PLEASE BRING PHOTOGRAPHIC ID. Without it we cannot assess you and the day is wasted.', '',
    'Please arrive in good time so we can start promptly.', '',
    'If anything here is wrong, or you cannot make these dates, reply to this email or ring the office.', '',
    'SGAS Training Management',
  ].join('\n')],
  reset: ['Reset your SGAS password', [
    'Hello Chris,', '',
    'Somebody asked to reset the password for vettahead@gmail.com. If that was you, open this link and choose a new one:', '',
    'https://sgas-opal.vercel.app/?reset=8f2c1d9a4b6e', '',
    'The link works once and stops working after 1 hour.', '',
    'If it was not you, ignore this email — nothing has changed.', '',
    'SGAS Training Management',
  ].join('\n')],
  assigned: ['You are teaching ACS Domestic Initial', [
    'Hello Simon,', '',
    'You have been put on ACS Domestic Initial.', '',
    '  When:   Mon 14 – Wed 16 Sep 2026 (3 days)',
    '  Role:   Assessor',
    '  Where:  Specialist Gas Assessment Services',
    '  Delegates: Denis Brown, Keith Rimmer and 4 others', '',
    'The calendar has the rest of the detail.', '',
    'SGAS Training Management',
  ].join('\n')],
  holiday: ['Your holiday request has been approved', [
    'Hello Jen,', '',
    'Your holiday request has been approved by Simon Walsh.', '',
    '  Dates: Mon 5 – Fri 9 Oct 2026',
    '  Working days: 5', '',
    'It is now on the calendar.', '',
    'SGAS Training Management',
  ].join('\n')],
}

mkdirSync('/tmp/sgas-emails', { recursive: true })
for (const [name, [subject, text]] of Object.entries(SAMPLES)) {
  const html = toHtml(text, subject)
  writeFileSync(`/tmp/sgas-emails/${name}.html`, html)
  console.log(`${name.padEnd(10)} ${String(html.length).padStart(6)} bytes  ${subject}`)
}
