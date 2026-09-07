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
    v: '1.48.0', build: 211, date: '6 Sep 2026',
    title: 'The dashboard numbers go somewhere, and the renewal list is readable',
    notes: [
      'The numbers across the top of the dashboard are now buttons. Every one of them is the top of a list, and until now it was a figure you could read but not reach \u2014 \u201cPayments outstanding 14\u201d with the payments screen three clicks away. Click one and it takes you to what it is counting: to the screen where one exists, or, where the list is already further down the dashboard, it opens that card and scrolls to it. If a card is not on your dashboard \u2014 either your role does not get it or you have taken it off your own layout \u2014 it sends you to the full screen instead of doing nothing.',
      'The renewal engine no longer runs off the bottom of the page. On a six-month window it is 251 rows, which was a screenful of dashboard and then twenty screenfuls of table. It now shows the twelve most urgent with \u201cShow the other 239 due later\u201d underneath. The count in the heading still tells the truth about the whole list, so the number and the rows never disagree. Same on the cold list.',
    ],
  },
  {
    v: '1.47.0', build: 207, date: '6 Sep 2026',
    title: 'Who trained and who assessed, the past is locked, and one Domestic course',
    notes: [
      'Domestic Gas ACS is one course again. Splitting it into Initial and Reassessment was wrong: whether somebody is sitting a qualification for the first time or re-sitting it is a fact about that person on that day, it is already recorded against them per qualification, and a domestic day routinely holds both. Making it a property of the course forced one answer onto a mixed room \u2014 and produced the daft situation of \u201ca mix of re-sits and first-timers\u201d being something you had to come and resolve. There was nothing to resolve.',
      'The two-day OFTEC course on 1 September had nine candidates listed, nobody on it, and no trainer or assessor. Two separate faults, both now fixed.',
      'Every named person was being called an assessor, so where a run had two people the second was thrown away. A day only states a role when it says so \u2014 an \u201cAssessments\u201d calendar, \u201cPhil Training\u201d, the word in the title, or T&A meaning both. Otherwise the day names somebody and says nothing about what they did, and the course settles it: where one person has a definite role and the other has none, the other takes the empty slot. So \u201cOFTEC SG\u201d then \u201cDB assist\u201d on Denis Assessments reads as Simon training and Denis assessing, which is how you read it.',
      'And the delegates were missing because the old database\u2019s last assessment is 27 August. That course ran on 1 September, so there is nothing to link to and never will be \u2014 and creating bookings for courses \u201cstill to come\u201d started from today, which left the last fortnight of August and the first week of September orphaned. After the day the old database stops, Teamup is the record, and its candidate list is what a booking gets built from.',
      'While checking that, one wrong match turned up: \u201cJordan Newton\u201d had been booked on as \u201cJason Newton\u201d, because forenames were being matched on the first letter alone. A shared initial is now only enough when the calendar actually wrote an initial \u2014 otherwise the names must match, or one must be the front of the other, like Chris and Christopher. Fewer matches overall and a third fewer flagged as ambiguous.',
      'Days that have already been are now locked. You cannot drop somebody onto last March, drag out a course in a week that has gone, or book into a past date. There is a padlock in the calendar toolbar that unlocks it when you genuinely need to correct something, and while it is unlocked the calendar says so across the top until you put it back.',
    ],
  },
  {
    v: '1.46.0', build: 204, date: '6 Sep 2026',
    title: 'The forward diary, and courses that last more than a day',
    notes: [
      'The courses still to come now have people on them. There were 48 of them and not one delegate showed, and the reason was structural rather than a fault: bringing delegates across attaches an assessment that already happened, and these have not happened yet, so there was nothing in the old database to point at. They needed booking rather than linking. 122 bookings and 290 qualifications now sit on the courses between now and the end of the year.',
      'A course that runs over several days is one course again. Teamup writes each day as its own entry with the same list of candidates pasted on it, so a five-day commercial course was appearing as five separate courses \u2014 and because a delegate holds one booking they landed on the first day and the other four looked empty. 755 days are now 497 courses.',
      'Days join up only when they are the same course, within three days of each other AND share a delegate. That last test matters: Domestic reassessments run most days of the week with completely different people, and without it the whole year would have collapsed into one enormous course.',
      'Teamup\u2019s own \u201cwho\u201d field is now used, and it settles arguments the title cannot. Where the title says one assessor and \u201cwho\u201d says another, \u201cwho\u201d is right \u2014 the title records who was booked and \u201cwho\u201d records who actually did it. It also carries the second person where two ran a day together.',
      'Delegates are matched on the SGAS number written beside their name where there is one, and on name, date and qualification where there is not. 2,122 in all. Where a number and a name disagree, nothing is linked \u2014 that caught eleven cases of a note copied forward from an older event with the number never updated.',
      '72 people on those forward courses have never been here before, so they have been created from the name in the calendar note. They are marked as needing confirming and listed on Progress \u2192 Teamup with the line they came from, what they are booked onto, and anyone already on file with a near-identical name. A provisional name must never quietly become a checked-in delegate.',
      'What still needs your eye is down to 41, grouped by the reason rather than one at a time, and each one now shows its Candidates list and its \u201cwho\u201d field on screen so it can be answered without opening Teamup alongside.',
    ],
  },
  {
    v: '1.45.0', build: 196, date: '6 Sep 2026',
    title: 'Reading Teamup properly, and a waiting list that is actually waiting',
    notes: [
      'The waiting list was showing 967 people for Domestic alone. None of them were waiting. Waiting means two things and only one was being checked \u2014 no course yet AND no result yet. Every one of the 4,674 assessments imported from the old database is marked as passed, and 4,055 of them had no course attached, so twenty years of finished work was queueing up as if it needed booking. They sat it, they passed, they went home. Same for \u201cto assess\u201d, which was counting 261 courses that finished years ago.',
      'The Teamup calendars are now read for what they actually are. There is no single grid: some calendars name a course family (Domestic, OFTEC, LPG, F-Gas), some name a person and say nothing about the course (Keith Assessments, Denis Assessments, Phil Training, Simon), one says the day is not a working day at all (Hols / Not Available), and two say where the day happened (On Site / Consultancy, Meeting / Maintenance). An event sits on two or three at once and the combination is the answer.',
      'That fixes a class of error rather than a handful of entries. \u201cDOCTORS 3.15pm\u201d had become an assessment day, because the old rule was \u201cif nothing else fits, call it a course\u201d. Nothing falls through to being a course now: where nothing says which course, the answer is that we do not know, and it stays off the calendar rather than being guessed at. 23 events are in that position and they are listed for you.',
      'The four calendars called Spare are not spare. Three are Steve Johnston\u2019s \u2014 office days, assessments, and time off \u2014 and the fourth is Simon\u2019s. That is 180 events that had no reading at all.',
      'Delegates are now matched on the SGAS number written next to their name in the Candidates list, which is the same number the old database keeps. It is an exact key rather than a guess, and it reaches people no name matching could: \u201cBarnacle SGAS no 20678\u201d is a surname on its own and it resolves correctly. 786 matched, and 11 rejected where the number and the name disagreed \u2014 those turned out to be notes copied forward from an older event with the number never updated.',
      'Half days are read as well. \u201cSJ-Office AM/ PM Off\u201d is two halves of one day and was being stored as whichever half won.',
      'Assessment day drops from 260 courses to 25, because the course family was written on the calendar the whole time. What still needs your eye is down from 280 to 95, and those are real questions rather than the computer\u2019s own failures.',
    ],
  },
  {
    v: '1.44.0', build: 193, date: '6 Sep 2026',
    title: 'Teamup is on the calendar',
    notes: [
      'Everything held from Teamup is now ON the calendar, not just kept safe beside it. 878 courses, 152 holidays and 182 other days \u2014 office days, working from home, meetings, site visits \u2014 came across, and 435 delegates landed on the exact course they sat.',
      'The old screen asked you to sort 25 Teamup calendars by hand and say what each one was. That was the wrong question: the calendars were never split by course, and no answer to it would have been right. Every event is now read on its own \u2014 its title, the delegate list inside it, and the calendar it sits on \u2014 and it works out which course, whose day, on site or not, and trained-and-assessed or assessed only.',
      'Two things it now gets right that it did not before. A bank holiday is not somebody\u2019s leave \u2014 the centre is shut, which is a different thing, and it appears once for the day rather than once for every calendar that mentioned it. And \u201cPhil Hols\u201d, \u201cSteve Hols\u201d and \u201cSj-HOLS\u201d now find their owner: the calendar\u2019s nicknames are written down as nicknames, so 309 more days found the person they belong to.',
      'It could not settle 273 of the 1,235, and those are on Progress \u2192 Teamup grouped by the REASON rather than one at a time. \u201c187 events never said which course\u201d is one decision, not 187 \u2014 they are on the calendar as assessment days, and if that is right you say so once. Anything you answer there is kept even when Teamup is read again.',
      'One correction while you are there: \u201cLCL Audit Prep\u201d was sitting under Hols. It is work, not a holiday, and it now comes across as an audit prep day.',
    ],
  },
  {
    v: '1.43.0', build: 189, date: '6 Sep 2026',
    title: 'Teamup: reading it properly',
    notes: [
      'The first copy of Teamup read it wrong in one important way. A calendar called \u201cKeith Assessments\u201d was treated as Keith\u2019s own diary, when it is the courses Keith ASSESSED. Checked against the imported records: of the 156 dates on that calendar, 110 have an assessment naming Keith as the assessor. Same for Denis, and for Phil Training. Treating them as diaries would have thrown the assessor away on nearly three hundred days.',
      'So a Teamup list can now say both what it is AND whose it is \u2014 \u201ccourses, and Keith assessed them\u201d \u2014 and everything brought across starts with the right person already in the right slot instead of three hundred blanks.',
      'The bigger correction: it was only reading the event TITLES. The notes are where the real content is. 931 events carry notes, and the notes are a delegate list \u2014 names, the qualifications each person took, and an R or an I against them for reassessment or initial. That last one is the single thing the old Access database never recorded, written down against 1,031 people over two years.',
      'Press \u201cCheck Teamup again\u201d on Progress \u2192 Teamup to re-read everything with all of that applied. It updates what is already there rather than making second copies, so it is safe to press whenever.',
    ],
  },
  {
    v: '1.42.0', build: 188, date: '6 Sep 2026',
    title: 'The old database is in',
    notes: [
      'Twenty years of records from the old Access database are now in the system: 3,164 delegates, 4,674 assessments and 16,341 qualifications, covering the last seven years. Everybody\u2019s tickets, when they were assessed, who verified it and when it runs out.',
      'What that gives you straight away: 2,601 people currently hold a live qualification, 251 of them expire within six months, and 642 expired in the last year. Those last two are a renewal list and a call list that did not exist in a usable form before.',
      'Working out which records belonged to the same person was done on the National Insurance number, which settled 97.5% of them. Where it was not certain, records were kept apart rather than joined \u2014 two people merged into one record cannot be untangled afterwards, whereas a duplicate is joined back in one click.',
      'The 124 it would not call are on a new Progress \u2192 Import review tab, each showing every spelling of the name, every date of birth on file and every date they were in, with the choice left to you. Nothing there is urgent and nothing expires \u2014 those records work normally in the meantime.',
      'One thing worth knowing: 1,801 dates of birth came out of Access reading 2069, 2071 and so on \u2014 a two-digit year going in the wrong direction, not eighteen hundred typing mistakes. They have been corrected and each one is marked as corrected, so a date we changed is never mistaken for one you gave us.',
    ],
  },
  {
    v: '1.41.0', build: 187, date: '6 Sep 2026',
    title: 'Where everyone is',
    notes: [
      'The calendar can now say where somebody is on a day they are not teaching: in the office, working from home, on site at a customer, in a meeting, doing their own training or course prep, off sick, or simply not available. Pick \u201cWhere I am\u201d when adding to the calendar. It can run over several days and can be half a day \u2014 morning only or afternoon only.',
      'This is what four of the Teamup calendars called \u201cSpare\u201d were actually being used for: 535 entries between them, mostly reading \u201cOffice\u201d, and there was nowhere else to put them. Now there is, so nothing needs a spare calendar.',
      'It feeds straight into scheduling. When you are picking a trainer, anyone away is shown with the reason beside their name rather than just appearing available \u2014 \u201con site at a customer (INEOS)\u201d rather than nothing at all. One deliberate exception: on site at a customer still lets somebody be the assessor, because they are out doing the work. It is teaching at the centre they cannot do that day.',
      'Time off is unchanged and still goes through Time off, so it keeps its approval. Sickness is separate from booked holiday on purpose \u2014 they are not the same record, and an auditor will not thank you for mixing them.',
    ],
  },
  {
    v: '1.40.0', build: 186, date: '6 Sep 2026',
    title: 'A copy of the Teamup calendar, kept here',
    notes: [
      'Progress \u2192 Teamup will now take a copy of the whole Teamup calendar and keep it in this system \u2014 every event, exactly as it stands. That matters because the Teamup subscription ends in October and nothing had ever been copied out of it, so the forward schedule only existed in one place.',
      'It only ever READS from Teamup. It cannot change, move or delete anything at that end, so it is safe to run today while everyone is still working in there, and again on the day you switch over. Run it as often as you like: it updates what has changed rather than making second copies, and anything deleted in Teamup is marked here rather than quietly lost.',
      'Underneath it, the same screen asks what each of the 25 Teamup lists actually is \u2014 a course, one person\u2019s diary, holidays, or other work like meetings and site visits \u2014 because this system keeps those in different places. Where the name made it obvious the answer is already filled in; the three called \u201cSpare\u201d are left blank on purpose, because they are named spare but are in daily use for something else.',
    ],
  },
  {
    v: '1.39.0', build: 185, date: '6 Sep 2026',
    title: 'The import worklist can now be acted on',
    notes: [
      'Progress \u2192 Data import has a Create button. Until now, confirming a row only wrote down the answer \u2014 the 109 employers you had agreed to add existed nowhere. Pressing Create makes them real, and links anything already here under the same name instead of adding a second copy. It is safe to press again after you have decided a few more.',
      'The last row on the worklist is answered, so all 277 are done. \u201cAssesment only\u201d has been left out of the import on purpose: it was a way of recording things between 2000 and 2003 and it stopped, with only eleven since 2014. It is being added as a proper booking option instead, so it can be recorded going forward rather than guessed at from an old file.',
      'The assessors nobody recognised have been left out too. Their numbers on the worklist looked alarming because they counted all twenty years in the file; within the seven years being brought across they add up to eight records between them.',
    ],
  },
  {
    v: '1.38.0', build: 183, date: '2 Sep 2026',
    title: 'Sage: the connection screen',
    notes: [
      'There is a Sage tab in Admin now. It is where the connection to Sage is set up, switched on and checked \u2014 you will not need it day to day, but it is the place to look if payment status ever stops updating.',
      'The connection only ever READS from Sage. It asks whether an invoice has been paid; it cannot create, change or delete anything in your accounts, and Sage itself enforces that rather than us simply promising it.',
      'Nothing on the booking screens changes yet. Tying a Sage invoice to the right booking is the next piece of work, and until that exists no booking will start showing a payment status from Sage.',
    ],
  },
  {
    v: '1.37.0', build: 178, date: '31 Aug 2026',
    title: 'The weekend is out of the way, and the set-up window fits',
    notes: [
      'Saturday and Sunday are hidden. Courses run Monday to Friday, so two empty columns were taking up a fifth of the month for nothing \u2014 the five working days are wider now and the course names fit on them. If you want the weekend back, it is a switch under Filter, and it stays how you leave it.',
      'Setting up a course no longer scrolls. The dates step is a full month you can drag across, and on a laptop screen the window had grown tall enough to need scrolling to reach Next. It fits on every size we have tried it on, down to a 1280-wide laptop.',
      'The hover labels have been tidied up. The course name reads as a heading, the dates sit under it, and anything that still needs doing \u2014 no trainer yet, nobody booked \u2014 is pulled out on its own line in amber instead of being buried at the bottom.',
    ],
  },
  {
    v: '1.36.0', build: 177, date: '31 Aug 2026',
    title: 'Setting up a course opens over the calendar',
    notes: [
      'Press \u201cNew course\u201d on the calendar and the set-up steps open in a window over it, so you stay where you were. Close it and the course is already there \u2014 nothing to reload, and you keep the month you were looking at.',
      'Opened from the menu instead, \u201cSet up a course\u201d now uses the whole width of the page. It was capped at 840 pixels, which on a wide screen left it in a narrow column looking like a window that had lost its background.',
      'The wording of these notes has been gone back over. Some of it read as though it had been written to sound clever rather than to say what changed, so the titles are plainer and the shouting in capitals is gone.',
    ],
  },
  {
    v: '1.35.0', build: 176, date: '30 Aug 2026',
    title: 'Scheduling all happens on the calendar now',
    notes: [
      'The Schedule board has gone from the menu. It and the calendar had become two windows onto the same work, and by today the calendar did everything the board did \u2014 the ACS forms, the re-sit list, the filters, adding a qualification to somebody already booked on. Two screens doing the same job just means deciding which one to open every time.',
      'The calendar is where courses are scheduled, and the line under the page title now says exactly that instead of describing months and weeks. \u201cSet up a course\u201d is still there for the guided, one-question-at-a-time route \u2014 the two produce exactly the same thing, so use whichever suits the moment.',
      'The Help has been rewritten to match rather than thrown away. The questions were all still the right questions \u2014 where do I schedule, what is the waiting list, what if somebody only needs part of the course, how do I print the forms \u2014 only the screen changed. There are new answers on the re-sit list and on what the coloured dots mean.',
      'Anything that used to send you to the board sends you to the calendar instead, including the \u201cOpen schedule\u201d button on the dashboard.',
      'Nothing is lost. The old board is still in the code, out of the way, until you are happy with the calendar.',
    ],
  },
  {
    v: '1.34.2', build: 175, date: '30 Aug 2026',
    title: 'Tidying up after the old calendar',
    notes: [
      'The styling the deleted calendar left behind is gone \u2014 185 rules, an eighth of the whole stylesheet. Nothing looks any different: every one of the fifteen screens was measured before and after, element by element, and they come out identical to the pixel.',
      'The thing that broke the course panel twice cannot happen again without somebody noticing. The strip across the top of every page was called \u201ctop\u201d \u2014 a name so ordinary that anything else labelling itself \u201ctop\u201d silently inherited it, which is exactly what went wrong on Saturday. It has a proper name now, and there is a check that hunts for that shape of mistake across the whole app and refuses to pass if it finds one.',
      'That check tests itself. It carries the original fault as a sample and fails loudly if it ever stops recognising it \u2014 because a safety check that has quietly stopped working is worse than none at all, since it reads as an all-clear.',
      'It also lists what else is unused. Seventy-odd bits of styling from older versions are still in there; they are harmless and can go another day.',
    ],
  },
  {
    v: '1.34.1', build: 174, date: '30 Aug 2026',
    title: 'The old calendar has gone for good',
    notes: [
      'The date picker in \u201cSet up a course\u201d was the last thing still drawing the old calendar. It now uses the same grid as everywhere else \u2014 drag across the days to pick your dates, exactly the same gesture as booking a course on the calendar itself, with the same little chip telling you how many days you have picked. Month and Year both work.',
      'With that, the old calendar is gone from the system. It is not just hidden from the menu \u2014 the file itself has been deleted. There is one calendar now, in one place, and every screen that shows you a month is showing you the same one. The app is about 47KB smaller for it.',
      'A fault I caused and caught: taking the old calendar out, I deleted the list of what each role is allowed to see along with the comment above it, which broke the whole app on load. Found before it went anywhere near you \u2014 but it got past thirteen checks first, because those checks were only looking for the word FAIL and a check that dies before it starts never prints one. They now have to prove they actually ran. That is the more useful fix of the two.',
    ],
  },
  {
    v: '1.34.0', build: 173, date: '30 Aug 2026',
    title: 'Add a qualification to somebody already booked on',
    notes: [
      'You can add another qualification to somebody already booked on a course, from the calendar. Open the course, find their name, press \u201cadd a qual\u201d, pick it, say whether it is new or a reassessment, Add. It only offered this on the old Schedule board before, so you had to leave the calendar to do it.',
      'The list starts narrowed to the course\u2019s own scheme, which is nearly always what you want. Tick \u201cevery scheme\u201d and you get all 110 \u2014 for the delegate who is picking up something from a different scheme while they are in.',
      'It says so if there is nothing left to add: \u201cJohn Hartley already has every OFTEC qualification.\u201d',
      'The month on your dashboard is the new calendar now. \u201cYour month at a glance\u201d was still drawing the old calendar, which is why the retired screen was still staring at you from the front page. Same grid, same colours, same dots telling you what a course is made of \u2014 and clicking anything takes you to the real thing. The grid is now written once and used by both, so the two can never drift apart again.',
      'That is the Schedule board out of jobs. Everything it does, the calendar does.',
    ],
  },
  {
    v: '1.33.2', build: 172, date: '30 Aug 2026',
    title: 'The course panel is wider and fits more in',
    notes: [
      'A course with three people on it no longer scrolls on a normal laptop. It did, and you had to scroll past the delegates to reach the forms and the scheme underneath.',
      'The panel is wider, 376 pixels to 458, and that is most of it: names, qualification codes and dates stop wrapping onto extra lines.',
      'Each person on the course now takes two lines instead of three, and is a third shorter: 94 pixels down to 57. Their name sits on the same line as the three little links beside it, and what they are there for runs underneath at full width. Before, the links could not fit next to a two-line block and dropped onto a line of their own, so every single person cost you an extra row.',
      '\u201conly some days\u201d is now just \u201csome days\u201d, and the spacing throughout the panel has been pulled in.',
      'On a shorter screen it still scrolls, but far less \u2014 about a fifth of what it was.',
    ],
  },
  {
    v: '1.33.1', build: 171, date: '30 Aug 2026',
    title: 'A re-sit stays marked as one on the course',
    notes: [
      'The gap flagged an hour ago is closed. Put somebody back on a course to re-sit and they now stay amber (NYC) or red (no-show) \u2014 on their row inside the course, on the coloured dots along the course itself, and in the note you get when you hover it. Before this they turned green and read as an ordinary new booking the moment they were placed, and the reason they were there vanished.',
      'The coloured dots on a course now do what you asked: a course with a mixture shows one dot per kind, so amber-plus-green tells you at a glance it is a re-sit sitting alongside new bookings. Hovering it spells it out \u2014 \u201c2 booked \u00b7 1 new, 1 re-sitting\u201d.',
      'Their row inside the course reads \u201cNYC \u00b7 Re-sitting\u201d rather than just \u201cNot yet competent\u201d, so you can tell somebody who is BEING re-sat apart from somebody who was marked NYC on that course.',
      'This needed one change to the database, already applied: a booking now records which earlier booking it is a second attempt at. That is worth having on its own \u2014 it is the answer to \u201cwhich sitting was this\u201d when an auditor asks.',
      'Nothing you have already booked changes. Older re-sits made before today have no record of where they came from and will still read as ordinary bookings; everything from here on carries it.',
    ],
  },
  {
    v: '1.33.0', build: 170, date: '30 Aug 2026',
    title: 'NYC and no-shows are on the calendar',
    notes: [
      'Anyone who did not complete (NYC) or did not turn up has their own list in the panel on the right \u2014 \u201cWaiting to re-sit\u201d \u2014 sitting above the ordinary waiting list. Until now that list only existed on the Schedule board, so if you worked off the calendar they were invisible. They are the people most easily forgotten and the ones most likely to ring up asking when they are going back on.',
      'They have their own card rather than being mixed into the waiting list on purpose: it keeps their count visible even when the panel is folded up, and it stops them dropping below the fold behind newer bookings.',
      'The colours are the ones you already know. Amber for NYC, red for no-show \u2014 the same two the course bars use for the dots that tell you what a mixed course is made of. Each person carries the tag, and the dot down the side still tells you which scheme they are waiting for, so nothing has changed meaning.',
      'Dropping one onto a course books them back in for what they did not pass. It is not a new booking and they are not charged again. The panel that follows your finger says exactly that as you drag: \u201cHassan Iqbal re-sits Domestic Gas ACS \u2014 the 3 they did not pass\u201d. They are also in the \u201cAdd someone from the waiting list\u201d chips inside a course, tagged the same way and listed first.',
      'If somebody is both owed a re-sit AND has a separate new booking waiting, both show, and the new one is marked \u201calso owed a re-sit\u201d. Two different things that must not be confused for one another \u2014 hiding either would lose a real booking.',
      'One thing it does not do yet, worth knowing: once you put them on a course they read as an ordinary delegate, because re-booking creates a fresh booking and nothing on it records where it came from. The list of qualifications is right \u2014 only the ones they still need \u2014 but the amber or red does not follow them onto the course. That needs a small database change; ask me and I will do it.',
    ],
  },
  {
    v: '1.32.3', build: 169, date: '30 Aug 2026',
    title: 'Fixed: the course panel drawing itself wrong',
    notes: [
      'The fault, caught on your own screen. When a course sits low enough that its panel has to open above it rather than below, the panel was quietly picking up the styling of the strip across the top of every page \u2014 the one with the page name in it. That strip lays its contents out in a row, so the panel did too: the dates vanished, the writing was squeezed into a narrow column, and a scrollbar appeared along the bottom. The little arrow pointing back at the course was doing the same thing, which is why it drew as a big white lozenge.',
      'The cause is one word. The panel labels itself with which side it opened on \u2014 top, bottom, left or right \u2014 and \u201ctop\u201d was already the name of the page header. Nothing anywhere warns you about that, and it only ever showed on a course near the bottom of the screen, which is why it survived every test until you filmed it. The labels are now named so they cannot clash with anything else.',
      'This is the second one of these: the same kind of name clash made a button unclickable back in 1.28.1. There is now a test that catches it \u2014 it checks the panel inherits nothing from any of its four labels, AND that the old name really did break it, so the test cannot quietly stop meaning anything.',
      'If the screen still goes white when you resize the window with a panel open, tell me \u2014 that may well have been the same fault, but I have not been able to prove it.',
    ],
  },
  {
    v: '1.32.2', build: 168, date: '30 Aug 2026',
    title: 'A first attempt at the course panel fault',
    notes: [
      'The panel that opens when you click a course was sometimes drawing itself wrong \u2014 the dates missing, the writing squashed into a narrow strip down one side, a scrollbar along the bottom that should not be there \u2014 and the whole screen could go white when the window was resized with a panel open, until you refreshed.',
      'It is not a fault in the panel itself. The panel follows the course it belongs to as you scroll, and it was being MOVED in a way that makes the browser redraw the whole thing from scratch every time. On some machines that redraw does not finish, and you are left looking at half of it. It is now moved the way browsers are built to move things \u2014 the panel slides as one piece instead of being redrawn \u2014 which should also make scrolling with it open noticeably smoother.',
      'To be straight with you, this could not be reproduced away from the machine it happens on, so it is the most likely cause rather than a proven one. If you still see it, say so \u2014 the next step is different and I know what it is.',
      'The panel now fades in rather than fading and sliding. That is deliberate: the slide was the same kind of movement that provokes the fault.',
    ],
  },
  {
    v: '1.32.1', build: 167, date: '30 Aug 2026',
    title: 'The old calendar taken off the Schedule screen',
    notes: [
      'The Calendar tab inside Schedule was still the old calendar. That is why the old one never really went away \u2014 taking it out of the menu did not take it off that screen, and anyone landing there got the version with no time off, no diary entries, no filters and no ACS forms. It is now the same calendar as everywhere else, and there is genuinely only one left.',
    ],
  },
  {
    v: '1.32.0', build: 166, date: '30 Aug 2026',
    title: 'ACS forms print from the calendar',
    notes: [
      'The ACS application forms now print from the calendar. Open a course and there is a row for them: one PDF holding a filled-in form for everybody on it, a zip with one file each, or just one person\u2019s from the row with their name on it. Until today the only place this existed at all was the old Schedule board.',
      'It looks before it prints, which is the new part. A form with an empty National Insurance box, or no date of birth, is not one LCL will accept \u2014 and you find that out a fortnight later when it comes back. It now says who is short of what and makes you press \u201cPrint anyway\u201d on purpose. Nothing is ever blocked: on the day, you can still print it.',
      'It also catches something nothing could see before. If somebody is booked for a qualification the ACS form has no box for, the form used to print looking perfectly complete with nothing ticked for it. OFTEC101 is one of those, and it is on a booking already.',
      'Reception can print them. It only reads \u2014 it changes nothing \u2014 and the people who send the paperwork out are not always the people who move courses about, so it is not behind the right to edit the calendar.',
      'Two things found and fixed while doing it: the small links on a delegate\u2019s row were squeezing their name into a column an inch wide, and the buttons on a warning at the foot of a course panel could sit hidden behind the bar along the bottom.',
    ],
  },
  {
    v: '1.31.0', build: 165, date: '30 Aug 2026',
    title: 'The old calendar is out of the menu',
    notes: [
      'There is now ONE Calendar in the menu instead of two. Everything the old one could do, the new one does \u2014 and it does more.',
      'Staff time off is back on the calendar, which was the big missing piece: you can see it, book it, ask for it, approve or reject a request, and remove it. Personal diary entries are there too \u2014 a title, a date, a start and end time, and anyone else who is going.',
      'You can now remove a course. There was no way to do that at all before. It asks you once first, and the system still refuses if anybody is booked on it \u2014 take them off first.',
      'Assessor and verifier are on the course panel. They were on the old screen and nowhere on the new one, which matters when an auditor asks who assessed what.',
      'A FILTER, next to \u201cWhat the marks mean\u201d: narrow by scheme, by trainer, hide courses that have already finished, or show courses only. It tells you how many it is hiding, and Clear puts everything back. Courses with NO trainer stay visible when you filter by trainer \u2014 hiding exactly the ones that need staffing would be the wrong way round.',
      'A course runs Monday to Friday again. You could previously drag one onto a Saturday; it now moves itself off the weekend and says so, and refuses a course that would run only over a weekend.',
      'Schedulers can now schedule. The new calendar was read-only for everybody except an Admin \u2014 including the one role that exists to do this job. Reception now gets the calendar too, to look at.',
      'The three places that used to jump to the old calendar \u2014 two on the Dashboard and \u201cSee it on the calendar\u201d at the end of the booking wizard \u2014 now open the new one.',
    ],
  },
  {
    v: '1.30.0', build: 164, date: '30 Aug 2026',
    title: 'The calendar sideways on a phone, and a menu you could not reach',
    notes: [
      'Turning your phone sideways now gives you the whole month on one screen with every course name written out in full. A column goes from about half an inch wide to well over an inch \u2014 which is the difference between \u201cDomestic Gas AC\u2026\u201d and the actual name. Nothing to switch on: rotate the phone and it changes.',
      'It needed doing properly rather than just letting it rotate. Measured beforehand, turning the phone was WORSE: two thirds of the shorter screen went on the heading and buttons and the month ran off the bottom. The heading and toolbar are now much tighter sideways, and the rows are only as tall as a course actually needs.',
      'This turned up a bad one. Sideways, the menu opened as the full desktop sidebar, taller than the screen, and would not scroll. Everything from \u201cCalendar \u2014 new look\u201d downwards \u2014 Assess, Payments, Delegates, Companies, Courses, Admin, Progress, Help \u2014 was simply unreachable. The menu scrolls now, opens as an overlay sideways as it does on a narrow phone, and closes itself again once you have picked something. It was doing none of those three.',
      'The cause is worth recording: the styling decided \u201cthis is a phone\u201d by width alone, and a phone held sideways is wider than many laptops. It now asks about height as well, and the code and the styling ask the same question in one place instead of two.',
    ],
  },
  {
    v: '1.29.0', build: 163, date: '30 Aug 2026',
    title: 'Hover anything on the calendar for the detail',
    notes: [
      'Hover anything on the calendar and it tells you what it is. On a course: the dates, how long it runs, who is teaching it, how many are booked and what they are booked for, and a line telling you what it is still missing. On the side panel it gives you the full course or delegate name, which the narrow column has to cut short. On the buttons it says what they do, properly, instead of the browser\u2019s slow grey box.',
      'It works from the keyboard as well \u2014 tab to something and the same note appears, Escape closes it \u2014 and it never shows on a phone or tablet, where there is no such thing as hovering. Nothing is hover-only: everything a hover tells you, a tap or a click tells you too. That was the mistake on the old calendar and it is not repeated here.',
      'A fault, now fixed: you could drag somebody onto a course that had already finished, and the record would quietly change. The old Schedule board has always refused that; this screen did not. It now says so and declines.',
      'The side panel used to say \u201cWaiting to be placed 8\u201d and then list six people, with no way to reach the other two. The count was honest and the list was not. Every list in that panel now has a \u201cShow the other N\u201d when it has more to show.',
    ],
  },
  {
    v: '1.28.1', build: 162, date: '30 Aug 2026',
    title: 'The calendar on a phone, and a button you could not click',
    notes: [
      'A bug worth knowing about: on the little \u201cNew course\u201d panel, the \u201cFull set-up instead\u201d button had floated out of place, was sitting on top of the blue button, and could not be clicked at all. Two different things in the styling had been given the same name \u2014 that button, and the little card that follows your finger when you drag somebody onto a course \u2014 so the button had quietly been told to behave like the floating card. Both are fixed and separated.',
      'ON A PHONE, the calendar was spending a third of the screen on headings and buttons before you saw a single date. That is down by more than a hundred pixels: the toolbar sits on two tight rows instead of three, \u201cNew course\u201d is a \u002b button, and the paragraph of explanation under the page title no longer repeats on every screen. The whole month now fits on the screen without scrolling.',
      'Courses show on one line on a phone. The second line \u2014 trainer and how many are booked \u2014 was being cut off to nothing useful in a column an inch wide and was spilling over the dates above it. Tap the course to see the detail. On a laptop it stays as it was.',
      'Small things: \u201cSign out\u201d and the date no longer break across two lines at the top of a phone screen.',
    ],
  },
  {
    v: '1.28.0', build: 161, date: '30 Aug 2026',
    title: 'The calendar finished off',
    notes: [
      'The new calendar looked unfinished and the panel down the right-hand side was hard work. Both are done. A course is now a proper block on the day it runs, with its name and, underneath, who is teaching it and how many people are booked \u2014 so you can read a month without opening anything.',
      'A real fault turned up while doing it. Roughly fifty of the instructions telling this screen what size and weight to draw its text were written in a form the browser silently throws away. Every heading, every date, every day number on the new calendar has been rendering at the browser\u2019s own default rather than the size it was meant to be \u2014 which is most of why it looked unfinished. That is now fixed, and it is worth knowing because nothing anywhere reports it: the page just quietly draws the wrong thing.',
      'The side panel has stopped shouting. No boxes, no capitals, no coloured badge around every number \u2014 headings sit back and the courses and people stand out, which is the right way round for something that lives next to the calendar rather than in front of it.',
      'The two rows explaining what the dots and colours mean are gone from above the calendar and are behind a \u201cWhat the marks mean\u201d link instead. That is about an inch of screen back on every laptop, every time anyone opens it.',
      'Also: the grid lines are far fainter so the courses stand out rather than the table; weekends are no longer shaded grey, which made them look switched off; and the month title was invisible in dark mode \u2014 black text on a black background \u2014 which is now fixed.',
    ],
  },
  {
    v: '1.27.0', build: 160, date: '30 Aug 2026',
    title: 'Signing in no longer depends on a key that is being retired',
    notes: [
      'Signing in used to work by the system issuing you a signed pass, and the signature relied on one of Supabase\u2019s older keys \u2014 which they are retiring by the end of this year. On the day that key went, nobody at SGAS would have been able to load a single screen. That dependency is gone: signing in now creates a record in the database instead of a signed pass, so there is no key left to retire.',
      'Nothing to do at your end. Both methods work at once during the changeover, so nobody is thrown out mid-afternoon. The next time each person signs in they move across on their own.',
      'Three things you could not do before, and now can. Signing out actually ends the session at the database rather than just forgetting it on that machine. Changing somebody\u2019s password \u2014 or disabling their account \u2014 puts them out immediately, everywhere; previously they could carry on for up to twelve hours. And Admin \u2192 Logins & access can now show you who is signed in right now, on what kind of machine, and when they last used it.',
      'The security put in place yesterday has not been loosened by any of this. Both of the barriers around the customer data are still there \u2014 which took a less obvious route than the usual one, deliberately, because the easy way would have removed one of them.',
    ],
  },
  {
    v: '1.26.0', build: 156, date: '30 Aug 2026',
    title: 'No more typing your password twice',
    notes: [
      'The Admin page no longer asks for your password again when you open it. It only ever asked because the database had no way of knowing who was on the other end \u2014 now that it does, the page can simply check whether you are an admin and let you in.',
      'It is not a relaxation. Being an admin is now decided by looking you up in the database on every action, so somebody moved off Admin loses it on their very next click rather than whenever they next sign in. Somebody who is not an admin cannot get in whatever they type, which was never quite true of a password box.',
      'The email screen works the same way, so testing an email no longer needs the password either.',
      'The security check that was on that page during the changeover is still there, under Logins & access, but it now answers a more useful question: if somebody ever rings up saying their screens are loading empty, press it on their machine and it will say whether they simply need to sign in again or whether something is genuinely wrong.',
    ],
  },
  {
    v: '1.25.0', build: 154, date: '30 Aug 2026',
    title: 'The customer data is locked down',
    notes: [
      'The biggest thing wrong with this system has been fixed, and it was invisible from the screens. The key the website uses to reach the database was published inside every page \u2014 that is normal and unavoidable \u2014 but the database had been set up to trust it completely. Anyone who knew where to look could have read every delegate\u2019s name, date of birth, National Insurance number and address, and could have changed them.',
      'The database now tells the difference between a signed-in member of staff and somebody merely holding that key, and only answers the first. Checked from both sides afterwards: as the public key, every table and the reporting view refuse to answer; signed in, everything is there as normal.',
      'The one change you will notice: signing in now lasts a working day rather than forever. If you come back to a screen the next morning it will ask you to sign in again and say so, instead of showing you empty pages.',
      'Nothing about how the system is used has changed otherwise, and no data moved.',
    ],
  },
  {
    v: '1.24.2', build: 143, date: '29 Aug 2026',
    title: 'The earlier history filled in',
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
    title: 'The import list fills itself in, you just confirm it',
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
    title: 'Calendar: course names no longer run past their dates',
    notes: [
      'In the Year view a short course put its name out to the side of its bar, over days it was not running on. The name now sits inside the bar and is shortened to fit; a course too short to hold any of it shows just its colour, and hovering still names it.',
      'Same fault found and fixed on a phone: a long course name pushed the number of people booked on outside the bar.',
    ],
  },
  {
    v: '1.15.0', build: 125, date: '28 Aug 2026',
    title: 'Calendar: the side panel folds up',
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
    title: 'Calendar: drag people straight onto the calendar',
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
    title: 'Calendar: fixed the panel coming unstuck when you scroll',
    notes: [
      'With a course open, scrolling the page left the panel stuck to the screen while the calendar moved away underneath it, and it ended up drawn over the wrong part of the page. It now moves with the course it belongs to and the arrow stays on it.',
      'If the course you have open disappears \u2014 you page to another month, say \u2014 the panel closes with it, instead of sitting there pointing at nothing.',
    ],
  },
  {
    v: '1.13.0', build: 122, date: '28 Aug 2026',
    title: 'Calendar: book a course from any view',
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
    title: 'Calendar: the side panel folds away',
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
    title: 'Calendar: a lighter way to open a course',
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
    title: 'Calendar: Week, Day and Year',
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
