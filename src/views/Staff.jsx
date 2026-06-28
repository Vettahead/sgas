import { useState } from 'react'
import { listStaff, createStaff } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { toast } from '../lib/toast.js'

export default function Staff() {
  const { data, loading, reload } = useData(listStaff)
  const [showAdd, setShowAdd] = useState(false)
  const [ns, setNs] = useState({ name: '', room: '', email: '' })

  if (loading || !data) return <div className="loading">Loading staff…</div>

  async function add() {
    if (!ns.name.trim()) return toast('Name is required')
    try {
      await createStaff(ns)
      toast(`Staff added: ${ns.name}`)
      setNs({ name: '', room: '', email: '' })
      setShowAdd(false)
      reload()
    } catch (e) { toast(e.message) }
  }

  return (
    <div className="card">
      <h3>🎓 Staff <span className="tag">{data.length} people</span>
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setShowAdd(!showAdd)}>＋ New staff</button>
      </h3>
      <div className="hint" style={{ margin: '14px 18px' }}>One shared list — anyone here can be assigned as <b>Trainer</b>, <b>Assessor</b> or <b>Verifier</b> on a course block.</div>

      {showAdd && (
        <div className="body">
          <div className="subform">
            <div className="sfh">New staff member</div>
            <div className="twocol">
              <Inp label="Name" v={ns.name} on={(v) => setNs({ ...ns, name: v })} />
              <Inp label="Room (optional)" v={ns.room} on={(v) => setNs({ ...ns, room: v })} />
            </div>
            <div className="twocol">
              <Inp label="Email" v={ns.email} on={(v) => setNs({ ...ns, email: v })} />
            </div>
            <div className="inrow">
              <button className="btn sm" onClick={add}>Add staff</button>
              <button className="btn ghost sm" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <table>
        <thead><tr><th>Name</th><th>Room</th><th>Email</th></tr></thead>
        <tbody>
          {data.map((s) => (
            <tr key={s.staff_id}>
              <td><b><span className="av" style={{ width: 12, height: 12, borderRadius: '50%', background: s.color, marginRight: 7 }}></span>{s.name}</b></td>
              <td>{s.room || '—'}</td>
              <td className="muted">{s.email || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Inp({ label, v, on }) {
  return (
    <div className="field">
      <label className="fl">{label}</label>
      <input type="text" value={v} onChange={(e) => on(e.target.value)} />
    </div>
  )
}
