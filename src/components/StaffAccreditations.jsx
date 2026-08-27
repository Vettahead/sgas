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
// One staff member's accreditations. Deliberately built from the SAME pieces as
// the Delegates "Qualifications & renewals" card — card / table / .b badges /
// .subform — so it reads as part of the same app. No bespoke CSS.
// The pick-list is the qualification catalogue, grouped by scheme exactly as
// the Courses screen groups it.
// ─────────────────────────────────────────────────────────────────────────────

const WARN_KEY = 'sgas_accred_warn'
const loadWarn = () => {
  try { return Number(localStorage.getItem(WARN_KEY)) || DEFAULT_WARN_MONTHS } catch { return DEFAULT_WARN_MONTHS }
}
const blank = { categoryId: '', achievedOn: '', years: '', expiresOn: '', evidenceUrl: '', evidenceName: '', notes: '', requirement: '' }
// Status → the app's existing badge classes.
const BADGE = { ok: 'pass', due: 'due', expired: 'fail', none: 'pend' }

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
      setCat(c); setHeld(h); onCount?.(h)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [staffId])

  function changeWarn(months) {
    setWarn(months)
    try { localStorage.setItem(WARN_KEY, String(months)) } catch { /* private browsing */ }
  }

  // Pick-list minus anything already held (except the row being edited).
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
  // Achieved date or duration changing re-derives the expiry — but a date the
  // user typed in themselves is left alone.
  function reDerive(patch) {
    setForm((f) => {
      const next = { ...f, ...patch }
      const wasAuto = !f.expiresOn || f.expiresOn === expiryFrom(f.achievedOn, f.years)
      const auto = expiryFrom(next.achievedOn, next.years)
      return { ...next, expiresOn: wasAuto && auto ? auto : next.expiresOn }
    })
  }

  function startAdd() { setEditId(null); setForm(blank); setAdding(true) }
  function startEdit(h) {
    setAdding(false); setEditId(h.id)
    setForm({
      categoryId: String(h.categoryId), achievedOn: h.achievedOn,
      years: h.years === null ? '' : String(h.years), expiresOn: h.expiresOn,
      evidenceUrl: h.evidenceUrl, evidenceName: h.evidenceName,
      notes: h.notes, requirement: h.requirement || '',
    })
  }
  function cancel() { setAdding(false); setEditId(null); setForm(blank) }

  async function save() {
    if (!form.categoryId) return toast('Pick an accreditation')
    setSaving(true)
    try {
      await saveStaffAccreditation({ staffId, ...form })
      // The requirement level is a policy on the qualification itself, so it is
      // only written when it has actually been changed.
      const c = cat.find((x) => String(x.category_id) === String(form.categoryId))
      if (c && (c.requirement || '') !== (form.requirement || '')) {
        await setCategoryStaffFlags(form.categoryId, { requirement: form.requirement || null })
      }
      toast('Saved'); cancel(); await load()
    } catch (e) { toast(e.message || 'Could not save') } finally { setSaving(false) }
  }

  async function remove(h) {
    if (!window.confirm(`Remove ${h.code} from ${staffName}? This clears the record only — it does not affect any course.`)) return
    try { await deleteStaffAccreditation(h.id); toast('Removed'); await load() }
    catch (e) { toast(e.message || 'Could not remove') }
  }

  const editing = adding || editId !== null
  const tag = counts.total + ' held'

  return (
    <div className="card">
      <h3>
        🎓 Accreditations &amp; expiry
        <span className="tag">{tag}</span>
      </h3>
      <div className="body">
        <div className="renew-alert">
          {counts.expired > 0 && <span className="b fail">{counts.expired} expired</span>}
          {counts.due > 0 && <span className="b due">{counts.due} expiring</span>}
          {missing.length > 0 && <span className="b part">{missing.length} required, not held</span>}
          <span className="muted small" style={{ marginLeft: 'auto' }}>Warn</span>
          <select
            value={warn}
            onChange={(e) => changeWarn(Number(e.target.value))}
            style={{ width: 'auto' }}
            title="How far ahead an accreditation counts as expiring"
          >
            {WARN_MONTH_CHOICES.map((m) => <option key={m} value={m}>{m} months ahead</option>)}
          </select>
          {!editing && <button className="btn sm" onClick={startAdd}>＋ Add</button>}
        </div>

        {missing.length > 0 && (
          <div className="hint">
            <b>Required to work here, not on record:</b> {missing.map((m) => m.code).join(', ')}
          </div>
        )}

        {editing && (
          <div className="subform">
            <div className="sfh">{editId ? 'Edit accreditation' : 'Add an accreditation'}</div>
            <div className="twocol">
              <div className="field">
                <label className="fl">Accreditation</label>
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
              </div>
              <div className="field">
                <label className="fl">Required of all staff</label>
                <select value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })}>
                  <option value="">Not a requirement</option>
                  {STAFF_REQUIREMENTS.map((r) => <option key={r} value={r}>{REQUIREMENT_LABEL[r]}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="fl">Date achieved</label>
                <input type="date" value={form.achievedOn} onChange={(e) => reDerive({ achievedOn: e.target.value })} />
              </div>
              <div className="field">
                <label className="fl">Lasts (years)</label>
                <input type="text" inputMode="decimal" placeholder="e.g. 5" value={form.years}
                  onChange={(e) => reDerive({ years: e.target.value })} />
              </div>
              <div className="field">
                <label className="fl">Expires</label>
                <input type="date" value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} />
                {form.achievedOn && form.years !== '' && (
                  <div className="pc-msg muted">Worked out as {fmt(expiryFrom(form.achievedOn, form.years))} — change it if the certificate says otherwise.</div>
                )}
              </div>
              <div className="field">
                <label className="fl">Notes</label>
                <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="field">
                <label className="fl">Certificate link</label>
                <input type="text" placeholder="Dropbox link" value={form.evidenceUrl}
                  onChange={(e) => setForm({ ...form, evidenceUrl: e.target.value })} />
              </div>
              <div className="field">
                <label className="fl">Certificate name</label>
                <input type="text" placeholder="e.g. CCN1 2024.pdf" value={form.evidenceName}
                  onChange={(e) => setForm({ ...form, evidenceName: e.target.value })} />
              </div>
            </div>
            <div className="inrow" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost sm" onClick={cancel}>Cancel</button>
              <button className="btn sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}

        {loading ? <div className="empty">Loading accreditations…</div>
          : held.length === 0 ? <div className="empty">Nothing on record yet for {staffName}.</div> : (
            <table>
              <thead>
                <tr>
                  <th>Accreditation</th><th>Scheme</th><th>Achieved</th><th>Lasts</th>
                  <th>Expires</th><th>Status</th><th>Certificate</th><th></th>
                </tr>
              </thead>
              <tbody>
                {held.map((h) => {
                  const st = accreditationStatus(h.expiresOn, warn)
                  return (
                    <tr key={h.id} className={st.state === 'expired' ? 'noshow-row' : ''}>
                      <td>
                        <b>{h.code}</b> <span className="muted small">{h.description}</span>
                        {h.requirement && <span className="b scheme" style={{ marginLeft: 6 }}>{REQUIREMENT_LABEL[h.requirement]}</span>}
                        {h.notes && <div className="muted small">{h.notes}</div>}
                      </td>
                      <td className="muted small">{h.scheme}</td>
                      <td className="muted nowrap">{h.achievedOn ? fmt(h.achievedOn) : '—'}</td>
                      <td className="muted nowrap">{h.years === '' || h.years === null ? '—' : h.years + (Number(h.years) === 1 ? ' yr' : ' yrs')}</td>
                      <td className="muted nowrap">{h.expiresOn ? fmt(h.expiresOn) : '—'}</td>
                      <td className="nowrap"><span className={'b ' + BADGE[st.state]}>{st.label}</span></td>
                      <td className="muted small">
                        {h.evidenceUrl
                          ? <a href={h.evidenceUrl} target="_blank" rel="noreferrer">{h.evidenceName || 'View'}</a>
                          : h.evidenceName || '—'}
                      </td>
                      <td className="nowrap">
                        <span className="inrow">
                          <button className="btn ghost sm" onClick={() => startEdit(h)}>Edit</button>
                          <button className="btn ghost sm" onClick={() => remove(h)}>Remove</button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
      </div>
    </div>
  )
}
