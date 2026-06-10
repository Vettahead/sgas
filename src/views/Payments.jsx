import { useState } from 'react'
import { listPayments, setFlag, chaseBooking, setSageRef, getChaseLog, setIgasEvidence } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt, resultClass, delegateStatus, dispLabel, daysUntil } from '../lib/util.js'
import { toast } from '../lib/toast.js'

// Outstanding items that can be chased. key -> column handled in api.setFlag.
const ITEMS = [
  ['cert', 'Certification'],
  ['photo', 'Passport photo'],
  ['igas', 'IGAS'],
  ['pay', 'Payment'],
]

export default function Payments() {
  const { data, loading, reload } = useData(listPayments)
  const [openLog, setOpenLog] = useState(null)
  if (loading || !data) return <div className="loading">Loading bookings…</div>

  async function toggle(b, key) {
    await setFlag(b.bookingId, key, !b[key])
    reload()
  }
  async function saveSage(b, ref) {
    if (ref === (b.sageRef || '')) return
    await setSageRef(b.bookingId, ref)
    reload()
  }
  async function saveIgas(b, date) {
    await setIgasEvidence(b.bookingId, date || null)
    reload()
  }
  function outstandingItems(b) {
    return ITEMS.filter(([k]) => b[k]).map(([, label]) => label)
  }
  async function chase(b) {
    const items = outstandingItems(b)
    if (!items.length) return toast('Nothing outstanding to chase')
    await chaseBooking(b.bookingId, items.join(', '))
    // Booking id doubles as the "course id" reception types into their email search.
    toast(`Chase #${b.bookingId} → ${b.payer}: ${items.join(', ')}`)
    reload()
  }

  return (
    <>
      <div className="hint">The <b>final stage</b>: after a course runs, flag what's <b>outstanding</b> (default No) and chase the <b>company</b>. Each chase is logged with the booking id — that id goes in the email so reception can search their sent mail. No money lives here — that's Sage.</div>
      <div className="card">
        <h3>💷 Bookings — invoicing &amp; outstanding</h3>
        <table>
          <thead>
            <tr>
              <th>Booking</th><th>Delegate</th><th>Invoiced to</th><th>Result</th>
              <th style={{ textAlign: 'center' }}>Cert</th>
              <th style={{ textAlign: 'center' }}>Photo</th>
              <th style={{ textAlign: 'center' }}>IGAS</th>
              <th style={{ textAlign: 'center' }}>Payment</th>
              <th>Sage ref</th><th>Last chased</th><th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((b) => {
              const items = outstandingItems(b)
              const isNoShow = b.disposition === 'NO_SHOW'
              return (
                <Row key={b.bookingId} b={b} items={items} isNoShow={isNoShow}
                  toggle={toggle} chase={chase} saveSage={saveSage} saveIgas={saveIgas}
                  open={openLog === b.bookingId} onToggleLog={() => setOpenLog(openLog === b.bookingId ? null : b.bookingId)} />
              )
            })}
          </tbody>
        </table>
        <div className="banner">Flag an item to mark it outstanding (defaults to No). "Chase" emails the company's accounts contact, stamps the date, and records the items in the chase log. A <b>No-show</b> result can be credited by clearing its Payment flag.</div>
      </div>
    </>
  )
}

function Row({ b, items, isNoShow, toggle, chase, saveSage, saveIgas, open, onToggleLog }) {
  const [sage, setSage] = useState(b.sageRef || '')
  return (
    <>
      <tr className={isNoShow ? 'noshow-row' : ''}>
        <td className="muted">#{b.bookingId}</td>
        <td>{b.name}{b.mlp ? <span className="b scheme" style={{ marginLeft: 6 }}>MLP</span> : null}</td>
        <td>{b.payer}</td>
        <td>
          <span className={'b ' + resultClass(delegateStatus(b.overall, b.disposition))}>{dispLabel(b.disposition) || b.overall}</span>
          {isNoShow && <span className="muted small" style={{ marginLeft: 6 }}>credit?</span>}
        </td>
        <td style={{ textAlign: 'center' }}><FlagBtn on={b.cert} onClick={() => toggle(b, 'cert')} /></td>
        <td style={{ textAlign: 'center' }}><FlagBtn on={b.photo} onClick={() => toggle(b, 'photo')} /></td>
        <td style={{ textAlign: 'center' }}><FlagBtn on={b.igas} onClick={() => toggle(b, 'igas')} /></td>
        <td style={{ textAlign: 'center' }}><FlagBtn on={b.pay} onClick={() => toggle(b, 'pay')} /></td>
        <td>
          <input className="sage" placeholder="SAGE-…" value={sage} onChange={(e) => setSage(e.target.value)} onBlur={() => saveSage(b, sage)} />
        </td>
        <td className="muted small nowrap">{b.lastChased ? fmt(b.lastChased) : 'never'}</td>
        <td className="nowrap">
          {items.length
            ? <button className="btn ghost sm" onClick={() => chase(b)}>Chase ({items.length})</button>
            : <span className="muted small">clear</span>}
          <button className="btn ghost sm" style={{ marginLeft: 6 }} onClick={onToggleLog}>Log</button>
        </td>
      </tr>
      {open && <DetailRow b={b} saveIgas={saveIgas} />}
    </>
  )
}

function DetailRow({ b, saveIgas }) {
  const { data, loading } = useData(() => getChaseLog(b.bookingId), [b.bookingId])
  const showIgas = b.igas || b.igasEvidenceDate
  return (
    <tr className="logrow">
      <td></td>
      <td colSpan={9}>
        {showIgas && (
          <div className="igas-block">
            <span className="muted small">IGAS evidence (5-year):</span>
            {b.igasEvidenceDate ? <IgasState date={b.igasEvidenceDate} expiry={b.igasExpiry} onClear={() => saveIgas(b, null)} />
              : <input type="date" className="sage" onChange={(e) => e.target.value && saveIgas(b, e.target.value)} title="Record the date evidence was received" />}
          </div>
        )}
        <div className="chaselog">
          <div className="muted small" style={{ marginBottom: 4 }}>Chase history for #{b.bookingId}:</div>
          {loading ? <span className="muted small">Loading…</span>
            : !data || data.length === 0 ? <span className="muted small">No chases recorded yet.</span>
              : data.map((c) => (
                <div className="cl" key={c.id}><span className="when">{fmt(c.at)}</span><span className="what">{c.items || '—'}</span><span className="ch">{c.channel}</span></div>
              ))}
        </div>
      </td>
    </tr>
  )
}

function IgasState({ date, expiry, onClear }) {
  const days = daysUntil(expiry)
  const cls = days == null ? 'pend' : days < 0 ? 'fail' : days <= 90 ? 'due' : 'pass'
  const label = days == null ? '—' : days < 0 ? 'expired — reset & recollect' : `expires ${fmt(expiry)} (${days}d)`
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <span className="b pass">✓ {fmt(date)}</span>
      <span className={'b ' + cls}>{label}</span>
      <button className="btn ghost sm" onClick={onClear}>Clear</button>
    </span>
  )
}

function FlagBtn({ on, onClick }) {
  return <button className={'b ' + (on ? 'due' : 'pend')} style={{ cursor: 'pointer', border: 'none' }} onClick={onClick}>{on ? 'YES' : '—'}</button>
}
