import { useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS / ROADMAP — single source of truth for "where we are".
// Maintained in code. To edit: change an item's `s` (status) and bump UPDATED.
// Admins-only. Statuses: progress · review(=To show client) · build · future · chris · simon · later · done.
// Workflow: when work starts set s:'progress'; when built set s:'review'; after Chris demos it set s:'done'.
// Items can nest: a child has `parent:'<id>'` and renders under the item with that `id`.
// ─────────────────────────────────────────────────────────────────────────────

const UPDATED = '27 Aug 2026'

const STATUS = {
  done:  { label: 'Done',             color: '#1a8a4b', soft: '#e4f6ec' },
  build: { label: 'Building next',    color: '#0a5ad6', soft: '#eaf1fd' },
  progress:{label: 'In progress',     color: '#4f46e5', soft: '#e8e7fd' },
  chris: { label: 'Waiting on Chris', color: '#b7791f', soft: '#fdf3e0' },
  simon: { label: 'Waiting on Simon', color: '#7b2ff2', soft: '#f1e9fe' },
  review:{ label: 'To show client',   color: '#be185d', soft: '#fce7f1' },
  future:{ label: 'On the radar',     color: '#0f766e', soft: '#d8efeb' },
  later: { label: 'Later',            color: '#48566a', soft: '#eef1f5' },
}
const ORDER = ['progress', 'review', 'build', 'future', 'chris', 'simon', 'later', 'done']

// t = title, s = status, d = detail
const ITEMS = [
  // ── Done ───────────────────────────────────────────────────────────────────
  { t: 'Live, deployed system', s: 'done', d: 'The system is live online with a secure login, backed by a cloud database. Updates publish automatically.' },
  { t: 'Role-based access', s: 'done', d: 'Admin, Reception, Scheduler, Assessor and Accounts roles — each person lands on a dashboard tailored to their job.' },
  { t: 'Customisable dashboard', s: 'done', d: 'Add / remove / reorder / collapse modules per user, plus drag-resize for width (quarter / half / full).' },
  { t: 'Renewal engine + cold-call list', s: 'done', d: 'Automatic list of who is due to renew, plus a cold-call list to chase work.' },
  { t: 'Book a delegate', s: 'done', d: 'Create a booking from reception — pick the delegate, company and qualifications, with a running cost.' },
  { t: 'Schedule (drag & drop)', s: 'done', d: 'Assign a trainer and drop delegates onto course blocks; a waiting pool holds delegates until they are placed.' },
  { t: 'Smart booking handling', s: 'done', d: 'One booking per delegate per block (auto-merges across schemes), mixed new + reassessment in one booking, and add a qualification to an existing booking.' },
  { t: 'Part-course attendance', s: 'done', d: 'Set the exact days a delegate attends when they are not on the full block.' },
  { t: 'In-app calendar (replaces Teamup)', s: 'done', d: 'Year / Month / Week / Day views; create a block straight off the calendar; click a block to edit, pick the trainer, add delegates.' },
  { t: 'Drag to move + resize blocks', s: 'done', d: 'Move and resize course blocks directly on the calendar.' },
  { t: 'Course colour-coding', s: 'done', d: 'Colour-code courses; the colours flow through the board and the calendar.' },
  { t: 'Holidays / staff time off', s: 'done', d: 'Pick the staff member and add a note; a trainer can’t be assigned to a course that clashes with their holiday; Admin shows holiday days taken.' },
  { t: 'No weekend run-over', s: 'done', d: 'Course start/end auto-snaps to Mon–Fri.' },
  { t: 'Assess screen', s: 'done', d: 'Flip each qualification to Pass / NYC / Fail with dates auto-generated; the header shows a live pass / fail / NYC breakdown.' },
  { t: 'NYC / no-show rebooking loop', s: 'done', d: 'Delegates who don’t complete loop back to be rebooked.' },
  { t: 'ACS form auto-fill', s: 'done', d: 'Prints onto the real LCL template with name, address, DOB, NI and booked codes — one delegate, a whole block combined, or a zip per delegate.' },
  { t: 'Payments & chase', s: 'done', d: 'Mark outstanding payments and chase the paying company.' },
  { t: 'Delegate records', s: 'done', d: 'Search by name or NI number and open a delegate’s full history.' },
  { t: 'Companies', s: 'done', d: 'Employers and sole traders with addresses; copy a delegate straight into a new company.' },
  { t: 'Courses catalogue', s: 'done', d: 'Full management of courses and qualifications — codes, schemes, prices — with tidy tools.' },
  { t: 'Per-module pricing', s: 'done', d: 'Price set per qualification; a booking’s cost adds up the modules taken.' },
  { t: 'Postcode lookup', s: 'done', d: 'Type a postcode to fill in the town and county.' },
  { t: 'Inquiries', s: 'done', d: 'Capture leads fast and convert them straight into a booking.' },
  { t: 'Managed Learning Programmes', s: 'done', d: 'Support for managed learning programmes / IGAS.' },
  { t: 'Admin = one place for staff', s: 'done', d: 'Adding a staff member creates the assignable record, their login and their role together.' },
  { t: 'SGAS branding', s: 'done', d: 'SGAS logo and branding throughout the app.' },

  { t: 'Version number + changelog', s: 'review', d: 'The version and build number now sit in the bottom-left of the menu — the build number counts how many times the system has been pushed live. Click it (admins) for a Changelog screen listing every release and what changed. It also shows the exact push that is live, so you can tell at a glance whether a change has reached the site yet.' },

  // ── Building next ────────────────────────────────────────────────────────────
  { t: 'In-app Help & FAQ + per-page help', s: 'review', d: 'A searchable Help & FAQ screen for every user, in plain English, covering every part of the system — getting started, roles, dashboard, inquiries, booking, scheduling, the calendar, assessing, ACS forms, payments, delegates, companies, courses, admin and troubleshooting. Plus a “?” button in the top-right of every page that pops up just that page’s help, with a link through to the full FAQ — one shared source.' },
  { t: 'Staff accreditations + expiry tracking', s: 'review', d: 'BUILT 27 Aug 2026 (core). Open Admin, click Accreditations against a staff member and their record drops open underneath. Add one from the qualification list — grouped by scheme exactly as the Courses screen groups it, so re-ordering there re-orders here — with the date achieved, how long it lasts, and an expiry date that works itself out but can be overridden if the certificate says otherwise. Each one carries a certificate link and a name, ready for Dropbox. Tag a qualification Must have / Nice to have / Optional and anyone missing a must-have is flagged on their record. Live countdown on every row (green in date, amber inside the warning window, red expired), with the warning window set to 3, 6, 9 or 12 months. The staff row shows a running count with amber and red badges, so expiries are visible without opening anyone. STILL TO COME: the Staff qualifications report button for the auditor, the dashboard panel, and the email alert (needs SMTP).' },
  { t: 'Staff qualifications report', s: 'build', d: 'One button that prints every staff member with their accreditations, expiry dates and certificates — the thing to hand the auditor in October. Sits on top of the accreditation records already being kept.' },
  { t: 'Accreditation expiry alerts', s: 'build', d: 'A dashboard panel listing what is expiring or expired across all staff, and an email warning at the chosen lead time. The email half needs the mailboxes and SMTP details.' },
  { t: 'Delete staff, logins and delegates', s: 'build', d: 'Admin can only disable a record today. Real people should stay disabled so their history is kept, but the made-up seed records need deleting outright — A Calvert, D Nuttall, S Johnston and the duplicate Keith Rimmer (the login is on the “Keith Rinmer” record, so that spelling wants fixing too). Same delete on delegates. Guarded so anything with real history can only be disabled, never deleted.' },
  { t: 'Booking wizard (question tree)', s: 'build', d: 'The piece that gets Simon off the phone. Whoever answers picks Gas → commercial or industrial → initial or reassessment → a few work-experience questions, and the wizard lands on “this is the course they need” with the dates, then offers to book it there and then — name, email, and an automatic request for photo ID. Anything the tree can’t resolve gets referred to Simon. Built as a reusable engine so the same tree can go on the website later for self-service booking. Needs Simon to map the questions first.' },
  { t: 'Dropbox document storage', s: 'build', d: 'Scanned portfolios, staff certificates and delegate ID stored in Dropbox over its API rather than on the web server — web-server storage gets expensive fast at portfolio scale. A folder is created automatically per delegate and per staff member, and the app links straight to the file. Decision made 27 Aug: build the Dropbox integration properly rather than a stopgap. Needs a Dropbox app key from Chris.' },
  { t: 'GN8 tick rule on the ACS form', s: 'build', d: 'Renewal → tick box 1; anything other than a renewal → leave blank.' },
  { t: 'ACS form tweaks', s: 'build', d: 'Move the name into its own box and stamp the date printed; tick proof of prerequisites; leave the signature blank for a manual sign.' },
  { t: 'Holiday requests workflow', s: 'build', d: 'Staff submit a request (not a confirmed booking); a "Holiday requests" block on the dashboard lets an admin accept or refuse.' },
  { t: 'NYC / Fail / No-show handling block', s: 'build', d: 'These flow into a block where you rebook them onto another course or write them off with a reason (logged on their record), so the history shows when they next enquire.' },
  { t: 'Assessor / verifier audit trail', s: 'build', d: 'Store who trained / assessed / verified each delegate + timestamp; show counts per staff member. ISO 9001 traceability.' },
  { t: 'Bundles within a course', s: 'build', d: 'In each course an "Add bundle" button: pick the modules that make up the bundle and give it its own discounted price. It still schedules and assesses exactly like the individual modules — purely a way to group them for a discount. Ready to build now; bundle names will need to match Sage.' },
  { t: 'Tidy-ups', s: 'build', d: 'Remove NYC from the old attendance list; confirm the double-click-to-delete guard is live on the calendar; confirm the Courses catalogue saves on change — Simon lost about 20 minutes of tidy-up edits last time and it was never established whether they saved.' },

  // ── Waiting on Chris ─────────────────────────────────────────────────────────
  { t: 'Create 3 mailboxes + SMTP details', s: 'chris', d: 'holidays@, crm@ and bookings@ — plus the actual SMTP server settings (not just logins). Unblocks the email features.' },
  { t: 'Email-on-assignment', s: 'chris', d: 'Email a staff member when they’re added to a block. Built once the mailboxes + SMTP details are in.' },
  { t: 'Course-name matching for Sage', s: 'chris', d: 'SGAS course names and bundles need marrying up to the Sage names by hand when Sage is wired in.' },
  { t: 'Map the pricing / discount matrix', s: 'chris', d: 'The price rules and any batch discounts need mapping before quotes, VAT and bundle pricing can be built.' },
  { t: 'Send the extra assessment forms', s: 'chris', d: 'The off-tech oil form and the QCF form, plus which course maps to which form, so they can be added alongside the ACS form.' },
  { t: 'Dropbox app key / API access', s: 'chris', d: 'A Dropbox app with API access, so document storage can be wired up without putting scans on the web server.' },
  { t: 'Paid address lookup — pick one', s: 'chris', d: 'The postcode lookup currently runs on a free service, which validates the postcode and fills the town and county but cannot offer a house-number dropdown. Re-set up the getAddress.io and Ideal Postcodes trials, compare the pricing, pick one — then it is a small swap to wire in.' },
  { t: 'Data-handling form for the database', s: 'chris', d: 'The data-handling / processing form for Simon to sign before the customer database is shared — the paper trail for taking a copy of real delegate data.' },
  { t: 'Session with Jen on Sage', s: 'chris', d: 'Jen coming in Wednesday to walk through Sage and start the course-name matching. Simon is in Australia from 11 September, so the Sage groundwork wants doing before then.' },

  // ── Waiting on Simon / client ────────────────────────────────────────────────
  { t: 'Copy of the Access database', s: 'simon', d: 'Agreed 27 Aug: Simon drops the full Access file into Dropbox and sends the link — the raw database, not a spreadsheet export, so the tables and relationships come across. Then we map what is in there to what is in here, load the customers in, and — because the Access records hold who taught and who assessed each course — backfill the calendar with the course history at the same time. Chris sends the data-handling form first. This is the last big blocker before real use.' },
  { t: 'Sage access', s: 'simon', d: 'Ideally a read-only, non-destructive API key. The big later module.' },
  { t: 'Get all staff entered', s: 'done', d: 'Jen has entered the staff — Denis Brown, Jennifer Gadsdon, Keith Rimmer, Philip Rossall and Simon Gadsdon, with logins. The leftover made-up records get cleaned up with the delete button.' },
  { t: 'List of staff accreditations', s: 'simon', d: 'Jen to put every staff accreditation on a spreadsheet with its expiry date, and the physical certificates scanned. Also the list of the extra awards that are not in the course catalogue — verifier / IQA and similar — and which of them are must-have to work at SGAS versus nice-to-have or optional.' },
  { t: 'Map the booking question tree', s: 'simon', d: 'The question flow for the booking wizard: what gets asked, in what order, and which answers lead to which course. Simon has it in his head today, which is what keeps him tied to the phone.' },
  { t: 'Finish the courses catalogue', s: 'simon', d: 'Homework from 27 Aug: go back through the Courses screen — 4 qualifications are still sitting in “Other” with no course product, a few need renaming, and colour-coding them makes the calendar much easier to read. No prices are set on any qualification yet either.' },
  { t: 'Cancel the Teamup subscription', s: 'simon', d: 'Teamup expires in October and the in-app calendar replaces it — so the calendar wants to be in real use before then. A hard date worth working back from.' },

  // ── On the radar (discussed, not started / not resolved) ─────────────────────
  { t: 'Sage integration', id: 'sage', s: 'future', d: 'Sage Business Cloud Accounting has a REST API with OAuth sign-in, so Jen would sign into the system with her Sage details and the two talk to each other. Bookings generate a draft invoice in Sage for Jen to check and release; payments come back the other way. Money lives in Sage, so the items nested below hang off this — if Sage can’t do it, they fall away. Depends on Sage access + course-name matching.' },
  { t: 'Invoicing', parent: 'sage', s: 'future', d: 'Raise and track invoices against bookings, cross-referenced to Sage by reference number.' },
  { t: 'Payment chasing (with reference IDs)', parent: 'sage', s: 'future', d: 'Log every chase and put a searchable ID in the email; tie outstanding payments back to the Sage record.' },
  { t: 'Quotes, discounts & VAT', parent: 'sage', s: 'future', d: 'Turn a booking into a priced quote (sum the modules, discounts, VAT) and email it. Needs the pricing matrix first.' },
  { t: 'PO numbers on bookings', parent: 'sage', s: 'future', d: 'Capture a purchase-order number against a booking for invoicing.' },
  { t: 'Paid / part-paid / unpaid status', parent: 'sage', s: 'future', d: 'Every booking carries paid, part-paid (deposit) or unpaid, pulled back from Sage, with an outstanding balance per delegate. Outstanding shows on the dashboard as a list to work, and when that person rings again their balance flags up on the inquiry before anyone books them on. Means Keith no longer needs his own Sage login — he sees what he needs here when he signs a portfolio off.' },
  { t: 'Course information pool', s: 'future', d: 'A central pool of information and documents for each course that bundles and bookings link to — so they reuse one shared set rather than re-hooking the details every time. (The “pool of information” to-do.)' },
  { t: 'Security hardening', s: 'future', d: 'Lock down database access rules (RLS) and work toward Cyber Essentials before real delegate data goes in.' },
  { t: 'Strip demo / sample data before go-live', s: 'future', d: 'Remove the fake users and sample delegate details before the real data import.' },
  { t: 'Reporting', s: 'future', d: 'Management reports — assessments per assessor, throughput, outstanding, etc.' },
  { t: 'GDPR opt-in wording', s: 'future', d: 'Agree the consent wording for renewal / marketing emails before they go out.' },
  { t: 'Lock finished blocks at database level', s: 'future', d: 'Finished blocks are currently locked in the screen only; enforce it in the database too.' },
  { t: 'Email backend (sending + reply tracking)', s: 'future', d: 'A proper transactional email layer to power renewal emails, chases and booking confirmations, with send/reply tracking.' },
  { t: 'Document pack assembly', s: 'future', d: 'On assess-complete, bundle each qualification’s supporting documents with the front page into one download for the printer.' },
  { t: 'Employer copy printing', s: 'future', d: 'Print an employer copy of the certificate / application when the company has the send-to-employer flag set.' },
  { t: 'Staged renewal follow-up', s: 'future', d: 'Track sends/replies; after a set number of unanswered renewal emails a delegate drops onto the cold-call list.' },
  { t: 'DOB fuzzy matching', s: 'future', d: 'Match delegates on date of birth when an NI number looks mis-keyed, and surface close matches to avoid duplicates.' },
  { t: 'Qualification grid per delegate', s: 'future', d: 'A full grid of every qualification a delegate holds, cross-referenced with renewal dates.' },
  { t: 'IGAS 5-year evidence timer', s: 'future', d: 'Keep IGAS evidence on the server with a 5-year timer; after 5 years the copy is removed and IGAS resets.' },
  { t: 'Gas-safety date reconcile', s: 'future', d: 'Normalise the 4/5/6 gas-safety date variances and fill in the known ones on each record.' },

  // ── Later (parked) ──────────────────────────────────────────────────────────
  { t: 'Self-service website booking', s: 'later', d: 'Public books in → lands as pending (like holidays) → confirm eligibility, call within 48h, send confirmation.' },
  { t: 'Zoom / Teams meeting links', s: 'later', d: 'Attach a meeting link to a calendar entry. Nice-to-have.' },
  { t: 'Calendar history / undo / restore', s: 'later', d: '2-day history with the ability to restore a deleted calendar item.' },
  { t: 'In-app FAQ + per-page wizards', s: 'later', d: 'A comprehensive FAQ and "how does this work" wizards on each page, plus a training session.' },
  { t: 'Front-desk sign-in / attendance', s: 'later', d: 'A tablet at reception lists who should attend; the delegate taps their name, signs and confirms — marking attendance automatically.' },
  { t: 'Passport-photo capture', s: 'later', d: 'Tablet / webcam with a countdown takes the delegate’s photo straight into the system and onto the printed form.' },
  { t: 'Claim workflow (no-portfolio courses)', s: 'later', d: 'For courses with no portfolio (e.g. heat pumps), after a pass the assessor marks it “claimed” on the external system — surfaced as a reminder on their dashboard.' },
  { t: 'Phone app + calendar sharing', s: 'later', d: 'The calendar on a phone, so staff can see the courses and assessments they are on for the week without opening a laptop. Also the option to subscribe to it from an ordinary calendar app.' },
  { t: 'Exam delivery on the training-room PCs', s: 'later', d: 'The next stage after this system: the delegate signs in at an assigned workstation, confirms their date of birth, and sees only the courses they are on that day — papers, job instructions and supporting PDFs opening in tabs, with a question matrix and timers if wanted. The machines get wiped down to a browser on a separate network with only this domain allowed, so nobody can wander off or cheat. Network and workstation work sits alongside it.' },
  { t: 'Bulk email / Mailchimp', s: 'later', d: 'Optional hook to a bulk-email tool for any mass sends (individual sends stay the default to avoid flooding the phones).' },
]

function Badge({ s }) {
  const st = STATUS[s]
  return <span className="rm-badge" style={{ color: st.color, background: st.soft }}>{st.label}</span>
}

export default function Roadmap() {
  // Code is the seed; a person can re-assign "Waiting on" items between Chris and
  // Simon live — those choices are remembered in this browser (key by title).
  const MOVE_KEY = 'sgas_roadmap_moves'
  const [moves, setMoves] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MOVE_KEY)) || {} } catch { return {} }
  })
  const OPEN_KEY = 'sgas_roadmap_open'
  const DEFAULT_OPEN = { progress: true, review: true, build: true, chris: true, simon: true, future: false, later: false, done: false }
  const [open, setOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem(OPEN_KEY)) || DEFAULT_OPEN } catch { return DEFAULT_OPEN }
  })
  function toggle(k) {
    setOpen((o) => {
      const n = { ...o, [k]: !o[k] }
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(n)) } catch {}
      return n
    })
  }

  // A chris/simon item can be re-assigned (chris<->simon) or marked complete by
  // Simon -> "review" so it lands with Chris to check off. Override wins for those.
  const eff = (it) => (moves[it.t] ? moves[it.t] : it.s)
  const view = ITEMS.map((it) => ({ ...it, s: eff(it) }))

  const baseOf = (title) => { const b = ITEMS.find((x) => x.t === title); return b ? b.s : null }
  function setStatus(title, to) {
    setMoves((m) => {
      const next = { ...m }
      if (to === baseOf(title)) delete next[title]   // back to code default = clear override
      else next[title] = to
      try { localStorage.setItem(MOVE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const total = view.length
  const doneN = view.filter((i) => i.s === 'done').length
  const pct = Math.round((doneN / total) * 100)
  const counts = Object.fromEntries(ORDER.map((k) => [k, view.filter((i) => i.s === k).length]))

  return (
    <div className="rm">
      <div className="rm-head card">
        <div className="rm-progress">
          <div className="rm-progress-top">
            <strong>{doneN} of {total} shipped</strong>
            <span className="rm-updated">Updated {UPDATED}</span>
          </div>
          <div className="rm-bar"><div className="rm-bar-fill" style={{ width: pct + '%' }} /></div>
          <div className="rm-pct">{pct}% complete</div>
        </div>
        <div className="rm-tiles">
          {ORDER.map((k) => (
            <div className="rm-tile" key={k} style={{ borderColor: STATUS[k].soft }}>
              <div className="rm-tile-n" style={{ color: STATUS[k].color }}>{counts[k]}</div>
              <div className="rm-tile-l">{STATUS[k].label}</div>
            </div>
          ))}
        </div>
      </div>

      {ORDER.map((k) => {
        const rows = view.filter((i) => i.s === k)
        if (!rows.length) return null
        const isOpen = !!open[k]
        const tops = rows.filter((i) => !i.parent)
        const kids = (id) => (id ? rows.filter((i) => i.parent === id) : [])
        const Item = (it, key, sub) => (
          <div className={'rm-item' + (sub ? ' rm-sub' : '') + (k === 'done' ? ' rm-item-done' : '')} key={key}>
            <div className="rm-item-h">
              <span className="rm-item-t">{k === 'done' ? '✓ ' : ''}{it.t}</span>
              <span className="rm-item-r">
                {k === 'chris' && (
                  <button className="rm-move" onClick={() => setStatus(it.t, 'simon')}>→ Simon</button>
                )}
                {k === 'simon' && (
                  <>
                    <button className="rm-move" onClick={() => setStatus(it.t, 'chris')}>→ Chris</button>
                    <button className="rm-move rm-complete" onClick={() => setStatus(it.t, 'review')}>✓ Complete</button>
                  </>
                )}
                {k === 'progress' && (
                  <button className="rm-move rm-complete" onClick={() => setStatus(it.t, 'review')}>✓ Ready to show</button>
                )}
                {k === 'review' && (
                  <button className="rm-move rm-complete" onClick={() => setStatus(it.t, 'done')}>✓ Shown to client</button>
                )}
                {k !== 'done' && <Badge s={it.s} />}
              </span>
            </div>
            <div className="rm-item-d">{it.d}</div>
          </div>
        )
        return (
          <div className={'card rm-sec collapsible' + (isOpen ? ' open' : '')} key={k}>
            <h3 className="card-toggle" onClick={() => toggle(k)}>
              <span className="chev">{isOpen ? '▾' : '▸'}</span>
              <span className="rm-dot" style={{ background: STATUS[k].color }} />{STATUS[k].label}
              <span className="card-count">{rows.length}</span>
            </h3>
            {isOpen && (
              <div className="body rm-list">
                {tops.map((it, i) => (
                  <div key={i}>
                    {Item(it, 't' + i, false)}
                    {kids(it.id).length > 0 && (
                      <div className="rm-subwrap">
                        {kids(it.id).map((c, ci) => Item(c, 't' + i + 's' + ci, true))}
                      </div>
                    )}
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
