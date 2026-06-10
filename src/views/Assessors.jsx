import { listAssessors } from '../lib/api.js'
import { useData } from '../lib/hooks.js'

export default function Assessors() {
  const { data, loading } = useData(listAssessors)
  if (loading || !data) return <div className="loading">Loading assessors…</div>
  return (
    <div className="card">
      <h3>🎓 Assessors <span className="tag">{data.length} assessors</span></h3>
      <div className="hint" style={{ margin: '14px 18px' }}>Scheduling keys on the assessor; the room rides along. Each assessor maps to one Teamup sub-calendar.</div>
      <table>
        <thead><tr><th>Assessor</th><th>Room</th><th>Teamup sub-calendar</th><th style={{ textAlign: 'center' }}>Sessions</th></tr></thead>
        <tbody>
          {data.map((a) => (
            <tr key={a.assessor_id}>
              <td><b><span className="av" style={{ width: 12, height: 12, borderRadius: '50%', background: a.color, marginRight: 7 }}></span>{a.name}</b></td>
              <td>{a.assigned_room || '—'}</td>
              <td className="muted small">sub-cal: {a.name.replace(/\s+/g, '-').toLowerCase()}</td>
              <td style={{ textAlign: 'center' }}>{a.sessions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
