import { useEffect, useState } from 'react'

/* The one toast. Two things it did not do before:
   - stay long enough to be read — a booking confirmation is 120 characters
     and was gone in 2.8 s, so the time now grows with the message;
   - offer Undo. A one-click action (stamp a certificate, toggle a flag) used
     to be final the moment it fired; if the caller passes `undo`, an Undo
     button sits on the toast for as long as it shows, and pressing it runs
     that function and closes the toast. */
export function ToastHost() {
  const [msg, setMsg] = useState('')
  const [undo, setUndo] = useState(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    let t
    const onToast = (e) => {
      const d = e.detail
      const text = typeof d === 'string' ? d : (d?.message || '')
      const fn = typeof d === 'object' && typeof d?.undo === 'function' ? d.undo : null
      setMsg(text); setUndo(() => fn)
      setShow(true)
      clearTimeout(t)
      // ~45 ms a character, never under 2.8 s; an undoable one stays 6 s minimum.
      const ms = Math.max(fn ? 6000 : 2800, text.length * 45)
      t = setTimeout(() => setShow(false), ms)
    }
    window.addEventListener('sgas-toast', onToast)
    return () => { window.removeEventListener('sgas-toast', onToast); clearTimeout(t) }
  }, [])
  return (
    <div className={'toast' + (show ? ' show' : '')} role="status" aria-live="polite">
      {msg}
      {undo && show && (
        <button type="button" className="toast-undo" onClick={() => { setShow(false); const f = undo; setUndo(null); f() }}>Undo</button>
      )}
    </div>
  )
}
