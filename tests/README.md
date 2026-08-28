# Runtime tests — Calendar (new look)

**A passing `vite build` proves almost nothing.** It is what let the `setNonce`
crash reach the live site: a runtime error in a code path the build never
executes. Everything here drives a real headless Chromium against a **production
build** and asserts on what the DOM actually does.

Four suites, 213 assertions as of 28 Aug 2026:

| file | what it guards |
|---|---|
| `bugs.mjs` | 104 — the four views, resize and reflow across week boundaries, drag-to-book in every view, the anchored popover, scroll-following |
| `dnd.mjs` | 68 — dragging and tapping people from the rail onto the calendar, at **desktop, tablet and phone** |
| `cards.mjs` | 26 — the folding rail cards, at desktop and phone |
| `overflowcheck.mjs` | 15 — nothing inside a course bar may lay out beyond it, all four views × three sizes |

## Running them

They need Playwright and a Chromium binary; the Claude cloud container has one
pre-installed at `/opt/pw-browsers/chromium-*/chrome-linux/chrome` (do **not**
run `playwright install`). Set up a scratch copy of the app, because each suite
serves `dist/` over a local static server on its own port:

```sh
mkdir -p /tmp/sgastest && cd /tmp/sgastest
cp -r <repo>/src <repo>/index.html <repo>/package.json <repo>/vite.config.js <repo>/public .
npm install && npm install playwright
cp <repo>/tests/*.mjs .
npx vite build
node bugs.mjs && node dnd.mjs && node cards.mjs && node overflowcheck.mjs
```

They log in as `admin` / `demo` (the client-side demo dataset), so they never
touch live Supabase data. Update the chromium path in each file if the container
image changes.

## Two rules learned the hard way

1. **Assert on the data changing, not on the gesture completing.** A drag that
   "worked" is worth nothing if nobody moved between lists. Every drop here is
   checked by the waiting-list count, the delegate appearing on the course, or
   the trainer's course count.
2. **Look at the screenshots.** Four defects this session passed every assertion
   and were caught by eye: the rail dropping below the calendar instead of
   hiding (the test checked the `hidden` attribute, not computed display), the
   popover swallowing drops, every rail card forced to one height on a phone,
   and Year-view labels painting outside their bars. Each suite writes PNGs to
   `/home/claude/`.
