import { useState } from 'react'
import { listCourses, listCategories, createCourse, updateCourse, createCategory, updateCategory } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { toast } from '../lib/toast.js'

export default function Courses() {
  const { data: courses, loading, reload } = useData(listCourses)
  const { data: cats, reload: reloadCats } = useData(listCategories)
  const [open, setOpen] = useState(() => new Set())
  const [adding, setAdding] = useState(false)
  if (loading || !courses) return <div className="loading">Loading courses…</div>

  const toggle = (id) => setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="card">
      <h3>📚 Courses &amp; qualifications <span className="tag">{courses.length} courses</span></h3>
      <div className="body">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span className="small muted">Click a course to rename it, set a price, or manage its qualifications.</span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '＋ Add course'}</button>
        </div>
        {adding && <AddCourse onDone={() => { setAdding(false); reload() }} />}

        {courses.map((c) => (
          <div className={'cgroup' + (open.has(c.course_id) ? '' : ' collapsed')} key={c.course_id}>
            <div className="ch" onClick={() => toggle(c.course_id)}>
              <span className="tw">▼</span>
              <span className="nm">{c.name}</span>
              <span className="b scheme">{c.scheme || '—'}</span>
              {c.price != null && <span className="b due">£{c.price}</span>}
              {c.is_active === false && <span className="b fail">inactive</span>}
              <span className="ct">{c.qualifications} quals · {c.sessions} sessions</span>
            </div>
            <div className="cbody">
              <CourseEdit course={c} onSaved={reload} />
              <QualSection scheme={c.scheme} cats={(cats || []).filter((x) => x.scheme === c.scheme)} onChanged={reloadCats} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Field({ label, v, on, placeholder }) {
  return (
    <div className="field">
      <label className="fl">{label}</label>
      <input type="text" value={v} placeholder={placeholder} onChange={(e) => on(e.target.value)} />
    </div>
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
        <Field label="Scheme" v={d.scheme} on={(v) => setD({ ...d, scheme: v })} placeholder="e.g. ACS Domestic" />
      </div>
      <div className="twocol">
        <Field label="Price (£, optional)" v={d.price} on={(v) => setD({ ...d, price: v })} />
        <Field label="Teamup designator (optional)" v={d.teamup_designator} on={(v) => setD({ ...d, teamup_designator: v })} />
      </div>
      <button className="btn sm" onClick={save}>Add course</button>
    </div>
  )
}

function CourseEdit({ course, onSaved }) {
  const [d, setD] = useState({ name: course.name || '', price: course.price ?? '', teamup_designator: course.teamup_designator || '', is_active: course.is_active !== false })
  async function save() {
    if (!d.name.trim()) return toast('Course name is required')
    await updateCourse(course.course_id, { name: d.name.trim(), price: d.price === '' ? null : Number(d.price), teamup_designator: d.teamup_designator || null, is_active: d.is_active })
    toast('Course updated')
    onSaved()
  }
  return (
    <div className="subform">
      <div className="sfh">Edit course</div>
      <div className="twocol">
        <Field label="Name" v={d.name} on={(v) => setD({ ...d, name: v })} />
        <Field label="Price (£, optional)" v={d.price} on={(v) => setD({ ...d, price: v })} placeholder="—" />
      </div>
      <div className="twocol">
        <Field label="Teamup designator" v={d.teamup_designator} on={(v) => setD({ ...d, teamup_designator: v })} />
        <div className="field">
          <label className="fl">Status</label>
          <label className="chk"><input type="checkbox" checked={d.is_active} onChange={(e) => setD({ ...d, is_active: e.target.checked })} /> Active (bookable)</label>
        </div>
      </div>
      <button className="btn sm" onClick={save}>Save course</button>
    </div>
  )
}

function QualSection({ scheme, cats, onChanged }) {
  const [adding, setAdding] = useState(false)
  return (
    <div style={{ marginTop: 6 }}>
      <div className="fl" style={{ display: 'flex', alignItems: 'center' }}>
        Qualifications in {scheme || 'this scheme'}
        <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '＋ Add qualification'}</button>
      </div>
      {adding && <AddQual scheme={scheme} onDone={() => { setAdding(false); onChanged() }} />}
      <table>
        <thead><tr><th>Code</th><th>Description</th><th>Renewal</th><th></th></tr></thead>
        <tbody>
          {cats.length === 0 && <tr><td colSpan={4} className="empty">No qualifications in this scheme yet</td></tr>}
          {cats.map((c) => <QualRow key={c.category_id} c={c} onSaved={onChanged} />)}
        </tbody>
      </table>
    </div>
  )
}

function QualRow({ c, onSaved }) {
  const [edit, setEdit] = useState(false)
  const [d, setD] = useState({ code: c.code, description: c.description || '', renewal_years: c.renewal_years ?? '' })
  async function save() {
    if (!d.code.trim()) return toast('Code is required')
    await updateCategory(c.category_id, { code: d.code.trim().toUpperCase(), description: d.description || null, renewal_years: d.renewal_years === '' ? null : Number(d.renewal_years) })
    toast('Qualification updated')
    setEdit(false); onSaved()
  }
  if (!edit) return (
    <tr>
      <td><b>{c.code}</b></td>
      <td className="small">{c.description}</td>
      <td className="small nowrap">{c.renewal_years ? c.renewal_years + ' yr' : '—'}</td>
      <td><button className="btn ghost sm" onClick={() => setEdit(true)}>Edit</button></td>
    </tr>
  )
  return (
    <tr>
      <td><input type="text" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} style={{ textTransform: 'uppercase' }} /></td>
      <td><input type="text" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></td>
      <td><input type="text" value={d.renewal_years} onChange={(e) => setD({ ...d, renewal_years: e.target.value })} style={{ maxWidth: 70 }} /></td>
      <td className="nowrap"><button className="btn sm" onClick={save}>Save</button> <button className="btn ghost sm" onClick={() => setEdit(false)}>✕</button></td>
    </tr>
  )
}

function AddQual({ scheme, onDone }) {
  const [d, setD] = useState({ code: '', description: '', renewal_years: '5' })
  async function save() {
    if (!d.code.trim()) return toast('Code is required')
    await createCategory({ code: d.code.trim().toUpperCase(), description: d.description || null, scheme, renewal_years: d.renewal_years === '' ? null : Number(d.renewal_years) })
    toast(`Qualification added: ${d.code.trim().toUpperCase()}`)
    onDone()
  }
  return (
    <div className="addqual">
      <div className="addqual-row">
        <input type="text" placeholder="Code (e.g. CCN1)" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} style={{ textTransform: 'uppercase' }} />
        <input type="text" placeholder="Description" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        <input type="text" placeholder="Renewal yrs" value={d.renewal_years} onChange={(e) => setD({ ...d, renewal_years: e.target.value })} style={{ maxWidth: 110 }} />
        <button className="btn sm" onClick={save}>Add</button>
      </div>
    </div>
  )
}
