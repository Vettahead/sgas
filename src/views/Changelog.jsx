import { RELEASES, VERSION, BUILD, COMMIT } from '../lib/version.js'

// ─────────────────────────────────────────────────────────────────────────────
// CHANGELOG — what changed, release by release. Admins only.
// Pure data: everything here comes from RELEASES in src/lib/version.js.
// ─────────────────────────────────────────────────────────────────────────────

export default function Changelog() {
  const current = RELEASES[0]
  return (
    <div className="col">
      <div className="card">
        <div className="cl-head">
          <div>
            <div className="cl-now">v{VERSION}</div>
            <div className="cl-sub">
              Build {BUILD} · released {current.date}
              {COMMIT !== 'dev' && <> · <span className="cl-commit" title="The exact push that is live">{COMMIT}</span></>}
            </div>
          </div>
          <div className="cl-count">
            <b>{RELEASES.length}</b>
            <span>releases</span>
          </div>
        </div>
        <p className="cl-note">
          The <b>build number</b> counts how many times the system has been pushed live.
          The version number goes up whenever a new feature lands. The code beside it is
          the exact push running right now — handy when checking whether a change has
          reached the site yet.
        </p>
      </div>

      {RELEASES.map((r) => (
        <div className="card cl-rel" key={r.v}>
          <div className="cl-rel-head">
            <span className="cl-ver">v{r.v}</span>
            <span className="cl-title">{r.title}</span>
            <span className="cl-meta">build {r.build} · {r.date}</span>
          </div>
          <ul className="cl-notes">
            {r.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}
