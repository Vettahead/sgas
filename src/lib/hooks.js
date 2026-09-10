import { useCallback, useEffect, useState } from 'react'
import { toast } from './toast.js'

// Minimal async-data hook: runs loader on mount (and when deps change),
// exposes { data, loading, error, reload }.
//
// A loader that FAILS now says so. Before, a lapsed sign-in or a refused
// query left `data` null for ever and the screen sat on "Loading…" — or, where
// the list function swallowed the error, showed "No companies", which reads
// as the data having gone. Now the message reaches the person, once, with
// what to do about it, and `error` is there for a screen that wants to show
// a retry button of its own.
export function useData(loader, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.resolve(loader())
      .then((d) => { if (alive) { setData(d); setError(null) } })
      .catch((e) => {
        if (!alive) return
        setError(e)
        const why = e?.message || String(e)
        toast(/JWT|token|Not authorized|401|403/i.test(why)
          ? 'Could not load — your sign-in may have lapsed. Sign out and back in.'
          : 'Could not load: ' + why)
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, loading, error, reload }
}
