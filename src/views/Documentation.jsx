import { useMemo, useState } from 'react'
import { listDocumentation, setCertStage } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt, todayISO } from '../lib/util.js'
import { toast } from '../lib/toast.js'

/* ---------------------------------------------------------------------------
   Documentation — where is the certificate?

   After an assessment is passed, the paperwork goes to the awarding body, for
   most courses comes back to SGAS, and is then sent on to the client. Nothing
   recorded any of that: Jen had a pile of certificates on the desk and people
   ringing to chase, and Simon knew what had gone because he had posted it.

   Each passed booking moves through up to three dates:
     sent to the awarding body  →  received back  →  sent to the client
   A course whose certificates go direct to the delegate (Courses → "comes
   back to us" unticked) only has the first; sending it is the end.
   One click stamps today; the date can be changed or cleared. Once "sent to
   client" is stamped the row leaves this list and lives on the delegate's
   record.
   ------------------------------------------------------------------------- */

const TABS = [
  ['tosend', 'To send to awarding body'],
  ['awaiting', 'Awaiting return'],
  ['toclient', 'To send to client'],
]

// Which stage a row is waiting at.
function stageOf(d) {
  if (!d.sent) return 'tosend'
  if (!d.certReturns) return 'done' // direct-to-delegate: sending it was the end
  if (!d.received) return 'awaiting'
  return 'toclient'
}

export default function Documentation({ go }) {
  const { data, loading, reload } = useData(listDocumentation)
  const [tab, setTab] = useState('tosend')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(null)

  const rows = useMemo(() => {
    const all = (data || []).map((d) => ({ ...d, stage: stageOf(d) })).filter((d) => d.stage !== 'done')
    const s = q.trim().toLowerCase()
    return s ? all.filter((d) => d.name.toLowerCase().includes(s) || (d.employer || '').toLowerCase().includes(s) || d.course.toLowerCase().includes(s)) : all
  }, [data, q])
  const counts = useMemo(() => {
    const c = { tosend: 0, awaiting: 0, toclient: 0 }
    for (const d of rows) c[d.stage]++
    return c
  }, [rows])
  const shown = rows.filter((d) => d.stage === tab)

  // One click stamps it — and one click on Undo (in the message at the bottom)
  // puts it back, instead of hunting the row on another tab to clear it.
  async function stamp(d, stage, date = todayISO()) {
    setBusy(d.bookingId)
    const prev = stage === 'sent' ? d.sent : stage === 'received' ? d.received : d.client
    try {
      await setCertStage(d.bookingId, stage, date)
      const what = stage === 'sent' ? 'sent to the awarding body' : stage === 'received' ? 'received back' : 'sent to the client'
      toast(`${d.name} · ${d.course}: ${what}${date ? ' ' + fmt(date) : ' — cleared'}`,
        { undo: async () => { try { await setCertStage(d.bookingId, stage, prev || null); reload() } catch (e) { toast(e.message) } } })
      reload()
    } catch (e) { toast(e.message) } finally { setBusy(null) }
  }

  if (loading || !data) return <div className="loading">Loading…</div>

  return (
    <>
      <div className="hint">
        Every <b>passed</b> assessment lands here until its certificate has gone to the client. One click stamps today's date; click the date to change it, or clear it with ✕.
        Courses whose certificates go <b>direct</b> from the awarding body to the delegate are marked so in Courses — those only need "sent", then they are done.
      </div>
      <div className="card">
        <h3>📄 Documentation <span className="tag">{rows.length} in progress</span></h3>
        <div className="body" style={{ paddingBottom: 8 }}>
          <div className="inq-courses" style={{ margin: 0 }}>
            {TABS.map(([k, l]) => (
              <button type="button" key={k} className={'inq-chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l} <span className="muted">{counts[k]}</span></button>
            ))}
            <input type="search" placeholder="Find a delegate, employer or course…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginLeft: 'auto', maxWidth: 300 }} />
          </div>
        </div>
        <table>
          <thead><tr>
            <th>Delegate</th><th>Course</th><th>Passed</th>
            <th>Sent to awarding body</th><th>Received back</th><th>Sent to client</th>
          </tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="empty">{q ? 'Nothing matches' : tab === 'tosend' ? 'Nothing waiting to go — every pass has been sent off' : tab === 'awaiting' ? 'Nothing out with an awarding body' : 'Nothing waiting to go to a client'}</td></tr>}
            {shown.map((d) => (
              <tr key={d.bookingId}>
                <td>
                  <button className="dn-link" onClick={() => go && go('delegates', d.clientId)}>{d.name}</button>
                  <div className="muted small">{d.employer || 'sole trader'}{d.employer && d.sendToEmployer ? ' · send to employer' : ''}</div>
                </td>
                <td><b>{d.course}</b><div className="muted small nowrap">{d.start ? fmt(d.start) : '—'}{d.end && d.end !== d.start ? ' – ' + fmt(d.end) : ''}{!d.certReturns && <span className="b scheme" style={{ marginLeft: 6 }}>direct</span>}</div></td>
                <td className="small">{d.codes.length ? d.codes.join(', ') : <span className="muted">passed</span>}</td>
                <DateCell d={d} stage="sent" value={d.sent} busy={busy} onStamp={stamp} />
                {d.certReturns
                  ? <DateCell d={d} stage="received" value={d.received} busy={busy} onStamp={stamp} disabled={!d.sent} />
                  : <td className="muted small">goes direct</td>}
                {d.certReturns
                  ? <DateCell d={d} stage="client" value={d.client} busy={busy} onStamp={stamp} disabled={!d.received} />
                  : <td className="muted small">—</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="banner">Stamping "sent to client" takes the row off this list — it stays on the delegate's record with all three dates, which is the answer to "has my certificate gone?" on the phone.</div>
      </div>
    </>
  )
}

// One stage: a button to stamp today, or the stamped date (editable) with a clear.
function DateCell({ d, stage, value, busy, onStamp, disabled = false }) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value || '')
  if (!value) {
    return (
      <td className="nowrap">
        <button className="btn ghost sm" disabled={disabled || busy === d.bookingId} onClick={() => onStamp(d, stage)} title={disabled ? 'Do the previous step first' : 'Stamp today'}>
          {stage === 'sent' ? '📮 Sent today' : stage === 'received' ? '📥 Received today' : '✉ Sent to client today'}
        </button>
      </td>
    )
  }
  return (
    <td className="nowrap">
      {editing ? (
        <span className="inrow" style={{ alignItems: 'center' }}>
          <input type="date" value={v} onChange={(e) => setV(e.target.value)} style={{ width: 150 }} />
          <button className="btn sm" onClick={() => { setEditing(false); if (v && v !== value) onStamp(d, stage, v) }}>OK</button>
          <button className="btn ghost sm" onClick={() => { setEditing(false); setV(value) }}>Cancel</button>
        </span>
      ) : (
        <>
          <button className="dn-link" onClick={() => { setV(value); setEditing(true) }} title="Change the date">{fmt(value)}</button>
          {' '}<button className="linkbtn" onClick={() => { if (window.confirm('Clear this date?')) onStamp(d, stage, null) }} title="Clear">✕</button>
        </>
      )}
    </td>
  )
}
