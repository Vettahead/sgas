import { useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// HELP & FAQ — a plain-English guide to how the whole system works.
// Written for non-technical staff. Maintained in code (no database).
// To edit: change the SECTIONS array below and bump UPDATED. Then commit + push.
// Search filters across every question and answer; sections are collapsible.
// ─────────────────────────────────────────────────────────────────────────────

const UPDATED = '29 Aug 2026'

// Each section = a group of question/answer pairs.
// q = question, a = answer (array of paragraphs; a leading "•" line becomes a bullet).
export const SECTIONS = [
  // ── 1. The basics ───────────────────────────────────────────────────────────
  {
    id: 'basics', icon: '🚀', title: 'Getting started',
    items: [
      {
        q: 'I have forgotten my password.',
        a: [
          'On the sign-in screen, click “Forgotten your password?”, type your username or your email address, and the system emails you a link to set a new one.',
          'The link works once and stops working an hour after it was sent. If it has expired, just ask for another. Nobody — including an administrator — can read your password; they can only set a new one.',
          'The screen says the same thing whether or not it recognised what you typed. That is on purpose: it stops the sign-in page being used to find out who works here.',
        ],
      },
      {
        q: 'I got an email saying my password was changed, and it was not me.',
        a: [
          'Tell the office straight away. That email is sent whenever a password changes — whether you did it or an administrator reset it — precisely so that a change you did not make does not go unnoticed.',
        ],
      },
      {
        q: 'What is this system for?',
        a: [
          'It is the booking, scheduling and assessment system for Specialist Gas Assessment Services. It replaces the old Access database and the separate calendar.',
          'In one place you can take an enquiry, book a delegate onto the qualifications they need, schedule them onto a course, record their pass or fail, print their ACS application form, and chase the payment — and see the whole history afterwards.',
        ],
      },
      {
        q: 'How do I log in?',
        a: [
          'Open the website address for the system in your browser, type your email and password on the login screen, and press Sign in.',
          'Your login is created for you by an administrator on the Admin screen — you do not register yourself. If you have forgotten your password, an administrator can reset it for you.',
          'The system remembers you on that device, so you usually stay signed in until you choose Sign out (bottom of the menu on the left).',
        ],
      },
      {
        q: 'Why can two people see different menus?',
        a: [
          'What you see depends on your role. Each role only shows the screens that job needs, so nobody is faced with buttons that are not theirs to use.',
          'See the “Roles and who sees what” section below for the full breakdown.',
        ],
      },
      {
        q: 'How do I move around the system?',
        a: [
          'The menu on the left is your main way around. It is grouped into Operations (the day-to-day work), Records (people, companies and courses) and a few settings.',
          'The ☰ button at the top folds the menu away to give you more room — handy on a small screen or a tablet. Press it again to bring the menu back.',
          'The “Later modules” at the bottom of the menu (Online booking, Product shop, Reporting) are greyed out — they are planned for the future and are not active yet.',
        ],
      },
      {
        q: 'Do my changes save automatically?',
        a: [
          'Yes. The system saves straight to the secure cloud database as you work — there is no separate “Save file” step. Everyone is always looking at the same up-to-date information.',
        ],
      },
    ],
  },

  // ── 2. Roles ─────────────────────────────────────────────────────────────────
  {
    id: 'roles', icon: '🔑', title: 'Roles and who sees what',
    items: [
      {
        q: 'What are the roles?',
        a: [
          '• Admin — sees everything, including the Admin screen for managing staff and logins.',
          '• Standard (reception) — Dashboard, Inquiries, Book a delegate, the Calendar, Delegates and Companies. No scheduling or assessing.',
          '• Scheduler — Dashboard, Inquiries, Book, Schedule and the Calendar.',
          '• Assessor — Dashboard (their own blocks to assess) and the Assess screen.',
          '• Accounts — Dashboard (outstanding to chase) and the Payments & chase screen.',
        ],
      },
      {
        q: 'Can one person have more than one job?',
        a: [
          'Each login has one role, which sets the menu they see. An administrator can change someone’s role at any time on the Admin screen.',
          'Separately, an admin can also be marked as a “staff member” so they can be assigned to courses as a trainer or assessor while keeping their admin access.',
        ],
      },
      {
        q: 'Where does everyone start when they log in?',
        a: [
          'On a Dashboard tailored to their role — reception sees renewals and leads, a scheduler sees blocks waiting to be assigned, an assessor sees blocks to assess, accounts see what is outstanding to chase.',
        ],
      },
    ],
  },

  // ── 3. Dashboard ─────────────────────────────────────────────────────────────
  {
    id: 'dashboard', icon: '▦', title: 'The Dashboard',
    items: [
      {
        q: 'What is the Dashboard?',
        a: [
          'It is your home screen — a set of cards (“modules”) that show what needs your attention. Which cards you get depends on your role.',
          'Cards can include overview tiles, a mini calendar of your month, the renewal engine, the cold-call list, blocks awaiting assignment, blocks to assess, outstanding payments to chase, and managed learning programmes.',
        ],
      },
      {
        q: 'Can I change my Dashboard?',
        a: [
          'Yes — it is yours to arrange. You can add or remove cards, drag them into the order you like, collapse them to save space, and even drag a card’s edge to make it a quarter, half or full width.',
          'Your layout is remembered on that device, so it looks the same next time you sign in.',
        ],
      },
      {
        q: 'What is the “Renewal engine”?',
        a: [
          'It is an automatic list of delegates whose qualifications are coming up for renewal, worked out from the dates on their records. It means nobody has to manually trawl for who is due — the system surfaces them for you to contact.',
        ],
      },
      {
        q: 'What is the “Cold list”?',
        a: [
          'A list to chase new or lapsed work — people to cold-call to bring business in, sitting alongside the renewals so reception has one place to work from.',
        ],
      },
    ],
  },

  // ── 4. Inquiries ─────────────────────────────────────────────────────────────
  {
    id: 'inquiries', icon: '💬', title: 'Inquiries (leads)',
    items: [
      {
        q: 'What is the Inquiries screen for?',
        a: [
          'It is quick lead capture for when the phone rings. You jot down the caller’s name, a contact (email or mobile), which courses they are interested in, any preferred dates and a note — without having to set up a full booking on the spot.',
        ],
      },
      {
        q: 'What do I do with a lead afterwards?',
        a: [
          'Open leads sit in a list on the right, newest first. When the lead firms up, press Convert — it carries the name and contact details straight into a new booking so you do not retype anything. If it comes to nothing, press Close.',
        ],
      },
      {
        q: 'Can I send them a price?',
        a: [
          'Emailing a priced quote from a lead is planned but not switched on yet — it is waiting on the agreed price/discount rules. For now you capture the lead and follow up the usual way.',
        ],
      },
    ],
  },

  // ── 5. Booking ───────────────────────────────────────────────────────────────
  {
    id: 'book', icon: '＋', title: 'Booking a delegate',
    items: [
      {
        q: 'What does “Book a Delegate” do?',
        a: [
          'It creates the booking — who is coming, which company pays, and which qualifications they are taking. Anyone on reception can do it; it is not just for the Director.',
          'A booking does not put anyone on a course date yet. It places them in a “waiting pool” ready to be scheduled onto a block. Think of it as: book first, schedule second, assess third, chase payment last.',
        ],
      },
      {
        q: 'How do I pick the qualifications?',
        a: [
          'You choose them from the course list. Each qualification you tick can be marked as a New assessment or a Reassessment (a renewal) — click the qualification to cycle through Reassessment, then New, then off. A single delegate can mix new and reassessment qualifications in one booking.',
          'As you tick qualifications, a running total of the cost builds up from the price set on each module.',
        ],
      },
      {
        q: 'How do I add a new delegate or company while booking?',
        a: [
          'There are forms on the booking screen to add a brand-new delegate or a new company without leaving the page.',
          'For a delegate you can fill in their address, and the Postcode lookup will fill in the town and county for you when you type a postcode and press Look up.',
          'For a sole trader who is their own company, there is a “Copy delegate → new company” button that pre-fills the company details from the delegate so you are not typing the same thing twice.',
        ],
      },
    ],
  },

  // ── 6. Schedule ──────────────────────────────────────────────────────────────
  {
    id: 'schedule', icon: '▤', title: 'Scheduling (the board)',
    items: [
      {
        q: 'What is the Schedule screen?',
        a: [
          'It is the drag-and-drop board where you assign people to course blocks. A “block” is a run of a course on particular dates (for example a five-day course next month).',
          'Each block shows its course, dates, and rows for the Trainer, Assessor and Verifier, plus the delegates placed on it.',
        ],
      },
      {
        q: 'What is the “waiting pool”?',
        a: [
          'Every delegate you book lands in the waiting pool until you place them on a block. The pool is grouped by scheme (the family of qualifications) so it is easy to find the right people.',
          'You drag a delegate from the pool onto a block to schedule them, and there is a “return to waiting pool” arrow (↩) if you place someone by mistake and want to take them back off.',
        ],
      },
      {
        q: 'Who do I assign on this screen?',
        a: [
          'You set the Trainer here and add the delegates. The Assessor and Verifier are recorded later, on the Assess screen, because that is when assessment happens.',
        ],
      },
      {
        q: 'What if a delegate only needs part of the course?',
        a: [
          'You can set the exact days they attend. By default a delegate is on for the “Full course”; press Change to set a narrower start and end within the block — useful when, say, a reassessment-only delegate just needs the last two days.',
        ],
      },
      {
        q: 'Can I add an extra qualification to someone already on a block?',
        a: [
          'Yes. On a delegate already placed on a block there is a small “+” button that lets you add another qualification to their existing booking (marking it New or Reassessment) without rebooking them from scratch.',
        ],
      },
      {
        q: 'What happens to finished courses?',
        a: [
          'Blocks whose end date has passed are hidden automatically to keep the board tidy. Tick “Show finished” if you need to see them again.',
        ],
      },
      {
        q: 'What do the colours and tags on a delegate mean?',
        a: [
          'A delegate’s tag shows what kind of attendance it is — Full (new), Re (reassessment), Mixed, NYC or No-show — and their qualification codes are listed next to their name. Courses are colour-coded so you can tell them apart at a glance.',
          'If a delegate is carrying a qualification from a different scheme than the block, a small ⚠ warning shows — it is allowed, but flagged so it is not a surprise.',
        ],
      },
    ],
  },

  // ── 7. Calendar ──────────────────────────────────────────────────────────────
  {
    id: 'calendar', icon: '📅', title: 'The Calendar',
    items: [
      {
        q: 'What does the Calendar do?',
        a: [
          'It is the visual planner — the in-app replacement for the old Teamup calendar. You can see everything by Year, Month, Week or Day.',
          'The Year view is a long planner with each month as a row and coloured bars for each course run, so you can see the whole year’s shape at once.',
        ],
      },
      {
        q: 'How do I create or change a course block on the calendar?',
        a: [
          'Drag across the days you want and a “new block” box opens for you to pick the course. To change an existing block, drag it to move it, or drag its edge to make it longer or shorter.',
          'Click any block to open a panel on the right where you can change the course or dates, set the trainer, and add or remove delegates — all without leaving the calendar.',
        ],
      },
      {
        q: 'What is the difference between an admin view and a read-only view?',
        a: [
          'Administrators get a chooser when they click a block — a “Staff view” (read-only, good for showing a client) or an “Edit view” for making changes, with a 👁 / ✏️ toggle to flip between them.',
          'People without edit rights see the read-only version: they can look at who is on a block but not change it.',
        ],
      },
      {
        q: 'How do holidays / staff time off work?',
        a: [
          'When creating an entry you can choose “Holiday (staff time off)”, pick the staff member and add a note. Holidays show as grey bars across all the views.',
          'The system will not let you assign a trainer to a course that clashes with their holiday — it warns you instead. The Admin screen also totals up how many holiday days each person has taken (weekends are not counted).',
        ],
      },
      {
        q: 'What are “engagements”?',
        a: [
          'Engagements are personal timed entries — things like “Call with John, 9–12”. Drag on the day grid in Week or Day view to create one.',
          'You own the engagements you create, and you can add other staff as members so it appears on their calendar too. To see an engagement on their own calendar, a colleague needs both a staff record and a login linked to it.',
        ],
      },
      {
        q: 'Can I filter what I see?',
        a: [
          'Yes — there are colour-coded chips to show only certain schemes or only certain trainers, and you can colour the calendar by course, scheme or status. Your filter choices are remembered on that device.',
        ],
      },
      {
        q: 'Why won’t it let me start a course on a weekend?',
        a: [
          'Courses are weekday-only, so a start date is nudged to the Monday and an end date to the Friday automatically — that stops a five-day block accidentally running across a weekend.',
        ],
      },
    ],
  },

  // ── 8. Assess ────────────────────────────────────────────────────────────────
  {
    id: 'assess', icon: '✓', title: 'Assessing (results)',
    items: [
      {
        q: 'What is the Assess screen?',
        a: [
          'It is where you record results after a course runs. Each delegate’s pre-selected qualifications are listed and you flip each one to Pass, NYC or Fail.',
          'When you mark a Pass, the achievement and expiry dates are worked out and filled in for you.',
        ],
      },
      {
        q: 'What does NYC mean?',
        a: [
          'NYC stands for “Not Yet Competent” — the delegate hasn’t passed that qualification yet but hasn’t outright failed either. It sits between Pass and Fail.',
        ],
      },
      {
        q: 'How do I see how a block is going?',
        a: [
          'The header shows a live breakdown — how many have passed, failed, are NYC, and are still to do — so you can see a block’s progress at a glance rather than just a single “pending”.',
        ],
      },
      {
        q: 'What happens to someone who doesn’t complete?',
        a: [
          'Delegates marked NYC or No-show loop back so they can be rebooked onto another course, rather than being lost. (A fuller “rebook or write off with a reason” workflow is being built next.)',
        ],
      },
      {
        q: 'Who records the assessor and verifier?',
        a: [
          'The assessor and verifier are set at this stage, since that is when the assessment is done — the trainer is set earlier on the Schedule.',
        ],
      },
    ],
  },

  // ── 9. ACS forms ─────────────────────────────────────────────────────────────
  {
    id: 'acs', icon: '📄', title: 'ACS application forms',
    items: [
      {
        q: 'How do I print an ACS application form?',
        a: [
          'The system fills the real LCL Awards ACS application form for you, on screen, ready to print — no typing onto the paper form.',
          'It fills in the delegate’s name, address, date of birth, NI number and the qualification codes they are booked for, onto the genuine template.',
        ],
      },
      {
        q: 'Where are the buttons?',
        a: [
          'On the Assess screen there is a “📄 ACS form” button per delegate, and a “Generate ACS forms for this block” button to do everyone at once as one combined PDF.',
          'On the Schedule board you can “Print ACS forms” for a whole block, or get a “Zip” with one PDF per delegate. A delegate’s name on the board is also clickable to print just their form.',
        ],
      },
      {
        q: 'What is the GN8 box?',
        a: [
          'GN8 is the guidance-note row on the form. At the moment it ticks a sensible default (renewals as “1”, first-timers as “11”). The exact rule from SGAS is being finalised and will be swapped in — everything else on the form already fills correctly.',
        ],
      },
    ],
  },

  // ── 10. Payments ─────────────────────────────────────────────────────────────
  {
    id: 'payments', icon: '£', title: 'Payments & chase',
    items: [
      {
        q: 'What does the Payments & chase screen do?',
        a: [
          'It is the final stage. After a course has run, you flag what is still outstanding against each booking (the default is “No” — not outstanding) and chase the company that pays.',
          'No actual money or invoicing lives here — that stays in Sage. This screen is about tracking what is outstanding and recording that you have chased it.',
        ],
      },
      {
        q: 'How does chasing work?',
        a: [
          'Press Chase on a booking and it emails the company’s accounts contact, stamps the date, and records the items in a chase log. Each chase carries the booking’s ID so reception can search their sent mail for it.',
          'There is a Sage reference box to tie a booking back to its record in Sage, and a Log button to see the history of chases on that booking.',
        ],
      },
      {
        q: 'What about a no-show?',
        a: [
          'A booking marked as a No-show can be credited by clearing its payment flag, so you are not chasing someone for a course they didn’t attend.',
        ],
      },
    ],
  },

  // ── 11. Delegates ────────────────────────────────────────────────────────────
  {
    id: 'delegates', icon: '👤', title: 'Delegates',
    items: [
      {
        q: 'How do I find a delegate?',
        a: [
          'Use the Delegates screen and search by name or by NI number. Open a delegate to see their full history — the courses they have taken, results and qualifications.',
        ],
      },
      {
        q: 'What information is held on a delegate?',
        a: [
          'Their name and contact details, address (used to fill the ACS form), date of birth and NI number, the company they are linked to, and their booking and assessment history.',
        ],
      },
    ],
  },

  // ── 12. Companies ────────────────────────────────────────────────────────────
  {
    id: 'companies', icon: '🏢', title: 'Companies',
    items: [
      {
        q: 'What are Companies?',
        a: [
          'Companies are the payers — the employers and sole traders the bills go to. A delegate is linked to a company so the system knows who to invoice and chase.',
        ],
      },
      {
        q: 'How do sole traders work?',
        a: [
          'A sole trader is both the delegate and the company. When booking you can copy a delegate straight into a new company so their own details become the paying company without retyping.',
        ],
      },
    ],
  },

  // ── 13. Courses ──────────────────────────────────────────────────────────────
  {
    id: 'courses', icon: '📚', title: 'Courses & qualifications',
    items: [
      {
        q: 'What is the difference between a course, a scheme and a qualification?',
        a: [
          '• A scheme is a family of qualifications (for example ACS Domestic, Commercial, LPG, OFTEC).',
          '• A qualification (or “module”) is a single assessable item with a code, like CCN1 or CENWAT — this is what a delegate actually books and passes.',
          '• A course is the bookable product that groups the qualifications in a scheme together so they can be scheduled and assessed.',
        ],
      },
      {
        q: 'What can I do on the Courses screen?',
        a: [
          'Manage the catalogue: add courses and qualifications, set their codes, schemes and renewal periods, give each course a colour, and set the price on each qualification.',
          'There are tidy tools to move a qualification to a different scheme or delete one that is not in use, and it flags any qualifications that don’t yet have a course to sit under.',
        ],
      },
      {
        q: 'How is pricing worked out?',
        a: [
          'Price is set per qualification (per module). A booking’s cost adds up the prices of the modules the delegate is taking. Discounted “bundles” of modules are being built next.',
        ],
      },
    ],
  },

  // ── 14. Admin ────────────────────────────────────────────────────────────────
  {
    id: 'admin', icon: '👥', title: 'Admin (staff & access)',
    items: [
      {
        q: 'What is the Admin screen?',
        a: [
          'The one place to manage people — only administrators see it. It has three tabs.',
          '• Staff — who works here: name, email, room, holidays taken, and what is expiring.',
          '• Logins & access — every account: username, role, active or not, reset a password, delete a login.',
          '• Email — where the system sends from, the wording of the emails it sends, and everything it has sent.',
        ],
      },
      {
        q: 'How do I add somebody?',
        a: [
          'Staff tab → “＋ New staff member”. That creates two things at once: their staff record, so they can be picked as a trainer, assessor or verifier on a course, and their login with a role.',
          'If somebody already has a login but no staff record, tick “Staff member” against their account on the Logins tab and they become assignable while keeping the access they had.',
        ],
      },
      {
        q: 'How do I see somebody’s accreditations?',
        a: [
          'Click their name on the Staff tab. That opens their own page — their details, and every accreditation they hold with its expiry countdown. “← All staff” goes back.',
          'A red or amber badge beside a name in the list means something of theirs has expired or is close to it, so you can see it without opening anyone.',
        ],
      },
      {
        q: 'Somebody has left. Do I delete them?',
        a: [
          'Press Remove on the Staff tab. It marks the day they left rather than deleting them, and that is deliberate: every course they ever taught has to keep their name on it, because that is the record an auditor asks for.',
          'They disappear from the staff list and from every trainer and assessor picker in the system, so nobody can be put on a course by mistake. Tick “Show past staff” to see them again, and Reinstate if they come back.',
          'If a course still to come had them down to run it, that course turns up in the calendar’s “Needs attention” as wanting a trainer. Nothing is silently unassigned.',
          'A record that has never been used at all — one of the made-up ones from setting the system up — is offered as a straight delete instead, because there is nothing to protect.',
        ],
      },
      {
        q: 'What is the difference between disabling and deleting a login?',
        a: [
          'Disable keeps the account and shuts the door — they cannot sign in, and you can switch it back on. Delete removes the account entirely.',
          'Deleting a login does not touch the person’s staff record or anything they have done. Two things are refused: you cannot delete the account you are signed in as, and you cannot delete the last admin.',
        ],
      },
      {
        q: 'Who approves holiday requests?',
        a: [
          'Set on the Staff tab, under “Who approves holidays”. Any admin can approve as well, so nothing waits a fortnight while one person is away.',
        ],
      },
      {
        q: 'It says “Password incorrect” and the page is empty.',
        a: [
          'The Admin page asks you to confirm your own password before it opens. If that is refused, nothing on the page can load.',
          'Check you are signed in as an account with Admin access — a Standard or Scheduler account will be refused however right the password is.',
        ],
      },
    ],
  },

  // ── Emails ──────────────────────────────────────────────────────────────────
  {
    id: 'emails', icon: '✉️', title: 'Emails the system sends',
    items: [
      {
        q: 'What does the system email on its own?',
        a: [
          'Six things, and every one of them can be switched off.',
          '• A trainer is told when they are put on a course, when they are taken off one, and when a course they are down to run is moved.',
          '• Holiday requests: whoever approves is told there is one waiting, and the person who asked is told whether it was approved or not.',
          '• Account emails: a forgotten-password link, a note when a password is changed, a welcome when a login is created, and a note when an account is switched off or back on.',
        ],
      },
      {
        q: 'Can I change what they say?',
        a: [
          'Yes — Admin → Email → Wording. Change the subject, change the message, or switch one off entirely. You do not need anybody to change the system to do it.',
          'Anything in double curly brackets, like {{course}}, is filled in when the email is sent. Each email lists the ones it can use underneath the box — they are not the same for every email, because “course” means nothing in a holiday email.',
          'Press Preview to see the real thing, built by the same code that sends it, against a real course or a real request. Save first: Preview shows what is stored, not what you have just typed.',
        ],
      },
      {
        q: 'Did an email actually go?',
        a: [
          'Admin → Email → “What has been sent”. Every attempt is listed, whether it worked or not, with the reason when it failed.',
          'The same email is not repeated inside ten minutes, so shuffling the board about does not fill somebody’s inbox. Anyone with no email address on their record is simply not emailed.',
        ],
      },
      {
        q: 'Which address do they come from?',
        a: [
          'Course and account emails come from crm@, holiday emails from holidays@. You can change which mailbox any of them uses in the Wording tab.',
        ],
      },
    ],
  },

  // ── Holidays ────────────────────────────────────────────────────────────────
  {
    id: 'holidays', icon: '🏖', title: 'Holidays and time off',
    items: [
      {
        q: 'How do I book time off?',
        a: [
          'On the Calendar, the same as adding anything else: drag the days, pick “Holiday”, add a note if it helps, and save.',
          'If you are not somebody who approves holidays, the button says “Request time off” and it goes off to be approved. It shows on the calendar in amber as “waiting for approval” until somebody decides.',
        ],
      },
      {
        q: 'Who approves it, and how?',
        a: [
          'Whoever is set as the approver in Admin → Staff, and any administrator. They get an email, and a “Holiday requests” card appears on their dashboard with Approve and Reject on each one.',
          'Rejecting asks for a reason first. The reason goes in the email, so nobody is told no without being told why.',
          'The approver’s own time off goes straight on the calendar — there is nobody to ask.',
        ],
      },
      {
        q: 'What happens once it is approved?',
        a: [
          'It goes on the calendar as time off, and the system will warn anyone trying to put that person on a course those days.',
          'A rejected request disappears from the calendar entirely — it was never time off.',
        ],
      },
      {
        q: 'How are the days counted?',
        a: [
          'In working days, Monday to Friday. A week off is five days, not seven. The days you have taken show against your name on the Admin staff list.',
        ],
      },
    ],
  },

  // ── 15. Progress page ────────────────────────────────────────────────────────
  {
    id: 'progress', icon: '🗺', title: 'The Progress page',
    items: [
      {
        q: 'What is the Progress page?',
        a: [
          'It is the live picture of where the project is — what is done, what is being built next, and what is waiting on us or on the client. Administrators can see it. It is kept up to date as work lands.',
        ],
      },
    ],
  },

  // ── 16. Tips & troubleshooting ───────────────────────────────────────────────
  {
    id: 'tips', icon: '💡', title: 'Tips & troubleshooting',
    items: [
      {
        q: 'A button or screen I expect isn’t there.',
        a: [
          'It is almost certainly your role — each role only shows the screens it needs. Ask an administrator if you think you should have access to something.',
        ],
      },
      {
        q: 'I made a change but a colleague can’t see it.',
        a: [
          'Everyone shares one live database, so changes are immediate — ask them to refresh their page. If the change was very recent it may just need that refresh to appear.',
        ],
      },
      {
        q: 'Something looks out of date after an update.',
        a: [
          'Do a hard refresh in your browser (hold Shift and click reload, or Ctrl/Cmd+Shift+R) to make sure you have the newest version of the screens.',
        ],
      },
      {
        q: 'The postcode lookup didn’t fill the house number.',
        a: [
          'The lookup fills the town and county from a postcode, not the individual house — type the house name/number and street yourself. A full address-picker is a possible future upgrade.',
        ],
      },
      {
        q: 'I still need help.',
        a: [
          'Ask an administrator, or note what you were trying to do and on which screen — that makes it quick to sort out. More “how does this work” guidance and on-screen wizards are planned for each page.',
        ],
      },
    ],
  },
]

// Which Help section(s) belong to each page (used by the per-page "?" button).
// Which help section(s) the "?" in the top bar shows on each screen. Every
// screen in the nav belongs here — a "?" that does nothing is worse than no "?".
export const VIEW_HELP = {
  dash: ['dashboard', 'holidays', 'basics'],
  inquiries: ['inquiries'],
  book: ['book'],
  setup: ['schedule', 'courses'],
  sched: ['schedule'],
  calendar: ['calendar', 'holidays'],
  calendarnext: ['calendar', 'holidays'],
  assess: ['assess', 'acs'],
  pay: ['payments'],
  delegates: ['delegates'],
  companies: ['companies'],
  courses: ['courses'],
  admin: ['admin', 'emails', 'roles'],
  roadmap: ['progress'],
  changelog: ['progress'],
}

// Turn an answer line into a paragraph or a bullet (lines starting with "•").
export function Answer({ lines }) {
  const bullets = lines.filter((l) => l.trim().startsWith('•'))
  if (bullets.length === lines.length) {
    return (
      <ul className="help-bullets">
        {lines.map((l, i) => <li key={i}>{l.replace(/^\s*•\s*/, '')}</li>)}
      </ul>
    )
  }
  return <>{lines.map((l, i) => <p key={i} className="help-p">{l}</p>)}</>
}

export default function Help() {
  const [query, setQuery] = useState('')
  const OPEN_KEY = 'sgas_help_open'
  const [open, setOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem(OPEN_KEY)) || {} } catch { return {} }
  })
  function toggle(id) {
    setOpen((o) => {
      const n = { ...o, [id]: !o[id] }
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(n)) } catch {}
      return n
    })
  }

  const q = query.trim().toLowerCase()
  const matches = (it) =>
    !q || it.q.toLowerCase().includes(q) || it.a.join(' ').toLowerCase().includes(q)

  // When searching, only show sections that have a hit, and force them open.
  const sections = SECTIONS
    .map((s) => ({ ...s, items: s.items.filter(matches) }))
    .filter((s) => s.items.length > 0)

  const totalQs = SECTIONS.reduce((n, s) => n + s.items.length, 0)

  return (
    <div className="help">
      <div className="card help-head">
        <div className="help-intro">
          <strong>How everything works.</strong> A plain-English guide to every part of the system —
          search below or open a section. {totalQs} questions answered.
          <span className="help-updated">Updated {UPDATED}</span>
        </div>
        <input
          type="text"
          className="help-search"
          placeholder="🔍 Search the help — e.g. “NYC”, “waiting pool”, “ACS form”, “reset password”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!q && (
          <div className="help-jump">
            {SECTIONS.map((s) => (
              <button key={s.id} className="help-chip" onClick={() => {
                setOpen((o) => { const n = { ...o, [s.id]: true }; try { localStorage.setItem(OPEN_KEY, JSON.stringify(n)) } catch {} ; return n })
                const el = document.getElementById('help-' + s.id)
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}>{s.icon} {s.title}</button>
            ))}
          </div>
        )}
      </div>

      {q && sections.length === 0 && (
        <div className="card"><div className="body muted">No help found for “{query}”. Try a simpler word, or browse the sections by clearing the search.</div></div>
      )}

      {sections.map((s) => {
        const isOpen = q ? true : !!open[s.id]
        return (
          <div className={'card help-sec collapsible' + (isOpen ? ' open' : '')} key={s.id} id={'help-' + s.id}>
            <h3 className="card-toggle" onClick={() => !q && toggle(s.id)}>
              <span className="chev">{isOpen ? '▾' : '▸'}</span>
              <span className="help-ic">{s.icon}</span>{s.title}
              <span className="card-count">{s.items.length}</span>
            </h3>
            {isOpen && (
              <div className="body help-list">
                {s.items.map((it, i) => (
                  <div className="help-qa" key={i}>
                    <div className="help-q">{it.q}</div>
                    <div className="help-a"><Answer lines={it.a} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
