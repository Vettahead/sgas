import { useEffect, useState } from 'react'
import { searchDelegates, getDelegateHistory, updateClient, clientDeleteCheck, deleteClientRecord, listDuplicateDelegates, mergeDelegates, DOC_SINCE } from '../lib/api.js'
import { toast } from '../lib/toast.js'
import { useData } from '../lib/hooks.js'
import { fmt, initials, resultClass } from '../lib/util.js'
// The roll-up of history → current accreditations moved to lib/renewals.js so
// Book a Delegate can show the same answer while somebody is on the phone.
import { renewalSummary, RENEWAL_BADGE } from '../lib/renewals.js'

export default function Delegates({ openDelegate }) {
  const [selected, setSelected] = useState(openDelegate || null)
  if (selected) return <DelegateDetail clientId={selected} back={() => setSelected(null)} />
  return <DelegateList onOpen={setSelected} />
}

// ─────────────────────────────────────────────────────────────────────────────
// EDIT AND DELETE
//
// The import made people out of note text — "Plus IGAS", "Monday Training",
// "Send Certs" — because a line in a Teamup note can read like a name. Simon
// needs to be able to fix a spelling and remove a non-person, and neither was
// possible from the screen.
//
// Delete is guarded by where the bookings CAME FROM, not by how many there are:
// anybody carrying a booking out of the Access file is seven years of history
// and cannot be deleted here, and everything the parser invented has no Access
// booking at all. That line does the sorting so nobody has to judge it record
// by record. What will be destroyed is counted and shown BEFORE the button.
// ─────────────────────────────────────────────────────────────────────────────
function EditDelegate({ client, onSaved, onCancel }) {
  const [f, setF] = useState({
    forename: client.forename || '', surname: client.surname || '',
    ni_number: client.ni_number || '', date_of_birth: client.date_of_birth || '',
    mobile: client.mobile || '', email: client.email || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="subform">
      <div className="sfh">Edit delegate</div>
      <div className="twocol">
        <Inp label="Forename" v={f.forename} on={set('forename')} />
        <Inp label="Surname" v={f.surname} on={set('surname')} />
      </div>
      <div className="twocol">
        <Inp label="NI number" v={f.ni_number} on={set('ni_number')} />
        <Inp label="Date of birth" type="date" v={f.date_of_birth} on={set('date_of_birth')} />
      </div>
      <div className="twocol">
        <Inp label="Mobile" v={f.mobile} on={set('mobile')} />
        <Inp label="Email" v={f.email} on={set('email')} />
      </div>
      <div className="inrow">
        <button className="btn sm" disabled={busy} onClick={async () => {
          setBusy(true)
          try { await updateClient(client.client_id, f); toast('Saved'); onSaved() }
          catch (e) { toast(e.message) } finally { setBusy(false) }
        }}>Save changes</button>
        <button className="btn ghost sm" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function DeleteDelegate({ client, onDone, onCancel }) {
  const [check, setCheck] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { clientDeleteCheck(client.client_id).then(setCheck).catch(() => setCheck(null)) }, [client.client_id])
  if (!check) return <div className="subform"><div className="sfh">Delete this record</div><p className="muted small">Checking what is on it…</p></div>
  const blocked = check.fromAccess > 0
  return (
    <div className="subform">
      <div className="sfh">Delete this record</div>
      <div className="hint">
        {blocked ? (
          <>
            <b>This one cannot be deleted.</b> {client.forename} {client.surname} has {check.fromAccess} booking
            {check.fromAccess === 1 ? '' : 's'} that came out of the old Access database — that is their history, and
            deleting it here would lose it for good. If they should not be on a course, take them off that course instead.
          </>
        ) : (
          <>
            <b>This cannot be undone.</b> Deleting {client.forename} {client.surname} also removes {check.bookings} booking
            {check.bookings === 1 ? '' : 's'}{check.seated > 0 ? `, ${check.seated} of them on a course` : ''}, and the
            qualifications recorded against them. Nothing here came from the Access database, so no history is lost.
          </>
        )}
      </div>
      <div className="inrow">
        {!blocked && (
          <button className="btn sm" disabled={busy} onClick={async () => {
            setBusy(true)
            try { await deleteClientRecord(client.client_id); toast('Record deleted'); onDone() }
            catch (e) { toast(e.message); setBusy(false) }
          }}>Yes, delete {client.forename} {client.surname}</button>
        )}
        <button className="btn ghost sm" disabled={busy} onClick={onCancel}>{blocked ? 'Close' : 'Keep it'}</button>
      </div>
    </div>
  )
}

function Inp({ label, v, on, type = 'text' }) {
  return (
    <div className="field">
      <label className="fl">{label}</label>
      <input type={type} value={v} onChange={on} />
    </div>
  )
}

function DelegateList({ onOpen }) {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')

  // Debounced -- otherwise every keystroke is its own database round trip.
  useEffect(() => {
    const t = setTimeout(() => setTerm(q), 250)
    return () => clearTimeout(t)
  }, [q])

  // The search runs in the DATABASE. It used to pull the whole table and filter
  // here, which PostgREST truncated at 1,000 rows -- so anyone past about "D"
  // could not be found at all. Never go back to filtering a full list client-side.
  const { data, loading } = useData(() => searchDelegates(term), [term])
  const rows = data?.rows || []
  const total = data?.total
  const truncated = data?.truncated
  const [dupes, setDupes] = useState(false)

  return (
    <>
    {dupes && <Duplicates onOpen={onOpen} onClose={() => setDupes(false)} />}
    <div className="card">
      <h3>👤 Delegates <span className="tag">{total != null ? `${rows.length} of ${total}` : `${rows.length} shown`} <button className="btn ghost sm" style={{ marginLeft: 10 }} onClick={() => setDupes((v) => !v)} title="Find the same person entered twice and merge them">⚭ Find duplicates</button></span></h3>
      <div style={{ padding: '14px 18px 0' }}>
        <div className="searchbar">
          {/* Stays mounted while loading, so typing never loses focus. */}
          <input type="search" placeholder="Search by name, NI number, or company…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        {truncated && (
          <div className="muted small" style={{ marginTop: 8 }}>
            Showing the first {rows.length}. Start typing to search {total != null ? `all ${total}` : 'every'} delegates — not just the ones listed here.
          </div>
        )}
      </div>
      <table>
        <thead><tr><th>Name</th><th>Associated company</th><th>NI number</th><th>Date of birth</th><th>Mobile</th><th>Email</th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan={6} className="empty">Searching…</td></tr>}
          {!loading && rows.length === 0 && <tr><td colSpan={6} className="empty">No matching delegates</td></tr>}
          {!loading && rows.map((c) => (
            <tr key={c.client_id} className="clickrow" onClick={() => onOpen(c.client_id)}>
              <td><b>{c.forename} {c.surname}</b></td>
              <td>{c.company}</td>
              <td className="muted">{c.ni_number || '—'}</td>
              <td className="muted">{c.date_of_birth ? fmt(c.date_of_birth) : '—'}</td>
              <td className="muted">{c.mobile || '—'}</td>
              <td className="muted">{c.email || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}

/* ---------------------------------------------------------------------------
   Duplicates (Jen walkthrough §5). "Muhammad Ali" twice with a spelling
   difference; the renewal engine surfaces them and the record splits. The
   database lists the likely pairs (same surname plus a matching forename,
   date of birth, NI number, mobile or email); somebody who knows decides
   which record survives. Merging moves every booking, MLP and contact log to
   the survivor, fills its blanks from the other, and deletes the other.
   ------------------------------------------------------------------------- */
function Duplicates({ onOpen, onClose }) {
  const { data, loading, reload } = useData(listDuplicateDelegates)
  const [busy, setBusy] = useState(null)
  const [hidden, setHidden] = useState(() => new Set())
  const pairs = (data || []).filter((p) => !hidden.has(p.a.client_id + ':' + p.b.client_id))

  async function merge(p, keep, drop) {
    const ok = window.confirm(
      `Keep ${keep.forename} ${keep.surname} (#${keep.client_id}, ${keep.bookings} booking${keep.bookings === 1 ? '' : 's'})\n` +
      `and merge in ${drop.forename} ${drop.surname} (#${drop.client_id}, ${drop.bookings} booking${drop.bookings === 1 ? '' : 's'})?\n\n` +
      'Every booking and contact record moves to the one you keep, any blank details are filled from the other, and the other record is deleted. This cannot be undone.'
    )
    if (!ok) return
    setBusy(p)
    try {
      const r = await mergeDelegates(keep.client_id, drop.client_id)
      toast(`Merged into ${keep.forename} ${keep.surname} — ${r?.bookings_moved ?? 0} booking${r?.bookings_moved === 1 ? '' : 's'} moved`)
      reload()
    } catch (e) { toast('Could not merge: ' + e.message) } finally { setBusy(null) }
  }

  const Person = ({ c, other, onKeep }) => (
    <td style={{ verticalAlign: 'top' }}>
      <button className="dn-link" onClick={() => onOpen(c.client_id)}><b>{c.forename} {c.surname}</b></button> <span className="muted small">#{c.client_id}</span>
      <div className="muted small">{c.company}</div>
      <div className="muted small">
        {c.ni_number || 'no NI'} · {c.date_of_birth ? fmt(c.date_of_birth) : 'no DOB'} · {c.mobile || 'no mobile'} · {c.email || 'no email'}
      </div>
      <div className="small" style={{ marginTop: 4 }}>
        <span className={'b ' + (c.bookings ? 'pass' : 'pend')}>{c.bookings} booking{c.bookings === 1 ? '' : 's'}</span>
        {' '}<button className="btn ghost sm" disabled={!!busy} onClick={onKeep} title={`Keep this one, merge ${other.forename} ${other.surname} into it`}>Keep this one</button>
      </div>
    </td>
  )

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <h3>⚭ Possible duplicates <span className="tag">{loading ? 'looking…' : `${pairs.length} pair${pairs.length === 1 ? '' : 's'}`} <button className="btn ghost sm" style={{ marginLeft: 10 }} onClick={onClose}>Close</button></span></h3>
      <div className="body" style={{ paddingBottom: 0 }}>
        <div className="hint">Same surname, and one of: same forename, date of birth, NI number, mobile or email. Open each name to check before merging. <b>Keep this one</b> merges the other into it. <b>Not the same person</b> hides the pair for now.</div>
      </div>
      <table>
        <thead><tr><th>One</th><th>The other</th><th>Why</th><th></th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan={4} className="empty">Checking every surname…</td></tr>}
          {!loading && pairs.length === 0 && <tr><td colSpan={4} className="empty">No likely duplicates found</td></tr>}
          {pairs.map((p) => (
            <tr key={p.a.client_id + ':' + p.b.client_id}>
              <Person c={p.a} other={p.b} onKeep={() => merge(p, p.a, p.b)} />
              <Person c={p.b} other={p.a} onKeep={() => merge(p, p.b, p.a)} />
              <td className="small" style={{ verticalAlign: 'top' }}>{p.why}</td>
              <td className="nowrap" style={{ verticalAlign: 'top' }}><button className="linkbtn" onClick={() => setHidden((h) => new Set(h).add(p.a.client_id + ':' + p.b.client_id))}>Not the same person</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DelegateDetail({ clientId, back }) {
  const { data, loading, reload } = useData(() => getDelegateHistory(clientId), [clientId])
  const [mode, setMode] = useState(null)   // 'edit' | 'delete' | null
  if (loading || !data) return <div className="loading">Loading history…</div>
  const { client, bookings } = data
  const renewals = renewalSummary(bookings)
  const expiredCount = renewals.filter((r) => r.status === 'expired').length
  const soonCount = renewals.filter((r) => r.status === 'soon').length

  return (
    <>
      <div style={{ marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn ghost sm" onClick={back}>← All delegates</button>
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn ghost sm" onClick={() => setMode(mode === 'edit' ? null : 'edit')}>✎ Edit details</button>
        <button className="btn ghost sm" onClick={() => setMode(mode === 'delete' ? null : 'delete')}>Delete record</button>
      </div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3>
          <span className="av" style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--brand-soft)', color: 'var(--brand-dark)', fontSize: 12, fontWeight: 700, marginRight: 4 }}>{initials(client.forename, client.surname)}</span>
          {client.forename} {client.surname}
        </h3>
        <div className="body">
          {mode === 'edit' && (
            <EditDelegate client={{ ...client, client_id: clientId }}
              onSaved={() => { setMode(null); reload() }} onCancel={() => setMode(null)} />
          )}
          {mode === 'delete' && (
            <DeleteDelegate client={{ ...client, client_id: clientId }}
              onDone={() => { setMode(null); back() }} onCancel={() => setMode(null)} />
          )}
          <div className="twocol">
            <Field label="Associated company" value={client.company} />
            <Field label="NI number" value={client.ni_number} />
            <Field label="Date of birth" value={client.date_of_birth ? fmt(client.date_of_birth) : '—'} />
            <Field label="Mobile" value={client.mobile} />
            <Field label="Email" value={client.email} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>🎓 Qualifications & renewals <span className="tag">{renewals.length} held</span></h3>
        <div className="body">
          {renewals.length === 0 && <div className="empty">No achieved qualifications yet.</div>}
          {renewals.length > 0 && (
            <>
              {(expiredCount > 0 || soonCount > 0) && (
                <div className="renew-alert">
                  {expiredCount > 0 && <span className="b fail">{expiredCount} expired</span>}
                  {soonCount > 0 && <span className="b due">{soonCount} due within 90 days</span>}
                </div>
              )}
              <table>
                <thead><tr><th>Qualification</th><th>From course</th><th>Achieved</th><th>Expires</th><th>Renewal</th></tr></thead>
                <tbody>
                  {renewals.map((r) => {
                    const [cls, label] = RENEWAL_BADGE[r.status]
                    return (
                      <tr key={r.code} className={r.status === 'expired' ? 'noshow-row' : ''}>
                        <td><b>{r.code}</b> <span className="muted small">{r.desc}</span></td>
                        <td className="muted">{r.course}</td>
                        <td className="muted nowrap">{fmt(r.achieved)}</td>
                        <td className="muted nowrap">{fmt(r.expiry)}</td>
                        <td className="nowrap">
                          <span className={'b ' + cls}>{label}</span>
                          {r.days != null && r.status === 'soon' && <span className="muted small" style={{ marginLeft: 6 }}>{r.days}d</span>}
                          {r.days != null && r.status === 'expired' && <span className="muted small" style={{ marginLeft: 6 }}>{-r.days}d ago</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h3>📜 Accreditation history <span className="tag">{bookings.length} booking{bookings.length !== 1 ? 's' : ''}</span></h3>
        <div className="body">
          {bookings.length === 0 && <div className="empty">No bookings on record.</div>}
          {bookings.map((b) => (
            <div className="timeline-bk" key={b.bookingId}>
              <div className="bh">
                <span className="nm">{b.course}</span>
                <span className={'b ' + resultClass(b.overall)}>{b.overall}</span>
                <span className="muted small">{b.assessor}</span>
                {/* Where the certificate is (§6) — the answer to "has mine gone?" */}
                {b.overall === 'PASS' && ((b.start || '') >= DOC_SINCE || b.certSent || b.certClient) && (
                  <span className="small" style={{ marginLeft: 8 }}>
                    {!b.certSent && <span className="b pend">certificate not yet sent</span>}
                    {b.certSent && !b.certReturns && <span className="b pass">sent to awarding body {fmt(b.certSent)} · goes direct</span>}
                    {b.certSent && b.certReturns && !b.certReceived && <span className="b due">with awarding body since {fmt(b.certSent)}</span>}
                    {b.certSent && b.certReturns && b.certReceived && !b.certClient && <span className="b due">received {fmt(b.certReceived)} · not yet sent on</span>}
                    {b.certClient && <span className="b pass">certificate sent {fmt(b.certClient)}</span>}
                  </span>
                )}
                <span className="dt">{fmt(b.start)}</span>
              </div>
              <table>
                <thead><tr><th>Qualification</th><th>Result</th><th>Achieved</th><th>Expires</th></tr></thead>
                <tbody>
                  {b.categories.map((x, i) => (
                    <tr key={i}>
                      <td><b>{x.code}</b> <span className="muted small">{x.desc}</span></td>
                      <td><span className={'b ' + resultClass(x.result)}>{x.result}</span></td>
                      <td className="muted nowrap">{fmt(x.achieved)}</td>
                      <td className="muted nowrap">{fmt(x.expiry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
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
