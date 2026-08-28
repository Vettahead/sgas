import { useCallback, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// One modal shell for the whole app.
//
// Every modal previously did its own thing: none handled Escape, none trapped
// focus, none was announced as a dialog, and the backdrop discarded whatever
// you had typed without asking. This fixes all of that in one place.
//
//   dirty   — true while there is unsaved input. Escape and backdrop clicks
//             then ask before discarding, instead of silently binning the work.
//   onClose — called only once closing is actually agreed.
// ─────────────────────────────────────────────────────────────────────────────

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export default function Modal({ open = true, onClose, dirty = false, label, className = '', children }) {
  const panelRef = useRef(null)
  const returnTo = useRef(null)

  const tryClose = useCallback(() => {
    if (dirty && !window.confirm('Close without saving? What you have typed will be lost.')) return
    onClose?.()
  }, [dirty, onClose])

  useEffect(() => {
    if (!open) return
    // Remember what had focus so it can be handed back on close.
    returnTo.current = document.activeElement
    const panel = panelRef.current
    // Focus the first real control, or the panel itself, so a keyboard user
    // starts inside the dialog rather than behind it.
    const first = panel?.querySelector(FOCUSABLE)
    ;(first || panel)?.focus?.()

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); tryClose(); return }
      if (e.key !== 'Tab' || !panel) return
      // Keep Tab inside the dialog.
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    // Stop the page behind scrolling under the modal.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prev
      returnTo.current?.focus?.()
    }
  }, [open, tryClose])

  if (!open) return null
  return (
    <div className="cal-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) tryClose() }}>
      <aside
        className={'cal-modal ' + className}
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </aside>
    </div>
  )
}
