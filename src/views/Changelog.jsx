import { RELEASES, VERSION, BUILD, COMMIT } from '../lib/version.js'

// ─────────────────────────────────────────────────────────────────────────────
// CHANGELOG — what changed, release by release. Admins only.
// Pure data: everything comes from RELEASES in src/lib/version.js.
// Built from the app's existing card / stat / .b pieces — no bespoke styles.
// ─────────────────────────────────────────────────────────────────────────────

export default function Changelog() {
  const current = RELEASES[0]
  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3>📝 Current version <span className="tag">released {current.date}</span></h3>
        <div className="body">
          <div className="stat-row">
            <div className="stat brand"><div className="n">v{VERSION}</div><div className="l">Version</div></div>
            <div className="stat"><div className="n">{BUILD}</div><div className="l">Times pushed live</div></div>
            <div className="stat"><div className="n">{RELEASES.length}</div><div className="l">Releases</div></div>
          </div>
          <div className="banner">
            The <b>version</b> goes up whenever a new feature lands; <b>times pushed live</b> counts every
            update sent to the site.
            {COMMIT !== 'dev'
              ? <> The update running right now is <span className="pill">{COMMIT}</span> — handy for checking whether a change has reached the site yet.</>
              : <> Running locally, so there is no published update to name.</>}
          </div>
        </div>
      </div>

      {RELEASES.map((r) => (
        <div className="card" style={{ marginBottom: 14 }} key={r.v}>
          <h3>
            <span className="b scheme">v{r.v}</span> {r.title}
            <span className="tag">{r.date}</span>
          </h3>
          <div className="body">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {r.notes.map((n, i) => <li key={i} style={{ marginBottom: 4 }}>{n}</li>)}
            </ul>
          </div>
        </div>
      ))}
    </>
  )
}
