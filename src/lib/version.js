// ─────────────────────────────────────────────────────────────────────────────
// VERSION + CHANGELOG — single source of truth.
// Drives the version badge in the bottom-left of the sidebar and the
// Changelog screen (Settings → Changelog, admins only).
//
// TO MAINTAIN (every session, same as the Progress page):
//   1. Add a new entry to the TOP of RELEASES.
//   2. `build` = the commit count AT THE COMMIT THIS RELEASE SHIPS IN, i.e.
//      `git rev-list --count HEAD` + 1 for the commit you are about to make.
//      It drifts if you guess — 1.15.1 was labelled 126 and shipped in 127, and
//      the whole of June drifted the same way until it was rederived from git
//      on 29 Aug. DERIVE IT, never estimate: `git rev-list --count <sha>`.
//      COMMIT below is injected at build time and is always exact, so that is
//      the field to trust when asking "is my change actually live?".
//   3. Bump `v` — minor for a new feature, patch for fixes/tweaks.
// COMMIT is injected automatically at build time (see vite.config.js) so you
// can always tell exactly which push is live on the site.
// ─────────────────────────────────────────────────────────────────────────────

export const RELEASES = [
  {
    v: '1.26.0', build: 155, date: '30 Aug 2026',
    title: 'No more typing your password twice',
    notes: [
      'The Admin page no longer asks for your password again when you open it. It only ever asked because the database had no way of knowing who was on the other end \u2014 now that it does, the page can simply check whether you are an admin and let you in.',
      'It is not a relaxation. Being an admin is now decided by looking you up in the database on every action, so somebody moved off Admin loses it on their very next click rather than whenever they next sign in. Somebody who is not an admin cannot get in whatever they type, which was never quite true of a password box.',
      'The email screen works the same way, so testing an email no longer needs the password either.',
    ],
  },
  {
    v: '1.25.0', build: 154, date: '30 Aug 2026',
    title: 'The customer data is behind the lock now',
    notes: [
      'The biggest thing wrong with this system has been fixed, and it was invisible from the screens. The key the website uses to reach the database was published inside every page \u2014 that is normal and unavoidable \u2014 but the database had been set up to trust it completely. Anyone who knew where to look could have read every delegate\u2019s name, date of birth, National Insurance number and address, and could have changed them.',
      'The database now tells the difference between a signed-in member of staff and somebody merely holding that key, and only answers the first. Checked from both sides afterwards: as the public key, every table and the reporting view refuse to answer; signed in, everything is there as normal.',
      'The one change you will notice: signing in now lasts a working day rather than forever. If you come back to a screen the next morning it will ask you to sign in again and say so, instead of showing you empty pages.',
      'Nothing about how the system is used has changed otherwise, and no data moved.',
    ],
  },
  {
    v: '1.24.2', build: 143, date: '29 Aug 2026',
    title: 'The history filled in',
    notes: [
      'This screen only really started keeping track in late August. June was four months of work squeezed into seven lines, and two of the bigger days were missing outright \u2014 so it has been gone back over against what was actually built.',
      'Added: the scheduling board being rebuilt around dragging, the calendar being written from scratch (27 June, not 28 as it said), personal diary entries, the daily task list, and the renewal chase log.',
      'Every build number is now worked out from the real history rather than estimated, which is why some of the June ones have moved.',
    ],
  },
  {
    v: '1.24.1', build: 142, date: '29 Aug 2026',
    title: 'The logo is on the emails',
    notes: [
      'The SGAS logo now heads every email instead of the word typed out.',
      'If somebody\u2019s mail program blocks pictures \u2014 most do by default \u2014 it falls back to \u201cSGAS\u201d in the same white lettering, with the strapline underneath, so nothing looks broken and nothing is lost. It is still the only picture in there, deliberately.',
    ],
  },
  {
    v: '1.24.0', build: 141, date: '29 Aug 2026',
    title: 'The emails stop looking like a printout',
    notes: [
      'Every email the system sends now arrives laid out properly \u2014 headed, spaced, with the dates and details in a panel rather than run together in a paragraph. It is what a training company\u2019s email should look like when it lands next to everything else in somebody\u2019s inbox.',
      'You still type plain English in Admin \u2192 Email \u2192 Wording. You never type a tag. The layout is worked out from the shape of what you wrote: indent a line as \u201cWhen: \u2026\u201d and it becomes a row in the details panel, start a paragraph in capitals and it becomes a highlighted warning, put a link on a line of its own and it becomes a button.',
      'The plain version goes with it, exactly as you typed it. A phone that refuses pictures, an old client, a screen reader \u2014 they all still get a readable email, and that is also what the Sent log shows.',
      'No images anywhere in them, on purpose. Most mail programs block pictures by default, and an email that is a broken grey box until you press \u201cshow images\u201d is worse than one that never had any.',
      'It reads on a phone as well as a desktop, and follows dark mode if the person has it on.',
    ],
  },
  {
    v: '1.23.0', build: 140, date: '29 Aug 2026',
    title: 'Delegates finally hear from us',
    notes: [
      'Until now every email the system sent went to staff. Delegates now get one too, from bookings@, the moment they are given dates \u2014 course, dates, what they are taking, and a clear line telling them to bring photographic ID.',
      'They are also told if the course moves, if they are put on a different one, and if their place is released.',
      'The employer is copied in when that company is set to receive paperwork, so the people paying can see it without being sent a separate list.',
      'A booking sitting on the waiting list with no dates gets nothing \u2014 \u201cwe will let you know when\u201d causes phone calls rather than preventing them.',
      'The wording is yours as usual, in Admin \u2192 Email \u2192 Wording. There is no start time in the system, only dates, so \u201carrive in good time\u201d lives in the wording where you can change it.',
    ],
  },
  {
    v: '1.22.0', build: 139, date: '29 Aug 2026',
    title: 'The import list answers itself \u2014 you just confirm it',
    notes: [
      'Employers are now on the Data import tab alongside qualifications and staff \u2014 115 of them, once the history is cut to seven years. Without that cut it was 1,492 and would never have been matched by hand.',
      'Where there is an exact or close match the dropdown already has it selected: the job is to press Confirm rather than to find the right line in a list of 110.',
      'Nothing saves until you press Confirm. A box that filled itself in and saved itself would just be a guess with extra steps.',
      'Creating something now takes YOUR name for it, not the one in the old database \u2014 a text box beside the dropdown, filled in as a starting point. So a course that has been renamed gets its proper name.',
      'Two rows created under the same name become one thing, which is how \u201cEDINA\u201d and \u201cEDINA UK LTD\u201d end up as a single company.',
    ],
  },
  {
    v: '1.21.0', build: 138, date: '29 Aug 2026',
    title: 'The Access import worklist, on the Progress page',
    notes: [
      'Progress now has two tabs. The new one, Data import, is where the old Access database gets matched up to this system \u2014 and it is where you can answer the questions a computer should not answer on its own.',
      'Twenty years of typing means the file calls Simon four different things and has 122 qualification columns, only 59 of which match our codes exactly. Every one of those is a row on the list with my suggestion beside it: accept the lot in one press, or work down the ones I could not guess.',
      'Each row is one dropdown: map it to one of ours, create it, or ignore it. Picking saves straight away.',
      'Nothing is imported on a guess. Creating a qualification or a staff record happens when the import runs, not when you choose it.',
    ],
  },
  {
    v: '1.20.0', build: 136, date: '29 Aug 2026',
    title: 'Forgotten passwords sort themselves out, and every page has a ?',
    notes: [
      'Sign-in screen now has \u201cForgotten your password?\u201d. Type your username or email, get a link, choose a new password. The link works once and lasts an hour. Nobody has to reset it for you any more.',
      'The system also emails when a password is changed, when a login is created, and when an account is switched off or back on \u2014 so a change nobody made does not go unnoticed.',
      'The screen says the same thing whether or not it recognised what you typed. That is deliberate: it stops the sign-in page being used to find out who works here.',
      'Every screen now has a ? in the top corner explaining what that screen is for and how to use it, and the full Help & FAQ has been brought up to date \u2014 emails, holidays, staff leaving, and the new Admin tabs.',
    ],
  },
  {
    v: '1.19.0', build: 135, date: '29 Aug 2026',
    title: 'Holiday requests, approved or turned down by email',
    notes: [
      'Booking time off is now a request. Anyone who cannot approve holidays asks for their own days from the calendar, and it sits as \u201cwaiting for approval\u201d in amber until somebody decides.',
      'Whoever approves gets an email, and a Holiday requests card on their dashboard with Approve and Reject. Rejecting asks for a reason, and the reason goes in the email \u2014 nobody is told no without being told why.',
      'The person who asked is emailed either way, from holidays@.',
      'Admin \u2192 Staff sets who approves. Any admin can still approve, so nothing waits a fortnight while one person is away, and the approver\u2019s own time off goes straight on the calendar.',
      'Holiday is counted in working days, the way the rest of the system counts it.',
      'The wording of all three is yours to change in Admin \u2192 Email \u2192 Wording, like the course ones. Each email now lists only the placeholders that mean something in it.',
    ],
  },
  {
    v: '1.18.0', build: 134, date: '29 Aug 2026',
    title: 'Admin in three tabs, and people who leave',
    notes: [
      'Admin is no longer one long page. Three tabs: Staff, Logins and access, and Email. The staff list is the people \u2014 name, email, room, holidays and what is expiring; everything about accounts moved to its own tab.',
      'Staff can be removed. Somebody who has taught is marked as having left: they come out of the staff list and out of every trainer and assessor picker, and every course they have ever run keeps their name, because that is the record. Tick \u201cShow past staff\u201d to see them again, and Reinstate to bring them back.',
      'A made-up record that has never been used \u2014 the four seed staff \u2014 is offered as a straight delete instead.',
      'If a course still to come had them down to run it, the calendar now flags it as needing a trainer instead of quietly looking covered.',
      'Logins can be deleted outright, with two guards: never the account you are signed in as, and never the last admin.',
      'Fixed: a wrong password used to unlock Admin anyway, and then every button on the page failed with \u201cPassword incorrect\u201d against an empty screen. It now refuses properly and says what is actually wrong.',
    ],
  },
  {
    v: '1.17.0', build: 133, date: '29 Aug 2026',
    title: 'The system tells the trainer, and you decide what it says',
    notes: [
      'Three emails now send on their own: a trainer is told when they are put on a course, when they are taken off one, and when a course they are down to run is moved. A swap tells both people.',
      'The wording is yours. Admin \u2192 Email \u2192 Wording holds all three \u2014 change the subject, change the message, or switch one off \u2014 with a preview built by the same code that sends it, so what you see is what goes out.',
      'It fires wherever a trainer is assigned \u2014 the calendar, the schedule board, the set-up wizard \u2014 because it hangs off the assignment itself rather than any one screen.',
      'The same email is not repeated inside ten minutes, so shuffling the board does not fill anyone\u2019s inbox. Nobody without an email address on their record is chased for one.',
      'Admin \u2192 Email is now three tabs \u2014 Server, Wording, and what has been sent \u2014 rather than one long page.',
    ],
  },
  {
    v: '1.16.1', build: 131, date: '28 Aug 2026',
    title: 'Send test email now works, and says why when it does not',
    notes: [
      'The first test send failed with nothing more than \u201cnon-2xx status code\u201d. Two faults, both fixed: the password could not be fetched at all, and the real reason was being thrown away before it reached the screen.',
      'Any failure from here on shows the mail server\u2019s own words \u2014 a wrong password says so, rather than looking like the system is broken.',
      'Checked that the mail server is reachable from where the system sends: smtp.sgas.co.uk answers on port 465. Only the passwords themselves are still unproven.',
    ],
  },
  {
    v: '1.16.0', build: 130, date: '28 Aug 2026',
    title: 'Email settings, ready for the mailboxes',
    notes: [
      'New Email settings panel in Admin. The server and all three mailboxes are already filled in \u2014 the only thing you need to type is each password.',
      'A password box is empty before you type one and empty again the moment it is saved. It is never shown back to you or to anyone else, and it cannot be read out of the page.',
      'Leave a box empty to keep the password already stored. There is a Remove button if you ever need to take one out.',
      'A Send test email button that tells you exactly what the mail server said if it refuses, rather than just failing.',
      'A record of every email the system sends \u2014 who it went to, which address it came from, and whether it arrived.',
      'Nothing sends yet: this is the groundwork the trainer, expiry, chase and booking emails all sit on.',
    ],
  },
  {
    v: '1.15.1', build: 127, date: '28 Aug 2026',
    title: 'Calendar (new look): course names no longer run past their dates',
    notes: [
      'In the Year view a short course put its name out to the side of its bar, over days it was not running on. The name now sits inside the bar and is shortened to fit; a course too short to hold any of it shows just its colour, and hovering still names it.',
      'Same fault found and fixed on a phone: a long course name pushed the number of people booked on outside the bar.',
    ],
  },
  {
    v: '1.15.0', build: 125, date: '28 Aug 2026',
    title: 'Calendar (new look): the side panel folds up',
    notes: [
      'Every card in the side panel folds \u2014 Needs attention, the month, the waiting list, Trainers. Click the heading to fold or open it, and it remembers what you left open.',
      'Trainers starts folded, since it is the one you reach for least.',
      'A folded card still shows its count, so folding \u201cNeeds attention\u201d away can never hide that courses are short of a trainer.',
      'Pick somebody up and a folded waiting list opens itself, so you always have somewhere to drop them.',
      'Fixed a fault on phones where every card in the panel was forced to the same height whether it had anything in it or not.',
    ],
  },
  {
    v: '1.14.0', build: 124, date: '28 Aug 2026',
    title: 'Calendar (new look): drag people straight onto the calendar',
    notes: [
      'Drag anybody from the waiting list onto a course to book them on it, or onto empty days to book a new course for them \u2014 the course list opens with what they are waiting for at the top, and they go on it as soon as you book it.',
      'A new Trainers list in the side panel: drag one onto a course to put them on it. It tells you how many courses each already has on.',
      'Drag somebody off a course to put them back on the waiting list.',
      'While you drag, a card follows your finger telling you exactly what the drop will do \u2014 and it warns you before putting somebody on a course for a different scheme, or a trainer who is on holiday that week.',
      'Tapping works everywhere too: tap a person, everywhere you could put them lights up, then tap a course or a day. That is the way to do it on a phone, and it works on a desktop as well.',
      'Dragging near the top or bottom of the screen scrolls the page, so you can drag from the list up to the calendar on a phone.',
      'Nothing here replaces the old way \u2014 the course window still has \u201cAdd someone from the waiting list\u201d and a trainer picker.',
    ],
  },
  {
    v: '1.13.1', build: 123, date: '28 Aug 2026',
    title: 'Calendar (new look): fixed the panel coming unstuck when you scroll',
    notes: [
      'With a course open, scrolling the page left the panel stuck to the screen while the calendar moved away underneath it, and it ended up drawn over the wrong part of the page. It now moves with the course it belongs to and the arrow stays on it.',
      'If the course you have open disappears \u2014 you page to another month, say \u2014 the panel closes with it, instead of sitting there pointing at nothing.',
    ],
  },
  {
    v: '1.13.0', build: 122, date: '28 Aug 2026',
    title: 'Calendar (new look): book a course from any view',
    notes: [
      'Drag across days in the Year view to book a course \u2014 the same as the Month view already did. It works in Week and Day too.',
      'In the Year view you can drag from the end of one month into the next, and the course spans both.',
      'A chip follows the pointer while you drag telling you how many days you have picked and between which dates.',
      'Booking opens the same panel as everything else, beside the days you picked, already filled in with the dates \u2014 pick the course and press Book it.',
      'You can nudge the dates in that panel before booking if the drag was a day out.',
      'A plain click still books nothing \u2014 it takes a deliberate drag.',
      'Once it is booked the course opens straight away so you can put a trainer and delegates on it.',
    ],
  },
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
    v: '1.9.0', build: 118, date: '28 Aug 2026',
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
    v: '1.8.0', build: 113, date: '28 Aug 2026',
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
    v: '1.7.0', build: 110, date: '27 Aug 2026',
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
    v: '1.6.0', build: 106, date: '27 Aug 2026',
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
    v: '1.3.1', build: 96, date: '28 Jun 2026',
    title: 'Your own diary, and a list of what needs doing',
    notes: [
      'Personal engagements — anything you need in your day that is not a course. Give it a title, a date and a time and it sits on your calendar alongside the teaching.',
      'A daily task list on the dashboard, kept up to date by the system rather than by somebody remembering to tick things off.',
    ],
  },
  {
    v: '1.3.0', build: 76, date: '27 Jun 2026',
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
    v: '1.2.2', build: 62, date: '27 Jun 2026',
    title: 'The calendar, built from scratch',
    notes: [
      'The first in-app calendar, written from nothing to replace the Teamup embed — Year, Month, Week and Day, with courses as coloured bars you click straight into.',
      'Hover a course to see who is on it without opening anything.',
      'The sidebar folds away when you want the width, and the schedule sits on the calendar itself.',
    ],
  },
  {
    v: '1.2.1', build: 53, date: '27 Jun 2026',
    title: 'The scheduling board, rebuilt around dragging',
    notes: [
      'Delegates are dragged onto a course rather than picked from a form, and a waiting pool holds anyone not yet placed.',
      'The pool now survives a refresh instead of emptying itself — the bug that made the board untrustworthy.',
      'Pick, mix and remove blocks on the board; a finished course locks so history cannot be quietly rewritten.',
      'Cards fold, reorder, and stay how you left them.',
    ],
  },
  {
    v: '1.2.0', build: 29, date: '26 Jun 2026',
    title: 'Post-demo polish',
    notes: [
      'Inquiries screen for capturing leads and converting them into a booking.',
      'Courses screen became full management rather than a read-only list.',
      'Mixed new + reassessment on one booking; add a qualification to an existing booking.',
      'The dashboard modules fold away, so a long screen is only as long as you want it.',
      'Postcode lookup, delegate address fields and copy-delegate-to-new-company.',
      'SGAS logo and branding throughout.',
    ],
  },
  {
    v: '1.1.0', build: 12, date: '11 Jun 2026',
    title: 'ACS form auto-fill',
    notes: [
      'The ACS application form prints filled in from the booking — one delegate, a whole block, or a zip per delegate.',
    ],
  },
  {
    v: '1.0.0', build: 10, date: '10 Jun 2026',
    title: 'First full system',
    notes: [
      'Companies and delegate history, the renewal engine and cold-call list.',
      'Per-user dashboards, payments and chase log.',
      'Every renewal chase logged against the client — who was contacted, when, and how — so it stopped living in somebody\u2019s inbox.',
      'Assess rework with NYC and no-show, and the rebooking loop.',
      'Roles and permissions across all five roles.',
    ],
  },
  {
    // The only entry whose build does not line up with a commit of that date,
    // and it is correct: the system went live on 7 Jun, and THIS git repo was
    // started on 10 Jun ("update to git desktop"). The history before that is
    // not in here. Do not "fix" it.
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
