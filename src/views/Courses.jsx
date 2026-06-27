import { useState } from 'react'
import { listCourses, listCategories, createCourse, updateCourse, deleteCourse, createCategory, updateCategory, deleteCategory, isLive } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { toast } from '../lib/toast.js'

const money = (v) => (v == null || v === '') ? '—' : '£' + Number(v).toFixed(2).replace(/\.00$/, '')

export default function Courses() {
  const { data: courses, loading, reload } = useData(listCourses)
  const { data: cats, reload: reloadCats } = useData(listCategories)
  const [open, setOpen] = useState(() => new Set())
  const [adding, setAdding] = useState(false)
  const [addingQual, setAddingQual] = useState(false)
  if (loading || !courses) return <div className="loading">Loading courses…</div>

  const toggle = (id) => setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSchemes = Array.from(new Set([...courses.map((c) => c.scheme), ...(cats || []).map((c) => c.scheme)].filter(Boolean))).sort()
  const courseSchemes = new Set(courses.map((c) => c.scheme))
  const orphanSchemes = Array.from(new Set((cats || []).map((c) => c.scheme).filter((s) => s && !courseSchemes.has(s)))).sort()
  const reloadAll = () => { reload(); reloadCats() }
  const schemeTotal = (scheme) => (cats || []).filter((x) => x.scheme === scheme && x.price != null).reduce((n, x) => n + Number(x.price), 0)

  return (
    <div className="card">
      <h3>📚 Courses &amp; qualifications <span className="tag">{courses.length} courses</span></h3>
      <div className="body">
        {!isLive && (
          <div className="banner" style={{ background: '#fdecea', border: ' 1px solid #e3b3ad', color: '#922', marginBottom: 12 }}>
            ⚠️ <b>DEMO MODE — changes are NOT being saved.</b> The app isn’t connected to the database, so edits here vanish on reload. Connect Supabase (env vars) and reload to save for real.
          </div>
        )}
        <SchemeDatalist schemes={allSchemes} />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
          <span className="small muted">Pricing is <b>per qualification (module)</b> — a delegate pays for the modules they take, so a booking costs the sum of its modules. Click a course to rename, move or delete it; price/move/delete each qualification below.</span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => { setAddingQual(false); setAdding(!adding) }}>{adding ? 'Cancel' : '＋ Add course'}</button>
          <button className="btn sm" onClick={() => { setAdding(false); setAddingQual(!addingQual) }}>{addingQual ? 'Cancel' : '＋ Add qualification'}</button>
        </div>
        {adding && <AddCourse onDone={() => { setAdding(false); reload() }} />}
        {addingQual && <AddQualGlobal schemes={allSchemes} onDone={() => { setAddingQual(false); reloadCats() }} />}

        {courses.map((c) => {
          const total = schemeTotal(c.scheme)
          return (
            <div className={'cgroup' + (open.has(c.course_id) ? '' : ' collapsed')} key={c.course_id}>
              <div className="ch" onClick={() => toggle(c.course_id)}>
                <span className="tw">▼</span>
                <span className="nm">{c.name}</span>
                <span className="b scheme">{c.scheme || '—'}</span>
                {c.price != null && <span className="b due" title="Optional fixed package price">pkg {money(c.price)}</span>}
                {total > 0 && <span className="b pass" title="Sum of all module prices in this scheme">all modules {money(total)}</span>}
                {c.is_active === false && <span className="b fail">inactive</span>}
                <span className="ct">{c.qualifications} quals · {c.sessions} sessions</span>
              </div>
              <div className="cbody">
                <CourseEdit course={c} onSaved={reloadAll} />
                <QualSection scheme={c.scheme} schemes={allSchemes} cats={(cats || []).filter((x) => x.scheme === c.scheme)} onChanged={reloadAll} />
              </div>
            </div>
          )
        })}

        {orphanSchemes.length > 0 && (
          <div className="card" style={{ marginTop: 18, border: '1px solid #e3b341' }}>
            <h3 style={{ background: '#fff8e6' }}>⚠️ Qualifications with no course product <span className="tag">{orphanSchemes.length} schemes</span></h3>
            <div className="body">
              <p className="small muted">These schemes have qualifications but no bookable course, so they can't be scheduled yet. Move the qualifications into a scheme that has a course, or add a course for the scheme.</p>
              {orphanSchemes.map((s) => (
                <div className="cgroup" key={s}>
                  <div className="ch"><span className="nm">{s}</span>{schemeTotal(s) > 0 && <span className="b pass">all modules {money(schemeTotal(s))}</span>}<span className="ct">{(cats || []).filter((x) => x.scheme === s).length} quals · no course</span></div>
                  <div className="cbody">
                    <QualSection scheme={s} schemes={allSchemes} cats={(cats || []).filter((x) => x.scheme === s)} onChanged={reloadAll} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SchemeDatalist({ schemes }) {
  return <datalist id="schemes-list">{schemes.map((s) => <option key={s} value={s} />)}</datalist>
}

function Field({ label, v, on, placeholder }) {
  return (
    <div className="field">
      <label className="fl">{label}</label>
      <input type="text" value={v} placeholder={placeholder} onChange={(e) => on(e.target.value)} />
    </div>
  )
}

function ConfirmDelete({ what, onConfirm }) {
  const [armed, setArmed] = useState(false)
  if (!armed) return <button className="btn ghost sm danger" onClick={() => setArmed(true)}>Delete</button>
  return (
    <span className="nowrap">
      <span className="small" style={{ color: '#c0392b', marginRight: 6 }}>Delete {what}?</span>
      <button className="btn sm danger" onClick={async () => { try { await onConfirm() } catch (e) { toast(e.message) } }}>Yes, delete</button>{' '}
      <button className="btn ghost sm" onClick={() => setArmed(false)}>Cancel</button>
    </span>
  )
}

function AddCourse({ onDone }) {
  const [d, setD] = useState({ name: '', scheme: '', price: '', teamup_designator: '' })
  async function save() {
    if (!d.name.trim() || !d.scheme.trim()) return toast('Name and scheme are required')
    await createCourse({ name: d.name.trim(), scheme: d.scheme.trim(), price: d.price === '' ? null : Number(d.price), teamup_designator: d.teamup_designator || null, is_active: true })
    toast(`Course added: ${d.name.trim()}`)
    onDone()
  }
  return (
    <div className="subform" style={{ background: '#fff' }}>
      <div className="sfh">New course</div>
      <div className="twocol">
        <Field label="Name" v={d.name} on={(v) => setD({ ...d, name: v })} placeholder="e.g. Domestic Gas ACS" />
        <div className="field">
          <label className="fl">Scheme</label>
          <input type="text" list="schemes-list" value={d.scheme} placeholder="e.g. ACS Domestic" onChange={(e) => setD({ ...d, scheme: e.target.value })} />
        </div>
      </div>
      <div className="twocol">
        <Field label="Package price (£, optional)" v={d.price} on={(v) => setD({ ...d, price: v })} placeholder="leave blank — price by module" />
        <Field label="Teamup designator (optional)" v={d.teamup_designator} on={(v) => setD({ ...d, teamup_designator: v })} />
      </div>
      <button className="btn sm" onClick={save}>Add course</button>
    </div>
  )
}

function AddQualGlobal({ schemes, onDone }) {
  const [d, setD] = useState({ code: '', description: '', scheme: '', renewal_years: '5', price: '' })
  async function save() {
    if (!d.code.trim()) return toast('Code is required')
    if (!d.scheme.trim()) return toast('Scheme is required')
    await createCategory({ code: d.code.trim().toUpperCase(), description: d.description || null, scheme: d.scheme.trim(), renewal_years: d.renewal_years === '' ? null : Number(d.renewal_years), price: d.price === '' ? null : Number(d.price) })
    toast(`Qualification added: ${d.code.trim().toUpperCase()}`)
    onDone()
  }
  return (
    <div className="subform" style={{ background: '#fff' }}>
      <div className="sfh">New qualification (module)</div>
      <div className="twocol">
        <Field label="Code" v={d.code} on={(v) => setD({ ...d, code: v })} placeholder="e.g. CCN1" />
        <div className="field">
          <label className="fl">Scheme</label>
          <input type="text" list="schemes-list" value={d.scheme} placeholder="e.g. ACS Domestic (or a new one)" onChange={(e) => setD({ ...d, scheme: e.target.value })} />
        </div>
      </div>
      <div className="twocol">
        <Field label="Description" v={d.description} on={(v) => setD({ ...d, description: v })} />
        <Field label="Price (£, optional)" v={d.price} on={(v) => setD({ ...d, price: v })} />
      </div>
      <Field label="Renewal (years, blank = non-expiring)" v={d.renewal_years} on={(v) => setD({ ...d, renewal_years: v })} />
      <button className="btn sm" onClick={save}>Add qualification</button>
    </div>
  )
}

function CourseEdit({ course, onSaved }) {
  const [d, setD] = useState({ name: course.name || '', scheme: course.scheme || '', price: course.price ?? '', teamup_designator: course.teamup_designator || '', is_active: course.is_active !== false })
  async function save() {
    if (!d.name.trim()) return toast('Course name is required')
    if (!d.scheme.trim()) return toast('Scheme is required')
    await updateCourse(course.course_id, { name: d.name.trim(), scheme: d.scheme.trim(), price: d.price === '' ? null : Number(d.price), teamup_designator: d.teamup_designator || null, is_active: d.is_active })
    toast('Course updated')
    onSaved()
  }
  async function remove() {
    await deleteCourse(course.course_id)
    toast(`Course deleted: ${course.name}`)
    onSaved()
  }
  return (
    <div className="subform">
      <div className="sfh">Edit course</div>
      <div className="twocol">
        <Field label="Name" v={d.name} on={(v) => setD({ ...d, name: v })} />
        <div className="field">
          <label className="fl">Scheme (move)</label>
          <input type="text" list="schemes-list" value={d.scheme} onChange={(e) => setD({ ...d, scheme: e.target.value })} />
        </div>
      </div>
      <div className="twocol">
        <Field label="Package price (£, optional)" v={d.price} on={(v) => setD({ ...d, price: v })} placeholder="leave blank — price by module" />
        <Field label="Teamup designator" v={d.teamup_designator} on={(v) => setD({ ...d, teamup_designator: v })} />
      </div>
      <div className="twocol">
        <div className="field">
          <label className="fl">Status</label>
          <label className="chk"><input type="checkbox" checked={d.is_active} onChange={(e) => setD({ ...d, is_active: e.target.checked })} /> Active (bookable)</label>
        </div>
        <div className="field" style={{ alignSelf: 'end' }}>
          <ConfirmDelete what="this course" onConfirm={remove} />
        </div>
      </div>
      <button className="btn sm" onClick={save}>Save course</button>
    </div>
  )
}

function QualSection({ scheme, schemes, cats, onChanged }) {
  const [adding, setAdding] = useState(false)
  return (
    <div style={{ marginTop: 6 }}>
      <div className="fl" style={{ display: 'flex', alignItems: 'center' }}>
        Qualifications in {scheme || 'this scheme'}
        <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '＋ Add qualification'}</button>
      </div>
      {adding && <AddQual scheme={scheme} onDone={() => { setAdding(false); onChanged() }} />}
      <table>
        <thead><tr><th>Code</th><th>Description</th><th>Price</th><th>Renewal</th><th>Move to scheme</th><th></th></tr></thead>
        <tbody>
          {cats.length === 0 && <tr><td colSpan={6} className="empty">No qualifications in this scheme yet</td></tr>}
          {cats.map((c) => <QualRow key={c.category_id} c={c} schemes={schemes} onSaved={onChanged} />)}
        </tbody>
      </table>
    </div>
  )
}

function QualRow({ c, schemes, onSaved }) {
  const [edit, setEdit] = useState(false)
  const [d, setD] = useState({ code: c.code, description: c.description || '', renewal_years: c.renewal_years ?? '', price: c.price ?? '' })
  async function save() {
    if (!d.code.trim()) return toast('Code is required')
    await updateCategory(c.category_id, { code: d.code.trim().toUpperCase(), description: d.description || null, renewal_years: d.renewal_years === '' ? null : Number(d.renewal_years), price: d.price === '' ? null : Number(d.price) })
    toast('Qualification updated')
    setEdit(false); onSaved()
  }
  async function move(newScheme) {
    if (!newScheme || newScheme === c.scheme) return
    await updateCategory(c.category_id, { scheme: newScheme })
    toast(`${c.code} moved to ${newScheme}`)
    onSaved()
  }
  async function remove() {
    await deleteCategory(c.category_id)
    toast(`Qualification deleted: ${c.code}`)
    onSaved()
  }
  if (!edit) return (
    <tr>
      <td><b>{c.code}</b></td>
      <td className="small">{c.description}</td>
      <td className="small nowrap">{money(c.price)}</td>
      <td className="small nowrap">{c.renewal_years ? c.renewal_years + ' yr' : '—'}</td>
      <td>
        <select className="movesel" value={c.scheme} onChange={(e) => move(e.target.value)}>
          {!schemes.includes(c.scheme) && <option value={c.scheme}>{c.scheme}</option>}
          {schemes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td className="nowrap"><button className="btn ghost sm" onClick={() => setEdit(true)}>Edit</button> <ConfirmDelete what={c.code} onConfirm={remove} /></td>
    </tr>
  )
  return (
    <tr>
      <td><input type="text" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} style={{ textTransform: 'uppercase', maxWidth: 90 }} /></td>
      <td><input type="text" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></td>
      <td><input type="text" value={d.price} placeholder="£" onChange={(e) => setD({ ...d, price: e.target.value })} style={{ maxWidth: 70 }} /></td>
      <td><input type="text" value={d.renewal_years} onChange={(e) => setD({ ...d, renewal_years: e.target.value })} style={{ maxWidth: 60 }} /></td>
      <td className="small muted">save first to move</td>
      <td className="nowrap"><button className="btn sm" onClick={save}>Save</button> <button className="btn ghost sm" onClick={() => setEdit(false)}>✕</button></td>
    </tr>
  )
}

function AddQual({ scheme, onDone }) {
  const [d, setD] = useState({ code: '', description: '', renewal_years: '5', price: '' })
  async function save() {
    if (!d.code.trim()) return toast('Code is required')
    await createCategory({ code: d.code.trim().toUpperCase(), description: d.description || null, scheme, renewal_years: d.renewal_years === '' ? null : Number(d.renewal_years), price: d.price === '' ? null : Number(d.price) })
    toast(`Qualification added: ${d.code.trim().toUpperCase()}`)
    onDone()
  }
  return (
    <div className="addqual">
      <div className="addqual-row">
        <input type="text" placeholder="Code (e.g. CCN1)" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} style={{ textTransform: 'uppercase' }} />
        <input type="text" placeholder="Description" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        <input type="text" placeholder="£ price" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} style={{ maxWidth: 90 }} />
        <input type="text" placeholder="Renewal yrs" value={d.renewal_years} onChange={(e) => setD({ ...d, renewal_years: e.target.value })} style={{ maxWidth: 100 }} />
        <button className="btn sm" onClick={save}>Add</button>
      </div>
    </div>
  )
}
