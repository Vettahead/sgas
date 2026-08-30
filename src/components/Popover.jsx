import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// A popover anchored to the thing you clicked.
//
// A centred modal dims the calendar and takes the screen away from you, which
// is exactly the context you need when you are looking at a course: what else
// is that week, who else is out. This opens beside the bar instead and leaves
// the calendar visible behind it.
//
// It keeps everything the modal shell earned — Escape, a focus trap, focus
// restored on close, confirm-before-discard while dirty — and adds:
//   • flipping to the other side, or above/below, when there is no room
//   • clamping inside the viewport so it can never open off-screen
//   • MOVING WITH ITS ANCHOR as the page scrolls, and closing once the anchor
//     has scrolled out of sight
//   • becoming a bottom sheet under 720px, where "beside it" means nothing
//
//   at      — { sel, fx }: a CSS selector for the anchor element and how far
//             along it (0–1) you clicked. NOT a DOMRect: a rect captured on
//             click is frozen, so the panel stayed nailed to the screen while
//             the calendar scrolled away underneath it. A selector is also
//             re-resolved after React replaces the node on a re-render.
//             Pass null to centre the panel with no anchor.
//   dirty   — true while there is unsaved input
//   onClose — called only once closing is actually agreed
// ─────────────────────────────────────────────────────────────────────────────

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
const GAP = 10        // breathing room between the anchor and the panel
const EDGE = 12       // never come closer than this to the viewport edge
const SHEET_AT = 720  // below this width, a popover is the wrong shape

// Where is the anchor right now? Measured every time, never cached.
function anchorRect(at) {
  if (!at?.sel) return null
  const el = document.querySelector(at.sel)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (!r.width && !r.height) return null
  // A course bar can be most of a week wide, so we anchor to the point along it
  // you actually clicked rather than to the whole thing.
  const x = r.left + Math.min(Math.max(at.fx ?? 0.5, 0), 1) * r.width
  return { left: x - 10, right: x + 10, width: 20, top: r.top, bottom: r.bottom, height: r.height }
}

