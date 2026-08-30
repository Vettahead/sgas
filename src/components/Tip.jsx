import { useEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Hover tips, app-wide.
//
// Mounted once. Anything anywhere can opt in by carrying a `data-tip` attribute
// — no import, no wrapper component, no per-screen plumbing. Newlines in the
// attribute become real lines.
//
// Why not the browser's own `title`? Because it waits about a second, cannot be
// styled, never appears on keyboard focus, and on Windows draws a small grey
// box that has nothing to do with the rest of the app. The elements that had
// `title` still have it removed in favour of this.
//
// THREE RULES THIS FOLLOWS, all learned the hard way elsewhere in this app:
//   • Nothing hover-only is ever the ONLY route to a fact. Every tip here
//     repeats something a tap or a click also reveals, because a tablet has no
//     hover at all — that is exactly the fault logged against the old calendar's
//     hover card, and it is not being repeated.
//   • Keyboard users get it too: focus shows the tip, Escape dismisses it.
//   • It disappears the instant a pointer goes down, so it can never sit on top
//     of a drag.
// ─────────────────────────────────────────────────────────────────────────────

const DELAY = 380      // long enough not to flicker as the pointer crosses things
const REARM = 140      // once one tip is up, moving to the next is near-instant

export default function TipHost() {
  const [tip, setTip] = useState(null)   // { text, x, y, place }
  const timer = useRef(null)
  const warm = useRef(false)             // a tip is already showing — go faster
  const cool = useRef(null)

  useEffect(() => {
    const el = document.documentElement
    // A coarse pointer has no hover: showing a tip there means a tap both
    // fires the tip AND does the thing, which reads as a glitch.
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return

    const clear = () => {
      clearTimeout(timer.current)
      setTip(null)
      clearTimeout(cool.current)
      cool.current = setTimeout(() => { warm.current = false }, REARM)
    }

    const show = (target, immediate) => {
      const text = target.getAttribute('data-tip')
      if (!text) return
      clearTimeout(timer.current)
      const run = () => {
        const r = target.getBoundingClientRect()
        // Above by default; below when there is no room above.
        const place = r.top < 90 ? 'below' : 'above'
        setTip({
          text,
          x: Math.round(r.left + r.width / 2),
          y: Math.round(place === 'above' ? r.top - 8 : r.bottom + 8),
          place,
        })
        warm.current = true
      }
      if (immediate || warm.current) run()
      else timer.current = setTimeout(run, DELAY)
    }

    const over = (e) => {
      const t = e.target?.closest?.('[data-tip]')
      if (t) show(t, false)
      else clear()
    }
    const focusIn = (e) => {
      const t = e.target?.closest?.('[data-tip]')
      if (t) show(t, true)
    }
    const key = (e) => { if (e.key === 'Escape') clear() }

    el.addEventListener('pointerover', over)
    el.addEventListener('pointerdown', clear, true)
    el.addEventListener('focusin', focusIn)
    el.addEventListener('focusout', clear)
    window.addEventListener('scroll', clear, true)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', clear)
    return () => {
      clearTimeout(timer.current); clearTimeout(cool.current)
      el.removeEventListener('pointerover', over)
      el.removeEventListener('pointerdown', clear, true)
      el.removeEventListener('focusin', focusIn)
      el.removeEventListener('focusout', clear)
      window.removeEventListener('scroll', clear, true)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', clear)
    }
  }, [])

  if (!tip) return null
  // Clamped so a tip on a bar at the edge of the screen does not hang off it.
  const x = Math.min(Math.max(tip.x, 96), window.innerWidth - 96)
  return (
    <div className={'tip tip-' + tip.place} role="tooltip" style={{ left: x, top: tip.y }}>
      {tip.text}
    </div>
  )
}
