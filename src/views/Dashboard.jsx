import { getDashboard } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt } from '../lib/util.js'
import { toast } from '../lib/toast.js'

export default function Dashboard({ go }) {
  const { data, loading } = useData(getDashboard)
  if (loading || !data) return <div className="loading">Loading dashboard…</div>
  const { renewals, chase, counts, mlps } = data

  return (
    <>
      <div className="row c3" style={{ marginBottom: 18 }}>
        <div className="card"><div className="body stat amber"><div className="n">{counts.renew}</div><div className="l">ACS qualifications expiring within 90 days</div></div></div>
        <div className="card"><div className="body stat brand"><div className="n">{counts.sessions}</div><div className="l">Scheduled sessions</div></div></div>
        <div className="card"><div className="body stat green"><div className="n">{counts.outstanding}</div><div className="l">Bookings with payment outstanding</div></div></div>
      </div>
      <div className="row c2">
        <div className="card">
          <h3>🔔 Renewal engine — expiring soon <span className="tag">nightly scan</span></h3>
          <table>
            <thead><tr><th>Delegate</th><th>Qualification</th><th>Expires</th><th>In</th><th></th></tr></thead>
            <tbody>
              {renewals.length === 0 && <tr><td colSpan={5} className="empty">Nothing expiring in the window</td></tr>}
              {renewals.map((r, i) => (
                <tr key={i}>
                  <td><a className="linkbtn" onClick={() => go('delegates', r.clientId)}>{r.name}</a></td>
                  <td><b>{r.code}</b> <span className="muted small">{r.desc}</span></td>
                  <td className="nowrap">{fmt(r.expiry)}</td>
                  <td><span className="b due">{r.days} days</span></td>
                  <td><button className="btn ghost sm" onClick={() => toast(`Renewal email queued to ${r.name}`)}>Email</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="banner">Produced by the nightly SQL scan (Flow 2 in sgas_queries.sql). Each becomes an automatic "due — rebook now" email.</div>
        </div>
        <div className="card">
          <h3>💷 Outstanding — to chase</h3>
          <table>
            <thead><tr><th>Delegate</th><th>Payer</th><th>Flags</th></tr></thead>
            <tbody>
              {chase.length === 0 && <tr><td colSpan={3} className="empty">All clear</td></tr>}
              {chase.map((c, i) => (
                <tr key={i}><td>{c.name}</td><td>{c.payer}</td><td><span className="b due">{c.flags.join(', ')}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3>🎓 Managed Learning Programmes <span className="tag">{(mlps || []).length} on programme</span></h3>
        <table>
          <thead><tr><th>Delegate</th><th>Programme</th><th>Progress</th><th>Status</th></tr></thead>
          <tbody>
            {(!mlps || mlps.length === 0) && <tr><td colSpan={4} className="empty">No active MLPs</td></tr>}
            {(mlps || []).map((m) => (
              <tr key={m.mlpId}>
                <td><a className="linkbtn" onClick={() => go('delegates', m.clientId)}>{m.name}</a></td>
                <td className="muted small">{m.label}</td>
                <td>
                  <div className="mlp-bar"><span style={{ width: (m.total ? Math.round((m.done / m.total) * 100) : 0) + '%' }}></span></div>
                  <span className="muted small">{m.done} of {m.total} courses</span>
                </td>
                <td>{m.complete ? <span className="b pass">Complete</span> : <span className="b pend">{m.total - m.done} left</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="banner">A course knocks off automatically once the delegate passes it. New entrants build their portfolio across several visits.</div>
      </div>
    </>
  )
}
