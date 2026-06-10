import { listCourses } from '../lib/api.js'
import { useData } from '../lib/hooks.js'

export default function Courses() {
  const { data, loading } = useData(listCourses)
  if (loading || !data) return <div className="loading">Loading courses…</div>
  return (
    <div className="card">
      <h3>📚 Courses / qualification pools <span className="tag">{data.length} pools</span></h3>
      <table>
        <thead><tr><th>Course pool</th><th>Scheme key</th><th style={{ textAlign: 'center' }}>Qualifications</th><th style={{ textAlign: 'center' }}>Sessions</th><th style={{ textAlign: 'center' }}>Awaiting</th></tr></thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.course_id}>
              <td><b>{c.name}</b></td>
              <td><span className="b scheme">{c.scheme}</span></td>
              <td style={{ textAlign: 'center' }}>{c.qualifications}</td>
              <td style={{ textAlign: 'center' }}>{c.sessions}</td>
              <td style={{ textAlign: 'center' }}>{c.awaiting || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
