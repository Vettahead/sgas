import { useEffect, useState } from 'react'
import { listBlocks, getSessionBookings, markCategory, setDisposition, setAssessNotes, assignBlockRole, listStaff, listSchemes, getFormData, getBlockFormData } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt, initials, resultClass, dispLabel, delegateStatus, todayISO } from '../lib/util.js'
import { toast } from '../lib/toast.js'
import { downloadForm, downloadCombined } from '../lib/acspdf.js'

// openBlock: { id, at } from the Dashboard or the calendar — open that course
// straight away instead of landing on the blank picker.
export default function Assess({ openBlock = null }) {
  const { data: blocks, loading, reload: reloadBlocks } = useData(listBlocks)
  const { data: staff } = useData(listStaff)
  const { data: schemes } = useData(listSchemes)
  const [sid, setSid] = useState(() => (openBlock?.id ? String(openBlock.id) : ''))
  const [schemeFilter, setSchemeFilter] = useState('')
  // The list used to be every course ever, oldest first — this week's at the
  // bottom of hundreds. Now: recent and upcoming (a month either side), newest
  // first, with a switch for the lot.
  const [allTime, setAllTime] = useState(false)
  useEffect(() => { if (openBlock?.id) setSid(String(openBlock.id)) }, [openBlock])
  if (loading || !blocks) return <div className="loading">Loading sessions…</div>

  const block = blocks.find((b) => b.id === Number(sid))
  const today = todayISO()
  const lo = new Date(); lo.setDate(lo.getDate() - 31)
  const hi = new Date(); hi.setDate(hi.getDate() + 31)
  const inWindow = (b) => (b.end || b.start) >= lo.toISOString().slice(0, 10) && b.start <= hi.toISOString().slice(0, 10)
  const shownBlocks = blocks
    .filter((b) => !b.isInternal)
    .filter((b) => !schemeFilter || b.scheme === schemeFilter)
    .filter((b) => allTime || inWindow(b) || String(b.id) === sid)
    .sort((a, b) => (b.start || '').localeCompare(a.start || ''))

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
        <label className="fl">Select a session to assess <label className="chk" style={{ display: 'inline-flex', marginLeft: 12, fontWeight: 500 }}><input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} /> show every course, not just this month or so</label></label>
        <select value={sid} onChange={(e) => setSid(e.target.value)}>
          <option value="">— choose session —{shownBlocks.length ? ` (${shownBlocks.length}, newest first)` : ''}</option>
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
  const counts = { PASS: 0, FAIL: 0, NYC: 0, PENDING: 0 }
  d.categories.forEach((x) => { counts[x.result] = (counts[x.result] || 0) + 1 })

  // Every click says what it did — a Fail used to save silently, and a save
  // that FAILED said nothing at all. Undo puts the previous result back.
  async function mark(x, result) {
    const prev = x.result
    try {
      await markCategory(x.bookingCategoryId, result)
      toast(result === 'PASS' ? `${d.name}: ${x.code} passed — expiry auto-calculated` : `${d.name}: ${x.code} marked ${result === 'NYC' ? 'NYC' : 'Fail'}`,
        { undo: async () => { try { await markCategory(x.bookingCategoryId, prev); reload() } catch (e) { toast(e.message) } } })
      reload()
    } catch (e) { toast('Could not save: ' + e.message) }
  }
  async function disp(value) {
    const prev = d.disposition || 'NONE'
    const next = d.disposition === value ? 'NONE' : value
    try {
      await setDisposition(d.bookingId, next)
      toast(next === 'NONE' ? `${d.name}: attendance cleared` : `${d.name} marked ${dispLabel(next)} — goes back to scheduling`,
        { undo: async () => { try { await setDisposition(d.bookingId, prev); reload() } catch (e) { toast(e.message) } } })
      reload()
    } catch (e) { toast('Could not save: ' + e.message) }
  }
  async function saveNote() {
    if (note !== (d.assessNotes || '')) {
      try { await setAssessNotes(d.bookingId, note); toast('Notes saved') }
      catch (e) { toast('Could not save the note: ' + e.message) }
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
        <span className="ov result-sum">
          {locked ? (
            <span className={'b ' + resultClass(status)}>{dispLabel(d.disposition)}</span>
          ) : (
            <>
              {counts.PASS > 0 && <span className="b pass">✓ {counts.PASS} pass</span>}
              {counts.FAIL > 0 && <span className="b fail">✗ {counts.FAIL} fail</span>}
              {counts.NYC > 0 && <span className="b nyc">NYC {counts.NYC}</span>}
              {counts.PENDING > 0 && <span className="b pend">• {counts.PENDING} to do</span>}
            </>
          )}
        </span>
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
