import { listCompanies } from '../lib/api.js'
import { useData } from '../lib/hooks.js'

export default function Companies() {
  const { data, loading } = useData(listCompanies)
  if (loading || !data) return <div className="loading">Loading companies…</div>
  return (
    <div className="card">
      <h3>🏢 Companies <span className="tag">{data.length} companies</span></h3>
      <table>
        <thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th>Email</th><th>Sage ref</th><th style={{ textAlign: 'center' }}>Delegates</th></tr></thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.company_id}>
              <td><b>{c.name}</b></td>
              <td className="muted">{c.contact_name || '—'}</td>
              <td className="muted">{c.phone || '—'}</td>
              <td className="muted">{c.email || '—'}</td>
              <td className="muted">{c.sage_ref || '—'}</td>
              <td style={{ textAlign: 'center' }}>{c.delegates}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
