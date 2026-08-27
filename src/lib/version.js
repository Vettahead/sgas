// ─────────────────────────────────────────────────────────────────────────────
// VERSION + CHANGELOG — single source of truth.
// Drives the version badge in the bottom-left of the sidebar and the
// Changelog screen (Settings → Changelog, admins only).
//
// TO MAINTAIN (every session, same as the Progress page):
//   1. Add a new entry to the TOP of RELEASES.
//   2. `build` = how many pushes the repo has had. Read it off the repo, or
//      just add the number of commits made since the last entry.
//   3. Bump `v` — minor for a new feature, patch for fixes/tweaks.
// COMMIT is injected automatically at build time (see vite.config.js) so you
// can always tell exactly which push is live on the site.
// ─────────────────────────────────────────────────────────────────────────────

export const RELEASES = [
  {
    v: '1.7.0', build: 106, date: '27 Aug 2026',
    title: 'Staff accreditations',
    notes: [
      'Admin: click a staff member\'s name to open their own page. The staff list stays clean, with a small red or amber dot beside anyone who has an accreditation expired or expiring.',
      'Add an accreditation from the qualification list, grouped by scheme exactly as the Courses screen groups it.',
      'Date achieved plus how long it lasts works out the expiry date, which can be overridden if the certificate says otherwise.',
      'Tag a qualification Must have / Nice to have / Optional — anyone missing a must-have is flagged on their record.',
      'Live countdown on every accreditation: green in date, amber inside the warning window, red expired. Warning window set to 3, 6, 9 or 12 months.',
      'Each accreditation holds a certificate link and name, ready for Dropbox.',
      'Awards staff hold but delegates never book can be marked staff-only, keeping them off the booking screens.',
      'Both new screens rebuilt on the app’s existing layout so they match the rest of the system.',
      'Calendar: drag a delegate from the waiting pool onto a block, and drag a staff member onto the trainer slot — matching the Schedule screen. The ＋ and ↩ buttons still work.',
      'Calendar: when finished blocks are being hidden it now says so, with a link to show them, instead of looking empty.',
    ],
  },
  {
    v: '1.6.0', build: 105, date: '27 Aug 2026',
    title: 'Version tracking',
    notes: [
      'Version + build number in the bottom-left of the menu — click it to open the changelog.',
      'New Changelog screen under Settings listing every release.',
      'Progress page brought up to date with the 27 August client meeting.',
    ],
  },
  {
    v: '1.5.0', build: 104, date: '29 Jun 2026',
    title: 'Help & FAQ',
    notes: [
      'Searchable Help & FAQ screen covering all 16 areas of the system, for every role.',
      'A “?” button top-right of every page pops up just that page’s help.',
    ],
  },
  {
    v: '1.4.0', build: 101, date: '28 Jun 2026',
    title: 'Calendar, holidays and admin',
    notes: [
      'Calendar reworked — Year / Month / Week / Day / Staff views, drag to create, move and resize.',
      'Holidays: staff time off shows on every calendar view and blocks a clashing trainer assignment.',
      'Customisable dashboard — add, remove, reorder, collapse and resize modules per user.',
      'Admin became the single place for staff: adding someone creates their record, login and role together.',
      'Assess header now shows a live pass / fail / NYC / to-do breakdown.',
      'Teamup removed from the screens — the in-app calendar replaces it.',
      'Progress page added (admins only).',
    ],
  },
  {
    v: '1.3.0', build: 78, date: '27 Jun 2026',
    title: 'Real catalogue and pricing',
    notes: [
      'Catalogue rebuilt off the real database — 110 qualifications across 17 schemes.',
      'Price moved onto the qualification, with a running booking cost.',
      'Waiting pool now saves properly, so bookings survive a refresh.',
      'One booking per delegate per block — second and third schemes merge in.',
      'Part-course attendance, course colour-coding, and per-qualification NYC.',
    ],
  },
  {
    v: '1.2.0', build: 52, date: '26 Jun 2026',
    title: 'Post-demo polish',
    notes: [
      'Inquiries screen for capturing leads and converting them into a booking.',
      'Courses screen became full management rather than a read-only list.',
      'Mixed new + reassessment on one booking; add a qualification to an existing booking.',
      'Postcode lookup, delegate address fields and copy-delegate-to-new-company.',
      'SGAS logo and branding throughout.',
    ],
  },
  {
    v: '1.1.0', build: 34, date: '11 Jun 2026',
    title: 'ACS form auto-fill',
    notes: [
      'The ACS application form prints filled in from the booking — one delegate, a whole block, or a zip per delegate.',
    ],
  },
  {
    v: '1.0.0', build: 28, date: '10 Jun 2026',
    title: 'First full system',
    notes: [
      'Companies and delegate history, the renewal engine and cold-call list.',
      'Per-user dashboards, payments and chase log.',
      'Assess rework with NYC and no-show, and the rebooking loop.',
      'Roles and permissions across all five roles.',
    ],
  },
  {
    v: '0.1.0', build: 1, date: '7 Jun 2026',
    title: 'Live for the first time',
    notes: [
      'The system went online with a secure login and a cloud database.',
    ],
  },
]

export const VERSION = RELEASES[0].v
export const BUILD = RELEASES[0].build
export const RELEASE_DATE = RELEASES[0].date

// Injected by vite at build time from the deploy's git commit (see vite.config.js).
// Falls back to 'dev' when running locally.
export const COMMIT = (typeof __COMMIT__ === 'string' && __COMMIT__) || 'dev'
