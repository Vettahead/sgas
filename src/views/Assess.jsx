import { useState } from 'react'
import { listBlocks, getSessionBookings, markCategory, setDisposition, setAssessNotes, assignBlockRole, listStaff, listSchemes, getFormData, getBlockFormData } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt, initials, resultClass, dispLabel, delegateStatus } from '../lib/util.js'
import { toast } from '../lib/toast.js'
import { downloadForm, downloadCombined } from '../lib/acspdf.js'

export default function Assess() {
  const { data: blocks, loading, reload: reloadBlocks } = useData(listBlocks)
  const { data: staff } = useData(listStaff)
  const { data: schemes } = useData(listSchemes)
  const [sid, setSid] = useState('')
  const [schemeFilter, setSchemeFilter] = useState('')
  if (loading || !blocks) return <div className="loading">Loading sessions…</div>

  const block = blocks.find((b) => b.id === Number(sid))
  const shownBlocks = schemeFilter ? blocks.filter((b) => b.scheme === schemeFilter) : blocks

  return (
    <>
      <div className="hint">Pick the course block being assessed. The <b>assessor</b> and <b>verifier</b> are chosen here (decided on the day), not at scheduling. Mark each qualification <b>Pass/Fail</b>; set a delegate to <b>NYC</b> (ran out of time) or <b>No-show</b> (didn't attend) to send them back round to scheduling.</div>
      <div className="field" style={{ maxWidth: 460 }}>
        <label className="fl">Filter by scheme</label>
        <select value={schemeFilter} onChange={(e) => { setSchemeFilter(e.target.value); setSid('') }}>
          <option value="">All schemes</option>
          {(schemes || []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="field" style={{ maxWidth: 460 }}>
        <label className="fl">Select a session to assess</label>
        <select value={sid} onChange={(e) => setSid(e.target.value)}>
          <option value="">— choose session —</option>
          {shownBlocks.map((b) => (
            <option key={b.id} value={b.id}>{b.course} · {fmt(b.start)}{b.end && b.end !== b.start ? '–' + fmt(b.end) : ''}{b.trainer ? ' · ' + b.trainer : ''}</option>
          ))}
        </select>
      </div>
      {block ? <AssessArea block={block} staff={staff || []} onRoles={reloadBlocks} /> : (
        <div className="empty card" style={{ marginTop: 16, padding: 40 }}>Choose a session above to mark its delegates.</div>
      )}
    </>
  )
}

function AssessArea({ block, staff, onRoles }) {
  const { data, loading, reload } = useData(() => getSessionBookings(block.id), [block.id])

  async function setRole(role, value) {
    try {
      await assignBlockRole(block.id, role, value ? Number(value) : null)
      toast(`${role[0].toUpperCase() + role.slice(1)} updated`)
      onRoles()
    } catch (e) { toast(e.message) }
  }

  async function genAll() {
    try {
      const forms = await getBlockFormData(block.id)
      if (!forms.length) return toast('No delegates to generate')
      await downloadCombined(forms, `${block.course}_${fmt(block.start)}`)
      toast(`Generated ${forms.length} ACS form${forms.length > 1 ? 's' : ''}`)
    } catch (e) { toast(e.message) }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div className="block-actions">
        <button className="btn-form lg" onClick={genAll}>📄 Generate ACS forms for this block</button>
      </div>
      <div className="assess-roles">
        <div className="field">
          <label className="fl">Trainer (from schedule)</label>
          <div className="ro">{block.trainer || '—'}</div>
        </div>
        <div className="field">
          <label className="fl">Assessor</label>
          <select className="rolesel" value={block.assessorId || ''} onChange={(e) => setRole('assessor', e.target.value)}>
            <option value="">— unassigned —</option>
            {staff.map((s) => <option key={s.staff_id} value={s.staff_id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="fl">Verifier</label>
          <select className="rolesel" value={block.verifierId || ''} onChange={(e) => setRole('verifier', e.target.value)}>
            <option value="">— unassigned —</option>
            {staff.map((s) => <option key={s.staff_id} value={s.staff_id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {loading || !data ? <div className="loading">Loading delegates…</div>
        : data.length === 0 ? <div className="empty card" style={{ padding: 40 }}>No delegates on this session.</div>
          : data.map((d) => <DelegateCard key={d.bookingId} d={d} reload={reload} />)}
    </div>
  )
}

function DelegateCard({ d, reload }) {
  const [note, setNote] = useState(d.assessNotes || '')
  const locked = d.disposition && d.disposition !== 'NONE'
  const status = delegateStatus(d.overall, d.disposition)

  async function mark(x, result) {
    await markCategory(x.bookingCategoryId, result)
    if (result === 'PASS') toast(`${x.code} passed — expiry auto-calculated`)
    reload()
  }
  async function disp(value) {
    const next = d.disposition === value ? 'NONE' : value
    await setDisposition(d.bookingId, next)
    toast(next === 'NONE' ? 'Attendance cleared' : `Marked ${dispLabel(next)} — goes back to scheduling`)
    reload()
  }
  async function saveNote() {
    if (note !== (d.assessNotes || '')) {
      await setAssessNotes(d.bookingId, note)
      toast('Notes saved')
    }
  }
  async function genForm() {
    try {
      const fd = await getFormData(d.bookingId)
      if (!fd) return toast('No form data for this delegate')
      await downloadForm(fd)
      toast(`ACS form generated for ${d.name}`)
    } catch (e) { toast(e.message) }
  }

  return (
    <div className="assess-deleg">
      <div className="dh">
        <span className="av" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--brand-soft)', color: 'var(--brand-dark)', fontSize: 11, fontWeight: 700 }}>{initials(d.forename, d.surname)}</span>
        <span className="nm">{d.name}</span>
        <span className="muted small">Booking #{d.bookingId}</span>
        {d.noShows > 1 && <span className="noshow-alert">⚠ {d.noShows} no-shows on record</span>}
        <span className="ov"><span className={'b ' + resultClass(status)}>{dispLabel(d.disposition) || status}</span></span>
      </div>
      {d.categories.map((x) => (
        <div className={'qrow' + (locked ? ' locked' : '')} key={x.bookingCategoryId}>
          <span className="qc">{x.code}</span>
          <span className="qd">{x.desc}</span>
          <span className="exp">{x.result === 'PASS' && x.expiry ? '✓ expires ' + fmt(x.expiry) : ''}</span>
          <span className="seg">
            <button className={'pass ' + (x.result === 'PASS' ? 'on' : '')} onClick={() => mark(x, 'PASS')}>Pass</button>
            <button className={'nyc ' + (x.result === 'NYC' ? 'on' : '')} onClick={() => mark(x, 'NYC')}>NYC</button>
            <button className={'fail ' + (x.result === 'FAIL' ? 'on' : '')} onClick={() => mark(x, 'FAIL')}>Fail</button>
          </span>
        </div>
      ))}
      <div className="disp-row">
        <span className="muted small">Attendance:</span>
        <span className="seg">
          <button className={'nyc ' + (d.disposition === 'NYC' ? 'on' : '')} onClick={() => disp('NYC')}>NYC</button>
          <button className={'noshow ' + (d.disposition === 'NO_SHOW' ? 'on' : '')} onClick={() => disp('NO_SHOW')}>No-show</button>
        </span>
        <input className="note" placeholder="Assessor notes (optional)…" value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} />
        <button className="btn-form" onClick={genForm} title="Generate the LCL ACS application form for this delegate">📄 ACS form</button>
      </div>
    </div>
  )
}
