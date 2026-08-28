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
    v: '1.12.0', build: 121, date: '28 Aug 2026',
    title: 'Calendar (new look): the side panel folds away',
    notes: [
      'The panel on the right folds away with the button in the toolbar, and the calendar takes the space back. It remembers whether you had it open, and starts closed on a smaller screen.',
      'While it is closed the button carries a count, so you still know when something needs a trainer.',
      'Picking somebody for a course now shows what each person is waiting for, with a coloured line down the side for the scheme \u2014 blue for ACS Domestic, green for Renewables, and so on.',
      'Anyone waiting for the same scheme as the course you are looking at is highlighted and listed first.',
      'Somebody already on the course is greyed out and says so, so you do not add them twice.',
      'The waiting list on the right uses the same colours, so the two lists read as one thing.',
    ],
  },
  {
    v: '1.11.0', build: 120, date: '28 Aug 2026',
    title: 'Calendar (new look): a lighter way to open a course',
    notes: [
      'Clicking a course now opens a panel beside it rather than a window over the middle of the screen \u2014 the calendar stays visible behind it, and a small arrow points back at the course you opened.',
      'It never covers the course you clicked, and it flips to whichever side has room.',
      'No more Save button. Change the trainer, the dates, who is on it, and it saves as you go \u2014 the panel says so along the bottom.',
      'The dates read as one thing: starts, ends, and how many days, in a single block you can click either half of.',
      'Every line is labelled \u2014 Trainer, On this course, Scheme \u2014 instead of an icon you have to guess at.',
      'On a phone it slides up from the bottom instead of trying to be a small panel.',
      'While you stretch a course, a chip on the bar itself tells you how long it now runs and between which dates.',
      'Round handles appear at each end of a course when you point at it, so it is obvious you can drag it.',
      'The red \u201cnow\u201d line in Day and Week view carries the time.',
      '\u201cNeeds a trainer\u201d is now a small triangle, not an amber dot \u2014 an amber dot looked the same as a course whose own colour is amber.',
      'Taking somebody off a course asks first, and the buttons are big enough to hit on a tablet.',
    ],
  },
  {
    v: '1.10.0', build: 119, date: '28 Aug 2026',
    title: 'Calendar (new look): Week, Day and Year',
    notes: [
      'Day, Week, Month and Year all present in the new-look calendar, and moving between them keeps the date you were looking at instead of throwing you back to today.',
      'Click the month name to jump straight to any month — July to November is one click, not four.',
      'Stretching a course works properly now. It follows the pointer, it reflows when it crosses onto the next week, and it can be shrunk back down again.',
      'Finishing a drag no longer opens the course you were dragging.',
      'The Year view has a day scale along the top, so you can read the date off a bar. Every month sits on the same scale, and a short course is named beside its bar rather than being an unlabelled block.',
      'The Day view is now a roster: who is teaching, who is on it and what each person is there for.',
      'The hour grid only appears when something actually has a time on it — courses run all day, so it was an empty ruler taking most of the screen.',
      '\u201cNeeds attention\u201d now follows you as you page through the calendar, instead of hiding unstaffed courses the moment you moved off their month.',
      'The key above the calendar says what the marks mean: dots are why each person is there, the bar itself is the course colour.',
    ],
  },
  {
    v: '1.9.0', build: 111, date: '28 Aug 2026',
    title: 'Calendar fixes, and a new look to try',
    notes: [
      'Fixed a fault that showed an error message after every change you made on the calendar, and stopped the screen refreshing.',
      'The Schedule tab’s calendar was showing everyone’s private entries — now it only shows your own.',
      'Nothing gets thrown away any more: pressing Escape closes a window, and closing one with something typed in it asks first. Setting up a course remembers where you were if you wander off.',
      'Dragging now works on a tablet in every view. The drag handles are big enough to grab with a finger.',
      'On a phone the menu slides over the page instead of pushing it sideways, and closes itself once you pick something.',
      'Filtering by staff no longer hides the courses that have nobody assigned yet.',
      'NEW “Calendar — new look” tab: a redesign to look at, sitting next to the one you know. Nothing has been replaced.',
    ],
  },
  {
    v: '1.8.0', build: 107, date: '27 Aug 2026',
    title: 'Calendar rebuilt, and a set-up wizard',
    notes: [
      'New “Set up a course” screen — one question at a time: the course, the dates, who is teaching, who is attending, then a check.',
      'Pick the dates by dragging across a calendar, in Month or Year view, with courses already booked shown alongside so you can see what else is on.',
      'The Month view has been rebuilt so the whole calendar matches, and it now works on a tablet.',
      'The app is around a quarter smaller and loads faster — a bought-in calendar component has been removed.',
      'Clicking a course opens it straight away, in a proper centred window instead of a narrow strip. It no longer asks whether you want to view or edit first.',
      'The course window fills the screen on a phone.',
    ],
  },
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
