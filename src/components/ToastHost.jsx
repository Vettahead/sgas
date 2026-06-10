import { useEffect, useState } from 'react'

export function ToastHost() {
  const [msg, setMsg] = useState('')
  const [show, setShow] = useState(false)
  useEffect(() => {
    let t
    const onToast = (e) => {
      setMsg(e.detail)
      setShow(true)
      clearTimeout(t)
      t = setTimeout(() => setShow(false), 2800)
    }
    window.addEventListener('sgas-toast', onToast)
    return () => { window.removeEventListener('sgas-toast', onToast); clearTimeout(t) }
  }, [])
  return <div className={'toast' + (show ? ' show' : '')}>{msg}</div>
}