export default function Popover({ at, onClose, dirty = false, label, className = '', children }) {
  const panelRef = useRef(null)
  const returnTo = useRef(null)
  const posRef = useRef(null)
  const [pos, setPos] = useState(null)
  const [sheet, setSheet] = useState(() => window.innerWidth < SHEET_AT)
  // Closing has to be reachable from the scroll handler without making `place`
  // depend on it, or every keystroke would tear down the scroll listener.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const tryClose = useCallback(() => {
    if (dirty && !window.confirm('Close without saving? What you have typed will be lost.')) return
    onClose?.()
  }, [dirty, onClose])

  // Where does it go? Below the anchor first, then above, then beside — the
  // point is that you can still SEE the thing you opened.
  const place = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return
    const narrow = window.innerWidth < SHEET_AT
    const vw = window.innerWidth, vh = window.innerHeight
    // Only re-render when something actually moved. place() runs after every
    // render and on every scroll frame; a fresh object each time re-rendered
    // the whole panel for nothing — and, in the sheet case where left/top are
    // undefined, looped forever.
    const near = (x, y) => (x == null && y == null) || Math.round(x) === Math.round(y)
    const commit = (next) => {
      const a = posRef.current
      if (a && next && !!a.sheet === !!next.sheet && a.side === next.side
        && near(a.left, next.left) && near(a.top, next.top)
        && near(a.cx, next.cx) && near(a.cy, next.cy)
        && near(a.w, next.w) && near(a.h, next.h)) return
      posRef.current = next
      setPos(next)
    }
    if (narrow !== sheet) setSheet(narrow)
    if (narrow) { commit({ sheet: true }); return }

    const w = panel.offsetWidth, h = panel.offsetHeight
    const rect = anchorRect(at)
    // No anchor at all (nothing to point at): centre it.
    if (!at?.sel) { commit({ left: (vw - w) / 2, top: Math.max(EDGE, (vh - h) / 2), side: 'centre', w, h }); return }
    // The anchor has gone, or scrolled out of sight. A panel pointing at
    // nothing is worse than no panel.
    if (!rect || rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) {
      closeRef.current?.()
      return
    }

    const roomB = vh - rect.bottom - GAP - EDGE
    const roomT = rect.top - GAP - EDGE
    const roomR = vw - rect.right - GAP - EDGE
    const roomL = rect.left - GAP - EDGE
    let left, top, side
    if (roomB >= h) side = 'bottom'
    else if (roomT >= h) side = 'top'
    else if (roomR >= w) side = 'right'
    else if (roomL >= w) side = 'left'
    else side = roomB >= roomT ? 'bottom' : 'top'   // squeezed: pick the taller half
    if (side === 'bottom' || side === 'top') {
      left = rect.left + rect.width / 2 - w / 2
      top = side === 'bottom' ? rect.bottom + GAP : rect.top - GAP - h
    } else {
      left = side === 'right' ? rect.right + GAP : rect.left - GAP - w
      top = rect.top + rect.height / 2 - h / 2
    }
    // Whatever we chose, it stays on screen.
    left = Math.min(Math.max(left, EDGE), Math.max(EDGE, vw - w - EDGE))
    top = Math.min(Math.max(top, EDGE), Math.max(EDGE, vh - h - EDGE))
    // The caret points back at the anchor, wherever clamping pushed us. h and w
    // are carried so the caret can be positioned from the same measurement the
    // panel was placed with, rather than reading the DOM again mid-render.
    const cx = Math.min(Math.max(rect.left + rect.width / 2 - left, 18), Math.max(18, w - 18))
    const cy = Math.min(Math.max(rect.top + rect.height / 2 - top, 18), Math.max(18, h - 18))
    commit({ left, top, side, cx, cy, w, h })
  }, [at, sheet])

  useLayoutEffect(() => { place() })

  // Follow the anchor. Scroll fires on every frame, so this is throttled to one
  // measurement per animation frame — the panel used to be re-rendered dozens
  // of times a scroll and painted in pieces.
  useEffect(() => {
    let raf = 0
    const on = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; place() })
    }
    window.addEventListener('resize', on)
    window.addEventListener('scroll', on, true)   // capture: any scroller, not just the page
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', on)
      window.removeEventListener('scroll', on, true)
    }
  }, [place])

  useEffect(() => {
    returnTo.current = document.activeElement
    const panel = panelRef.current
    // Focus the panel, not its first control: a popover is something you are
    // reading, and stealing focus into a select puts a loud ring on open.
    panel?.focus?.({ preventScroll: true })

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); tryClose(); return }
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    // pointerdown, not click: a click that started inside and ended outside
    // (dragging to select text) must not close it.
    function onDown(e) { if (!panelRef.current?.contains(e.target)) tryClose() }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
      returnTo.current?.focus?.({ preventScroll: true })
    }
  }, [tryClose])

  // TRANSLATED into place rather than positioned with left/top. This panel is
  // position:fixed, scrolls its own content, carries a large shadow, and is
  // re-placed on every scroll frame and every render. Moving that with left/top
  // makes the browser lay it out and re-raster it each time; on some machines
  // that leaves torn, half-drawn panels behind — content stranded in a column,
  // the date block missing, a scrollbar that should not be there. A transform
  // is composited: the layer is MOVED, not redrawn. Rounded to whole pixels so
  // text never lands on a half-pixel.
  const style = pos?.sheet ? undefined : {
    transform: `translate3d(${Math.round(pos?.left ?? -9999)}px, ${Math.round(pos?.top ?? -9999)}px, 0)`,
  }
  return (
    <>
      {sheet && <div className="cx-pop-scrim" onPointerDown={tryClose} />}
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="false" aria-label={label}
        className={'cx-pop' + (sheet ? ' sheet' : '') + (pos ? ' ' + (pos.side || '') : '') + (className ? ' ' + className : '')}
        style={style}>
        {children}
      </div>
      {/* The caret lives outside the panel: the panel scrolls, and anything
          hanging off a scrolling box gets clipped. */}
      {!sheet && pos && !pos.sheet && pos.side !== 'centre' && (
        <span className={'cx-pop-caret ' + pos.side} aria-hidden="true"
          style={pos.side === 'bottom' || pos.side === 'top'
            ? { left: pos.left + pos.cx, top: pos.side === 'bottom' ? pos.top : pos.top + pos.h }
            : { top: pos.top + pos.cy, left: pos.side === 'right' ? pos.left : pos.left + pos.w }} />
      )}
    </>
  )
}
