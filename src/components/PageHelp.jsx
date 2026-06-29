import { useState, useEffect, useRef } from 'react'
import { SECTIONS, VIEW_HELP, Answer } from '../views/Help.jsx'

// A "?" button for the top bar. Opens a popover showing the Help section(s)
// relevant to the page you're on, so staff get the right guidance in place
// without having to go to the full Help & FAQ. Same content, one source.
export default function PageHelp({ view, onOpenFaq }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const ids = VIEW_HELP[view] || []
  const secs = ids.map((id) => SECTIONS.find((s) => s.id === id)).filter(Boolean)
  if (!secs.length) return null   // e.g. the Help page itself — no need for the button

  return (
    <div className="pagehelp" ref={ref}>
      <button
        className={'pagehelp-btn' + (open ? ' on' : '')}
        onClick={() => setOpen((o) => !o)}
        title="Help for this page"
        aria-label="Help for this page"
      >?</button>

      {open && (
        <div className="pagehelp-pop" role="dialog" aria-label="Help for this page">
          <div className="pagehelp-head">
            <strong>Help for this page</strong>
            <button className="pagehelp-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>
          <div className="pagehelp-body">
            {secs.map((s) => (
              <div className="pagehelp-sec" key={s.id}>
                <div className="pagehelp-sec-t">{s.icon} {s.title}</div>
                {s.items.map((it, i) => (
                  <div className="pagehelp-qa" key={i}>
                    <div className="pagehelp-q">{it.q}</div>
                    <div className="pagehelp-a"><Answer lines={it.a} /></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="pagehelp-foot">
            <button className="pagehelp-link" onClick={() => { setOpen(false); onOpenFaq && onOpenFaq() }}>
              Open the full Help &amp; FAQ →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
