import { useState, useEffect, useRef } from 'react'

/* The bell in the top bar, next to the "?". Built from the same pieces as
   PageHelp — same button, same popover — so it reads as part of the same
   control strip rather than a third style of thing.

   What it shows: every enquiry message that @mentions you and that you have
   not yet opened. Click one and you are taken to that enquiry, which marks it
   seen; the count on the bell and on the Enquiries menu item drop together.
   `mentions` comes from App, which polls for it — this component only draws. */

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

export default function Notifications({ mentions = [], onOpen }) {
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

  const n = mentions.length

  return (
    <div className="pagehelp" ref={ref}>
      <button
        className={'pagehelp-btn bell' + (open ? ' on' : '') + (n ? ' has' : '')}
        onClick={() => setOpen((o) => !o)}
        title={n ? `${n} enquir${n === 1 ? 'y' : 'ies'} waiting for you` : 'Nothing waiting for you'}
        aria-label="Notifications"
      >
        🔔{n > 0 && <span className="bell-n">{n > 9 ? '9+' : n}</span>}
      </button>

      {open && (
        <div className="pagehelp-pop" role="dialog" aria-label="Notifications">
          <div className="pagehelp-head">
            <strong>{n ? `${n} waiting for you` : 'Nothing waiting'}</strong>
            <button className="pagehelp-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>
          <div className="pagehelp-body" style={{ padding: 0 }}>
            {n === 0 && <div className="empty">When somebody @mentions you on an enquiry, it appears here.</div>}
            {mentions.map((m) => (
              <button key={m.messageId} type="button" className="bell-item" onClick={() => { setOpen(false); onOpen?.(m) }}>
                <div className="bell-t"><b>{m.author}</b> on <b>{m.inquiryName || 'an enquiry'}</b> <span className="muted small">{when(m.createdAt)}</span></div>
                <div className="bell-b">{m.body.length > 140 ? m.body.slice(0, 140) + '…' : m.body}</div>
              </button>
            ))}
          </div>
          <div className="pagehelp-foot">
            <span className="muted small">Opening an enquiry clears its notifications.</span>
          </div>
        </div>
      )}
    </div>
  )
}
