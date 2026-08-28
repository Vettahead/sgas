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
//   • following the anchor on scroll and resize
//   • becoming a bottom sheet under 720px, where "beside it" means nothing
//
//   at      — the anchor's DOMRect, in viewport coordinates
//   dirty   — true while there is unsaved input
//   onClose — called only once closing is actually agreed
// ─────────────────────────────────────────────────────────────────────────────

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
const GAP = 10        // breathing room between the anchor and the panel
const EDGE = 12       // never come closer than this to the viewport edge
const SHEET_AT = 720  // below this width, a popover is the wrong shape

export default function Popover({ at, onClose, dirty = false, label, className = '', children }) {
  const panelRef = useRef(null)
  const returnTo = useRef(null)
  const [pos, setPos] = useState(null)
  const [sheet, setSheet] = useState(() => window.innerWidth < SHEET_AT)

  const tryClose = useCallback(() => {
    if (dirty && !window.confirm('Close without saving? What you have typed will be lost.')) return
    onClose?.()
  }, [dirty, onClose])

  // Where does it go? Below the anchor first, then above, then beside — the
  // point is that you can still SEE the thing you opened. A course bar can be
  // most of a week wide, so the caller anchors to where you clicked on it, not
  // to the whole bar.
  const place = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return
    const narrow = window.innerWidth < SHEET_AT
    setSheet(narrow)
    if (narrow) { setPos({ sheet: true }); return }
    const w = panel.offsetWidth, h = panel.offsetHeight
    const vw = window.innerWidth, vh = window.innerHeight
    // No anchor (e.g. a course we just created): centre it.
    if (!at) { setPos({ left: (vw - w) / 2, top: Math.max(EDGE, (vh - h) / 2), side: 'centre' }); return }
    const roomB = vh - at.bottom - GAP - EDGE
    const roomT = at.top - GAP - EDGE
    const roomR = vw - at.right - GAP - EDGE
    const roomL = at.left - GAP - EDGE
    let left, top, side
    if (roomB >= h) { side = 'bottom' } else if (roomT >= h) { side = 'top' }
    else if (roomR >= w) { side = 'right' } else if (roomL >= w) { side = 'left' }
    else { side = roomB >= roomT ? 'bottom' : 'top' }   // squeezed: pick the taller half
    if (side === 'bottom' || side === 'top') {
      left = at.left + at.width / 2 - w / 2
      top = side === 'bottom' ? at.bottom + GAP : at.top - GAP - h
    } else {
      left = side === 'right' ? at.right + GAP : at.left - GAP - w
      top = at.top + at.height / 2 - h / 2
    }
    // Whatever we chose, it stays on screen.
    left = Math.min(Math.max(left, EDGE), Math.max(EDGE, vw - w - EDGE))
    top = Math.min(Math.max(top, EDGE), Math.max(EDGE, vh - h - EDGE))
    // The caret points back at the anchor, wherever clamping pushed us.
    const cx = Math.min(Math.max(at.left + at.width / 2 - left, 18), w - 18)
    const cy = Math.min(Math.max(at.top + at.height / 2 - top, 18), h - 18)
    setPos({ left, top, side, cx, cy })
  }, [at])

  useLayoutEffect(() => { place() }, [place, children])
  useEffect(() => {
    const on = () => place()
    window.addEventListener('resize', on)
    window.addEventListener('scroll', on, true)
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true) }
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

  const style = pos?.sheet ? undefined : { left: pos?.left ?? -9999, top: pos?.top ?? -9999 }
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
            ? { left: pos.left + pos.cx, top: pos.side === 'bottom' ? pos.top : pos.top + (panelRef.current?.offsetHeight || 0) }
            : { top: pos.top + pos.cy, left: pos.side === 'right' ? pos.left : pos.left + (panelRef.current?.offsetWidth || 0) }} />
      )}
    </>
  )
}
