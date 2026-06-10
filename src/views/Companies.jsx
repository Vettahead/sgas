import { useMemo, useState } from 'react'
import { listCompanies, getCompany, setSendToEmployer } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt } from '../lib/util.js'
import { toast } from '../lib/toast.js'

export default function Companies({ go }) {
  const [selected, setSelected] = useState(null)
  if (selected) return <CompanyDetail companyId={selected} back={() => setSelected(null)} go={go} />
  return <CompanyList onOpen={setSelected} />
}

function SendBadge({ on, onClick }) {
  return (
    <button
      className={'b ' + (on ? 'pass' : 'fail')}
      style={{ cursor: 'pointer', border: 'none' }}
      onClick={onClick}
      title="Toggle whether certificates / results are sent to this employer"
    >
      {on ? 'Send' : 'No'}
    </button>
  )
}

function CompanyList({ onOpen }) {
  const { data, loading, reload } = useData(listCompanies)
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    if (!data) return []
    const s = q.trim().toLowerCase()
    if (!s) return data
    return data.filter((c) =>
      c.name.toLowerCase().includes(s) ||
      (c.contact_name || '').toLowerCase().includes(s) ||
      (c.sage_ref || '').toLowerCase().includes(s)
    )
  }, [data, q])

  async function toggle(e, c) {
    e.stopPropagation()
    const next = !c.sendToEmployer
    await setSendToEmployer(c.company_id, next)
    toast(`${c.name}: certificates ${next ? 'WILL' : 'will NOT'} be sent to employer`)
    reload()
  }

  if (loading || !data) return <div className="loading">Loading companies…</div>

  return (
    <div className="card">
      <h3>🏢 Companies <span className="tag">{rows.length} shown</span></h3>
      <div style={{ padding: '14px 18px 0' }}>
        <div className="searchbar">
          <input type="search" placeholder="Search by company, contact, or Sage ref…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Company</th><th>Contact</th><th>Phone</th><th>Email</th><th>Sage ref</th>
          <th style={{ textAlign: 'center' }}>To employer</th>
          <th style={{ textAlign: 'center' }}>Delegates</th>
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className="empty">No matching companies</td></tr>}
          {rows.map((c) => (
            <tr key={c.company_id} className="clickrow" onClick={() => onOpen(c.company_id)}>
              <td><b>{c.name}</b></td>
              <td className="muted">{c.contact_name || '—'}</td>
              <td className="muted">{c.phone || '—'}</td>
              <td className="muted">{c.email || '—'}</td>
              <td className="muted">{c.sage_ref || '—'}</td>
              <td style={{ textAlign: 'center' }}><SendBadge on={c.sendToEmployer} onClick={(e) => toggle(e, c)} /></td>
              <td style={{ textAlign: 'center' }}>{c.delegates}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CompanyDetail({ companyId, back, go }) {
  const { data, loading, reload } = useData(() => getCompany(companyId), [companyId])
  if (loading || !data) return <div className="loading">Loading company…</div>
  const { company, delegates } = data

  async function toggleSend() {
    const next = !company.sendToEmployer
    await setSendToEmployer(company.company_id, next)
    toast(`${company.name}: certificates ${next ? 'WILL' : 'will NOT'} be sent to employer`)
    reload()
  }

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <button className="btn ghost sm" onClick={back}>← All companies</button>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>🏢 {company.name} <span className="tag">{delegates.length} delegate{delegates.length !== 1 ? 's' : ''}</span></h3>
        <div className="body">
          <div className="twocol">
            <Field label="Contact" value={company.contact_name} />
            <Field label="Phone" value={company.phone} />
            <Field label="Email" value={company.email} />
            <Field label="Sage reference" value={company.sage_ref} />
            <Field label="Address" value={company.address} />
            <div className="field">
              <label className="fl">Send certificates to employer</label>
              <div style={{ padding: '7px 0' }}>
                <SendBadge on={company.sendToEmployer} onClick={toggleSend} />
                <span className="muted small" style={{ marginLeft: 10 }}>
                  {company.sendToEmployer
                    ? 'Results and certificates are sent to the employer contact.'
                    : 'Nothing is sent to the employer — delegates keep their own copies.'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>👥 Who works here <span className="tag">{delegates.length} delegate{delegates.length !== 1 ? 's' : ''}</span></h3>
        <table>
          <thead><tr>
            <th>Name</th><th>NI number</th><th>Mobile</th><th>Email</th>
            <th style={{ textAlign: 'center' }}>Bookings</th><th>Last booking</th>
          </tr></thead>
          <tbody>
            {delegates.length === 0 && <tr><td colSpan={6} className="empty">No delegates on record for this employer.</td></tr>}
            {delegates.map((d) => (
              <tr key={d.client_id} className={go ? 'clickrow' : ''} onClick={() => go && go('delegates', d.client_id)}>
                <td><b>{d.forename} {d.surname}</b></td>
                <td className="muted">{d.ni_number || '—'}</td>
                <td className="muted">{d.mobile || '—'}</td>
                <td className="muted">{d.email || '—'}</td>
                <td style={{ textAlign: 'center' }}>{d.bookings}</td>
                <td className="muted nowrap">{d.lastBooking ? fmt(d.lastBooking) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Field({ label, value }) {
  return (
    <div className="field">
      <label className="fl">{label}</label>
      <div style={{ padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, background: '#f7f9fc' }}>{value || '—'}</div>
    </div>
  )
}
