---
name: sgas-ui-conventions
description: "SGAS UI/CSS house style — REUSE the existing classes, never invent a parallel set. Read before writing any new screen."
type: feedback
---

**Chris, 27 Aug 2026: "css is all over here, lets look at best practice and reuse the clean layout we have."** ~50 lines of bespoke `.acc-*` classes had been written for the staff accreditations panel and ~25 for the Changelog, duplicating things the app already had. Both were rewritten using the existing system; every class on both screens now already existed.

**RULE: before adding ANY CSS, find the screen that already does this and copy its markup.** `src/styles.css` is the single stylesheet and it is a real design system. Adding a parallel set of classes is the mistake.

## The system (src/styles.css)
**Tokens** — always use these, never raw hex: `--brand/--brand-dark/--brand-soft`, `--green/-soft`, `--amber/-soft`, `--red/-soft`, `--slate`, `--pend/-soft`, `--muted`, `--line`, `--panel`, `--bg`, `--ink`, `--shadow`.

**Layout**
- `.card` > `h3` (title; `<span className="tag">` inside it right-aligns automatically) > `.body` (padded content). Stack cards with `style={{ marginBottom: 18 }}` — **there is no `.col` class**.
- `.row` + `.row.c2` / `.row.c3`, `.stat-row` with `.stat` > `.n` + `.l` (`.stat.brand/.green/.amber` colour the number).
- `.card.collapsible` + `h3.card-toggle` + `.chev` + `.card-count`; `.cgroup` + `.ch`/`.cbody` for grouped collapsible blocks.

**Tables** — `table`/`th`/`td` are styled GLOBALLY. Write a plain `<table>`; never a bespoke table class. Cells: `<b>CODE</b> <span className="muted small">description</span>`, dates `className="muted nowrap"`.

**Badges** — `.b` plus `.pass` (green) `.fail` (red) `.due`/`.part` (amber) `.pend` (grey) `.scheme` (neutral). Covers essentially every status. Do NOT invent status colours. Accreditation map: `ok→pass, due→due, expired→fail, none→pend`.

**Forms** — `.subform` > `.sfh` > `.twocol` grid of `.field` > `label.fl` + input. `.inrow` for a row of controls. `.pc-msg` (+`.ok/.error/.muted`) for a message under a field.

**Buttons / links** — `.btn`, `.btn.ghost`, `.btn.sm`. `.linkbtn` = plain text button (the "← All staff" back link). `.dn-link` = dotted-underline clickable name in a row — **widened 27 Aug from `.delg .dn-link` to bare `.dn-link`** so any table can use it.

**Other** — `.hint` (amber notice), `.banner` (dashed muted box), `.empty`, `.muted`, `.small`, `.nowrap`, `.pill`, `.tag`, `.chip`, `.seg`, `.renew-alert` (flex row of `.b` count badges above a table).

## ⚠ INPUT TYPE GOTCHA (bitten twice)
The global input rule only covers `input[type=text|date|password|email|search]`, `select`, `textarea`. **`type="number"` is NOT styled** and renders as a bare narrow browser box. Use `type="text"` with `inputMode="decimal"`/`"numeric"`. A bare `<input>` with no type is the same bug.

## The reference screen
For anything list-plus-status, **copy `src/views/Delegates.jsx`'s "Qualifications & renewals" card** — card + `h3` + `.tag`, `.renew-alert` with `.b fail` / `.b due` counts, plain table, `.b` status badge with a `.muted small` day count. Simon has pointed at that card twice as the look he wants.

## Layout judgement
**Don't bolt extra columns onto an already-full table.** The Admin staff table has 8 columns; adding an "Accreditations" column plus an expanding row was rejected as messy. Per-person detail belongs on **that person's own page**, reached by clicking their name (`.dn-link`), with a `.linkbtn` "← All staff" back. Leave at most a single `.b` badge in the list as the at-a-glance signal.

See [[sgas-staff-accreditations]], [[sgas-frontend]], [[sgas-deploy-flow]].
