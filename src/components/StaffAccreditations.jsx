import { useEffect, useMemo, useState } from 'react'
import {
  listAccreditationCatalogue, listStaffAccreditations, saveStaffAccreditation,
  deleteStaffAccreditation, setCategoryStaffFlags,
  expiryFrom, accreditationStatus, REQUIREMENT_LABEL, STAFF_REQUIREMENTS,
  WARN_MONTH_CHOICES, DEFAULT_WARN_MONTHS,
} from '../lib/api.js'
import { fmt } from '../lib/util.js'
import { toast } from '../lib/toast.js'

// ─────────────────────────────────────────────────────────────────────────────
// One staff member's accreditations: what they hold, when it expires, and the
// certificate behind it. The pick-list is the qualification catalogue, grouped
// by scheme exactly as the Courses screen groups it — re-order there and this
// re-orders too.
// ─────────────────────────────────────────────────────────────────────────────

const WARN_KEY = 'sgas_accred_warn'
const loadWarn = () => {
  try { return Number(localStorage.getItem(WARN_KEY)) || DEFAULT_WARN_MONTHS } catch { return DEFAULT_WARN_MONTHS }
}
const blank = { categoryId: '', achievedOn: '', years: '', expiresOn: '', evidenceUrl: '', evidenceName: '', notes: '', requirement: '' }

function StatusBadge({ expiresOn, warn }) {
  const st = accreditationStatus(expiresOn, warn)
  return <span className={'acc-badge acc-' + st.state}>{st.label}</span>
}

