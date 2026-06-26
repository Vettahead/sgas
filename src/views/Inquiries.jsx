import { useState } from 'react'
import { listInquiries, createInquiry, setInquiryStatus, listCourses } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt } from '../lib/util.js'
import { toast } from '../lib/toast.js'

const EMPTY = { name: '', email: '', mobile: '', prefFrom: '', prefTo: '', notes: '' }

// Rough "how long ago" for the open list.
const ago = (iso) => {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso)) / 60000)
  if (mins < 60) return `${Math.max(mins, 0)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export default function Inquiries({ go }) {
  const { data: inquiries, loading, reload } = useData(listInquiries)
  const { data: courses } = useData(listCourses)
  const [f, setF] = useState(EMPTY)
  const [picked, setPicked] = useState(() => new Set())

  function toggleCourse(name) {
    setPicked((p) => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  async function save() {
    if (!f.name.trim()) return toast('Add a name (first name is fine)')
    if (!f.email.trim() && !f.mobile.trim()) return toast('Add an email or a mobile so we can follow up')
    await createInquiry({
      name: f.name.trim(), email: f.email.trim(), mobile: f.mobile.trim(),
      courses: [...picked].join(', '), prefFrom: f.prefFrom || null, prefTo: f.prefTo || null, notes: f.notes.trim(),
    })
    toast(`Inquiry logged: ${f.name.trim()}`)
    setF(EMPTY); setPicked(new Set()); reload()
  }

  async function convert(q) {
    await setInquiryStatus(q.inquiryId, 'converted')
    toast(`Converting ${q.name} → Book a Delegate`)
    go('book', { name: q.name, email: q.email, mobile: q.mobile })
  }

  async function close(q) {
    await setInquiryStatus(q.inquiryId, 'closed')
    toast(`Inquiry closed: ${q.name}`)
    reload()
  }

  return (
    <div className="row c2">
      <div className="card">
        <h3>① Log an inquiry <span className="tag">quick capture</span></h3>
        <div className="body">
          <div className="hint">Anyone on reception can grab a lead in seconds — a name, a way to reach them, and what they want. Fill in what you have; the rest can wait.</div>
          <div className="field">
            <label className="fl">Name</label>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="First name is fine" autoFocus />
          </div>
          <div className="twocol">
            <div className="field"><label className="fl">Email</label><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div className="field"><label className="fl">Mobile</label><input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></div>
          </div>
          <div className="small muted" style={{ marginTop: -8, marginBottom: 12 }}>At least one of email / mobile.</div>

          <label className="fl">Courses they're interested in</label>
          <div className="cats" style={{ marginBottom: 14 }}>
            {(courses || []).map((c) => (
              <div key={c.course_id} className={'cat' + (picked.has(c.name) ? ' on' : '')} onClick={() => toggleCourse(c.name)}>
                <input type="checkbox" readOnly checked={picked.has(c.name)} />
                <span><span className="code">{c.name}</span></span>
              </div>
            ))}
          </div>

          <div className="twocol">
            <div className="field"><label className="fl">Preferred from (optional)</label><input type="date" value={f.prefFrom} onChange={(e) => setF({ ...f, prefFrom: e.target.value })} /></div>
            <div className="field"><label className="fl">Preferred to (optional)</label><input type="date" value={f.prefTo} onChange={(e) => setF({ ...f, prefTo: e.target.value })} /></div>
          </div>
          <div className="field">
            <label className="fl">Notes (optional)</label>
            <textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Anything they said…" />
          </div>
          <button className="btn" onClick={save}>Log inquiry</button>
        </div>
      </div>

      <div className="card">
        <h3>② Open inquiries <span className="tag">{(inquiries || []).length} to follow up</span></h3>
        <table>
          <thead><tr><th>Name</th><th>Contact</th><th>Wants</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="empty">Loading…</td></tr>}
            {!loading && (!inquiries || inquiries.length === 0) && <tr><td colSpan={4} className="empty">No open inquiries — all followed up</td></tr>}
            {(inquiries || []).map((q) => (
              <tr key={q.inquiryId}>
                <td><b>{q.name}</b><div className="muted small">{ago(q.createdAt)}</div></td>
                <td className="small">{q.email && <div>{q.email}</div>}{q.mobile && <div>{q.mobile}</div>}{!q.email && !q.mobile && <span className="muted">—</span>}</td>
                <td className="small">
                  {q.courses ? q.courses : <span className="muted">—</span>}
                  {(q.prefFrom || q.prefTo) && <div className="muted">📅 {q.prefFrom ? fmt(q.prefFrom) : '…'} – {q.prefTo ? fmt(q.prefTo) : '…'}</div>}
                  {q.notes && <div className="muted" style={{ marginTop: 2 }}>{q.notes}</div>}
                </td>
                <td className="nowrap">
                  <button className="btn ghost sm" onClick={() => convert(q)} title="Open Book a Delegate pre-filled from this inquiry">→ Convert</button>
                  <button className="btn ghost sm" onClick={() => close(q)} title="Close without booking">Close</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="banner"><b>Convert</b> opens Book a Delegate with the name and contact pre-filled. <b>Close</b> removes it from the list (kept as history).</div>
      </div>
    </div>
  )
}
