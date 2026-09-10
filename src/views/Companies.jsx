import { useMemo, useState } from 'react'
import { listCompanies, getCompany, setSendToEmployer, importCompanies, updateCompany } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt } from '../lib/util.js'
import { toast } from '../lib/toast.js'

export default function Companies({ go, openCompany = null }) {
  const [selected, setSelected] = useState(openCompany || null)
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
  const [importing, setImporting] = useState(false)
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
    <>
      {importing && <SageImport onDone={() => { setImporting(false); reload() }} onClose={() => setImporting(false)} />}
      <div className="card">
        <h3>🏢 Companies <span className="tag">{rows.length} shown <button className="btn ghost sm" style={{ marginLeft: 10 }} onClick={() => setImporting((v) => !v)} title="Bring the customer list in from a Sage export">⬆ Import from Sage</button></span></h3>
        <div style={{ padding: '14px 18px 0' }}>
          <div className="searchbar">
            <input type="search" placeholder="Search by company, contact, or Sage ref…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
        </div>
        <table>
          <thead><tr>
            <th>Company</th><th>Contact</th><th>Phone</th><th>Email</th><th>Sage ref</th><th>Terms</th>
            <th style={{ textAlign: 'center' }}>To employer</th>
            <th style={{ textAlign: 'center' }}>Delegates</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="empty">No matching companies</td></tr>}
            {rows.map((c) => (
              <tr key={c.company_id} className="clickrow" tabIndex={0} role="button" onClick={() => onOpen(c.company_id)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpen(c.company_id) }}>
                <td><b>{c.name}</b></td>
                <td className="muted">{c.contact_name || '—'}</td>
                <td className="muted"><Reach kind="tel" v={c.phone} /></td>
                <td className="muted"><Reach kind="mailto" v={c.email} /></td>
                <td className="muted">{c.sage_ref || '—'}</td>
                <td className="muted nowrap">{c.payment_terms_days != null ? c.payment_terms_days + ' days' : '—'}</td>
                <td style={{ textAlign: 'center' }}><SendBadge on={c.sendToEmployer} onClick={(e) => toggle(e, c)} /></td>
                <td style={{ textAlign: 'center' }}>{c.delegates}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------------------
   Import from Sage (Jen walkthrough §4).

   The company list only had what the Access import could see, so Jen kept
   hitting "the company isn't in there". Sage has the real customer list. Jen
   exports it (Customers → export, save as CSV — an Excel file saved as CSV is
   fine), drops the file here, checks which column is which, and imports.
   Matched on Sage reference first, then on name; matches are updated (never
   blanked), the rest are created. The later read-only Sage pull will land on
   the same fields, which is why the mapping is to OUR columns, not theirs.
   ------------------------------------------------------------------------- */
const TARGETS = [
  ['name', 'Company name', /^(name|company|customer|account name|a\/c name)$/i, /name|company|customer/i],
  ['sage_ref', 'Sage reference', /^(a\/c|account ref|account|ref|reference|a\/c ref|customer ref)$/i, /a\/c|ref|account/i],
  ['address', 'Address (one column, or the first of several)', /^(address|address ?1|street ?1)$/i, /address/i],
  ['contact_name', 'Contact', /^(contact|contact name)$/i, /contact/i],
  ['phone', 'Phone', /^(telephone|phone|tel|telephone ?1)$/i, /tel|phone/i],
  ['email', 'Email', /^(e-?mail|email ?1|email address)$/i, /mail/i],
  ['payment_terms_days', 'Payment terms (days)', /^(payment due days|settlement due days|terms|payment terms|due days)$/i, /due days|terms/i],
]

// A small CSV reader: quotes, escaped quotes, commas and newlines inside
// quotes, CRLF. Enough for a Sage or Excel export; not a general parser.
function parseCsv(text) {
  const rows = []
  let row = [], cell = '', inQ = false
  const s = String(text || '').replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++ } else inQ = false }
      else cell += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

function guessMap(headers) {
  const m = {}
  for (const [key, , exact, loose] of TARGETS) {
    let idx = headers.findIndex((h) => exact.test(h.trim()))
    if (idx < 0) idx = headers.findIndex((h, i) => loose.test(h) && !Object.values(m).includes(i))
    if (idx >= 0) m[key] = idx
  }
  return m
}

function SageImport({ onDone, onClose }) {
  const [headers, setHeaders] = useState(null)
  const [rows, setRows] = useState([])
  const [map, setMap] = useState({})
  const [addrCols, setAddrCols] = useState([]) // extra address columns to join on
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [fileName, setFileName] = useState('')

  function onFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    const reader = new FileReader()
    reader.onload = () => {
      const all = parseCsv(reader.result)
      if (all.length < 2) { toast('That file has no rows under the heading line'); return }
      const hs = all[0].map((h) => h.trim())
      setHeaders(hs); setRows(all.slice(1)); setResult(null)
      const g = guessMap(hs)
      setMap(g)
      // "Address 2..5" style columns join onto the address automatically.
      const extra = hs.map((h, i) => (/^address ?[2-9]$/i.test(h) || /^(town|city|county|post ?code)$/i.test(h)) && i !== g.address ? i : -1).filter((i) => i >= 0)
      setAddrCols(extra)
    }
    reader.onerror = () => toast('Could not read that file')
    reader.readAsText(f)
  }

  const mapped = useMemo(() => {
    if (!headers) return []
    return rows.map((r) => {
      const get = (k) => (map[k] != null ? (r[map[k]] || '').trim() : '')
      const addr = [get('address'), ...addrCols.map((i) => (r[i] || '').trim())].filter(Boolean).join(', ')
      const terms = get('payment_terms_days').replace(/[^0-9]/g, '')
      return { name: get('name'), sage_ref: get('sage_ref'), address: addr, contact_name: get('contact_name'), phone: get('phone'), email: get('email'), payment_terms_days: terms || null }
    }).filter((x) => x.name)
  }, [headers, rows, map, addrCols])

  async function run() {
    if (map.name == null) return toast('Say which column is the company name')
    if (!mapped.length) return toast('No rows with a company name')
    if (!window.confirm(`Import ${mapped.length} compan${mapped.length === 1 ? 'y' : 'ies'} from ${fileName}?\n\nExisting companies (matched by Sage reference, then name) are updated — nothing you already hold is blanked. New ones are created.`)) return
    setBusy(true)
    try {
      const r = await importCompanies(mapped)
      setResult(r)
      toast(`Imported: ${r.created} new, ${r.updated} updated${r.skipped ? `, ${r.skipped} skipped` : ''}`)
      onDone()
    } catch (e) { toast('Import failed: ' + e.message) } finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <h3>⬆ Import companies from Sage <span className="tag"><button className="btn ghost sm" onClick={onClose}>Close</button></span></h3>
      <div className="body">
        <div className="hint">In Sage, export the <b>customer list</b> and save it as a <b>CSV</b> file (an Excel file saved as CSV is fine). Pick it below, check each column is pointing at the right thing, then Import. Companies already here are matched on Sage reference, then on name, and updated; the rest are created.</div>
        <div className="field">
          <label className="fl">Sage export (.csv)</label>
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
        </div>
        {headers && (
          <>
            <div className="subform">
              <div className="sfh">Which column is which — {rows.length} rows in {fileName}</div>
              <div className="twocol">
                {TARGETS.map(([key, label]) => (
                  <div className="field" key={key}>
                    <label className="fl">{label}</label>
                    <select value={map[key] ?? ''} onChange={(e) => setMap({ ...map, [key]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                      <option value="">— not in this file —</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h || `(column ${i + 1})`}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {addrCols.length > 0 && <div className="muted small">Also joined onto the address: {addrCols.map((i) => headers[i]).join(', ')}.</div>}
            </div>
            <div className="sfh" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--slate)', marginBottom: 6 }}>Preview — first 5 of {mapped.length}</div>
            <table>
              <thead><tr><th>Name</th><th>Sage ref</th><th>Address</th><th>Contact</th><th>Phone</th><th>Email</th><th>Terms</th></tr></thead>
              <tbody>
                {mapped.slice(0, 5).map((x, i) => (
                  <tr key={i}><td><b>{x.name}</b></td><td>{x.sage_ref || '—'}</td><td className="small">{x.address || '—'}</td><td>{x.contact_name || '—'}</td><td>{x.phone || '—'}</td><td>{x.email || '—'}</td><td>{x.payment_terms_days ? x.payment_terms_days + 'd' : '—'}</td></tr>
                ))}
                {mapped.length === 0 && <tr><td colSpan={7} className="empty">No rows have a company name with this mapping</td></tr>}
              </tbody>
            </table>
            <div className="inrow" style={{ marginTop: 12, alignItems: 'center' }}>
              <button className="btn" onClick={run} disabled={busy || !mapped.length}>Import {mapped.length} compan{mapped.length === 1 ? 'y' : 'ies'}</button>
              {result && <span className="muted small">Done: {result.created} created, {result.updated} updated{result.skipped ? `, ${result.skipped} skipped (no name)` : ''}.</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Tap-to-ring / tap-to-email, as on Enquiries and Delegates.
function Reach({ kind, v }) {
  if (!v) return '—'
  const href = kind === 'tel' ? 'tel:' + String(v).replace(/\s+/g, '') : 'mailto:' + v
  return <a href={href} onClick={(e) => e.stopPropagation()}>{v}</a>
}

// Edit the company in place. A wrong phone number or missing payment terms
// used to mean waiting for the next Sage import.
function EditCompany({ company, onSaved, onCancel }) {
  const [f, setF] = useState({
    name: company.name || '', contact_name: company.contact_name || '', phone: company.phone || '', email: company.email || '',
    address: company.address || '', sage_ref: company.sage_ref || '', payment_terms_days: company.payment_terms_days ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function save() {
    if (busy) return
    setBusy(true)
    try { await updateCompany(company.company_id, f); toast('Company saved'); onSaved() }
    catch (e) { toast(e.message) } finally { setBusy(false) }
  }
  const Inp = ({ label, k, type = 'text', ...rest }) => (
    <div className="field"><label className="fl">{label}</label><input type={type} value={f[k]} onChange={set(k)} {...rest} /></div>
  )
  return (
    <form className="subform" onSubmit={(e) => { e.preventDefault(); save() }}>
      <div className="sfh">Edit company</div>
      <div className="twocol">
        <Inp label="Company name" k="name" />
        <Inp label="Contact" k="contact_name" />
        <Inp label="Phone" k="phone" type="tel" />
        <Inp label="Email" k="email" type="email" />
        <Inp label="Sage reference" k="sage_ref" />
        <Inp label="Payment terms (days)" k="payment_terms_days" inputMode="numeric" placeholder="e.g. 30" />
      </div>
      <Inp label="Address" k="address" />
      <div className="inrow">
        <button type="submit" className="btn sm" disabled={busy}>Save changes</button>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function CompanyDetail({ companyId, back, go }) {
  const { data, loading, reload } = useData(() => getCompany(companyId), [companyId])
  const [editing, setEditing] = useState(false)
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
      <div style={{ marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn ghost sm" onClick={back}>← All companies</button>
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn ghost sm" onClick={() => setEditing((v) => !v)}>✎ Edit details</button>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>🏢 {company.name} <span className="tag">{delegates.length} delegate{delegates.length !== 1 ? 's' : ''}</span></h3>
        <div className="body">
          {editing && <EditCompany company={company} onSaved={() => { setEditing(false); reload() }} onCancel={() => setEditing(false)} />}
          <div className="twocol">
            <Field label="Contact" value={company.contact_name} />
            <Field label="Phone" value={<Reach kind="tel" v={company.phone} />} />
            <Field label="Email" value={<Reach kind="mailto" v={company.email} />} />
            <Field label="Sage reference" value={company.sage_ref} />
            <Field label="Address" value={company.address} />
            <Field label="Payment terms" value={company.payment_terms_days != null ? company.payment_terms_days + ' days' : null} />
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
              <tr key={d.client_id} className={go ? 'clickrow' : ''} tabIndex={go ? 0 : undefined} role={go ? 'button' : undefined}
                onClick={() => go && go('delegates', d.client_id)} onKeyDown={(e) => { if (go && e.key === 'Enter') go('delegates', d.client_id) }}>
                <td><b>{d.forename} {d.surname}</b></td>
                <td className="muted">{d.ni_number || '—'}</td>
                <td className="muted"><Reach kind="tel" v={d.mobile} /></td>
                <td className="muted"><Reach kind="mailto" v={d.email} /></td>
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