export default function StaffAccreditations({ staffId, staffName, onCount }) {
  const [cat, setCat] = useState([])
  const [held, setHeld] = useState([])
  const [loading, setLoading] = useState(true)
  const [warn, setWarn] = useState(loadWarn)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(blank)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [c, h] = await Promise.all([listAccreditationCatalogue(), listStaffAccreditations(staffId)])
      setCat(c); setHeld(h)
      onCount?.(h)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [staffId])

  function changeWarn(months) {
    setWarn(months)
    try { localStorage.setItem(WARN_KEY, String(months)) } catch { /* private browsing */ }
  }

  // Grouped pick-list, minus anything already held (except the row being edited).
  const heldIds = useMemo(() => new Set(held.map((h) => String(h.categoryId))), [held])
  const grouped = useMemo(() => {
    const out = []
    for (const c of cat) {
      if (heldIds.has(String(c.category_id)) && String(c.category_id) !== String(form.categoryId)) continue
      const g = out.find((x) => x.scheme === c.scheme)
      if (g) g.items.push(c); else out.push({ scheme: c.scheme, items: [c] })
    }
    return out
  }, [cat, heldIds, form.categoryId])

  // Anything tagged "must have" that this person does not hold.
  const missing = useMemo(
    () => cat.filter((c) => c.requirement === 'MUST' && !heldIds.has(String(c.category_id))),
    [cat, heldIds]
  )

  const counts = useMemo(() => {
    let due = 0, expired = 0
    for (const h of held) {
      const s = accreditationStatus(h.expiresOn, warn).state
      if (s === 'due') due++; else if (s === 'expired') expired++
    }
    return { total: held.length, due, expired }
  }, [held, warn])

  // Picking a qualification pre-fills how long it runs for from the catalogue.
  function pickCategory(id) {
    const c = cat.find((x) => String(x.category_id) === String(id))
    setForm((f) => {
      const years = c?.renewal_years ?? f.years
      return { ...f, categoryId: id, years: years ?? '', requirement: c?.requirement || '',
        expiresOn: f.achievedOn ? (expiryFrom(f.achievedOn, years) || f.expiresOn) : f.expiresOn }
    })
  }
  // Achieved date or duration changing re-derives the expiry, but a date the
  // user has typed in themselves is left alone.
  function reDerive(patch) {
    setForm((f) => {
      const next = { ...f, ...patch }
      const auto = expiryFrom(next.achievedOn, next.years)
      const wasAuto = !f.expiresOn || f.expiresOn === expiryFrom(f.achievedOn, f.years)
      return { ...next, expiresOn: wasAuto && auto ? auto : next.expiresOn }
    })
  }

  function startAdd() { setEditId(null); setForm(blank); setAdding(true) }
  function startEdit(h) {
    setAdding(false); setEditId(h.id)
    setForm({
      categoryId: String(h.categoryId), achievedOn: h.achievedOn, years: h.years === null ? '' : String(h.years),
      expiresOn: h.expiresOn, evidenceUrl: h.evidenceUrl, evidenceName: h.evidenceName,
      notes: h.notes, requirement: h.requirement || '',
    })
  }
  function cancel() { setAdding(false); setEditId(null); setForm(blank) }

  async function save() {
    if (!form.categoryId) { toast('Pick an accreditation'); return }
    setSaving(true)
    try {
      await saveStaffAccreditation({ staffId, ...form })
      // The requirement level is a policy on the qualification itself, so it
      // only gets written when it has actually been changed.
      const c = cat.find((x) => String(x.category_id) === String(form.categoryId))
      if (c && (c.requirement || '') !== (form.requirement || '')) {
        await setCategoryStaffFlags(form.categoryId, { requirement: form.requirement || null })
      }
      toast('Saved')
      cancel()
      await load()
    } catch (e) { toast(e.message || 'Could not save') } finally { setSaving(false) }
  }

  async function remove(h) {
    if (!window.confirm(`Remove ${h.code} from ${staffName}? This only clears the record — it does not affect any course.`)) return
    try { await deleteStaffAccreditation(h.id); toast('Removed'); await load() }
    catch (e) { toast(e.message || 'Could not remove') }
  }

  const editing = adding || editId !== null

  return (
    <div className="accpanel">
      <div className="acc-top">
        <div className="acc-stats">
          <span className="acc-stat"><b>{counts.total}</b> held</span>
          {counts.due > 0 && <span className="acc-stat due"><b>{counts.due}</b> expiring</span>}
          {counts.expired > 0 && <span className="acc-stat expired"><b>{counts.expired}</b> expired</span>}
          {missing.length > 0 && <span className="acc-stat missing"><b>{missing.length}</b> required, not held</span>}
        </div>
        <div className="acc-actions">
          <label className="acc-warn">
            Warn
            <select value={warn} onChange={(e) => changeWarn(Number(e.target.value))}>
              {WARN_MONTH_CHOICES.map((m) => <option key={m} value={m}>{m} months ahead</option>)}
            </select>
          </label>
          {!editing && <button className="btn sm" onClick={startAdd}>＋ Add accreditation</button>}
        </div>
      </div>

      {missing.length > 0 && (
        <div className="acc-missing">
          <b>Required to work here, not on record:</b>{' '}
          {missing.map((m) => m.code).join(', ')}
        </div>
      )}

      {editing && (
        <div className="acc-form">
          <div className="acc-form-row">
            <label>Accreditation
              <select value={form.categoryId} onChange={(e) => pickCategory(e.target.value)} disabled={editId !== null}>
                <option value="">— pick one —</option>
                {grouped.map((g) => (
                  <optgroup key={g.scheme} label={g.scheme}>
                    {g.items.map((c) => (
                      <option key={c.category_id} value={c.category_id}>
                        {c.code}{c.description ? ' — ' + c.description : ''}{c.staffOnly ? ' (staff)' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>Date achieved
              <input type="date" value={form.achievedOn} onChange={(e) => reDerive({ achievedOn: e.target.value })} />
            </label>
            <label>Lasts (years)
              <input type="number" min="0" step="0.5" placeholder="e.g. 5" value={form.years}
                onChange={(e) => reDerive({ years: e.target.value })} />
            </label>
            <label>Expires
              <input type="date" value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} />
            </label>
          </div>
          <div className="acc-form-row">
            <label>Certificate link
              <input type="text" placeholder="Dropbox link — paste for now" value={form.evidenceUrl}
                onChange={(e) => setForm({ ...form, evidenceUrl: e.target.value })} />
            </label>
            <label>Certificate name
              <input type="text" placeholder="e.g. CCN1 2024.pdf" value={form.evidenceName}
                onChange={(e) => setForm({ ...form, evidenceName: e.target.value })} />
            </label>
            <label>Requirement <small className="muted">(applies to all staff)</small>
              <select value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })}>
                <option value="">Not a requirement</option>
                {STAFF_REQUIREMENTS.map((r) => <option key={r} value={r}>{REQUIREMENT_LABEL[r]}</option>)}
              </select>
            </label>
            <label>Notes
              <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          <div className="acc-form-btns">
            <button className="btn sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
            <button className="btn ghost sm" onClick={cancel}>Cancel</button>
            {form.achievedOn && form.years && (
              <span className="muted small">Expiry worked out as {fmt(expiryFrom(form.achievedOn, form.years))} — change it if the certificate says otherwise.</span>
            )}
          </div>
        </div>
      )}

      {loading ? <div className="loading">Loading accreditations…</div> : held.length === 0 ? (
        <div className="empty">Nothing on record yet for {staffName}.</div>
      ) : (
        <table className="acctable">
          <thead><tr><th>Accreditation</th><th>Scheme</th><th>Achieved</th><th>Lasts</th><th>Expires</th><th>Status</th><th>Certificate</th><th></th></tr></thead>
          <tbody>
            {held.map((h) => (
              <tr key={h.id} className={'acc-row ' + accreditationStatus(h.expiresOn, warn).state}>
                <td>
                  <b>{h.code}</b>
                  {h.requirement && <span className={'acc-req r-' + h.requirement}>{REQUIREMENT_LABEL[h.requirement]}</span>}
                  {h.description && <div className="muted small">{h.description}</div>}
                  {h.notes && <div className="muted small">📝 {h.notes}</div>}
                </td>
                <td className="muted small">{h.scheme}</td>
                <td className="muted small">{h.achievedOn ? fmt(h.achievedOn) : '—'}</td>
                <td className="muted small">{h.years === '' || h.years === null ? '—' : h.years + (Number(h.years) === 1 ? ' yr' : ' yrs')}</td>
                <td className="muted small">{h.expiresOn ? fmt(h.expiresOn) : '—'}</td>
                <td><StatusBadge expiresOn={h.expiresOn} warn={warn} /></td>
                <td className="muted small">
                  {h.evidenceUrl
                    ? <a href={h.evidenceUrl} target="_blank" rel="noreferrer">{h.evidenceName || 'View'}</a>
                    : h.evidenceName || <span className="muted">none</span>}
                </td>
                <td>
                  <span className="inrow">
                    <button className="btn ghost sm" onClick={() => startEdit(h)}>Edit</button>
                    <button className="btn ghost sm" onClick={() => remove(h)}>Remove</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
