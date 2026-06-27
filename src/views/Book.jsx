import { useEffect, useMemo, useState } from 'react'
import { listDelegates, listCompanies, listCategories, listCourses, createClient, createCompany, addToPool, createMLP } from '../lib/api.js'
import { lookupPostcode } from '../lib/postcode.js'
import { useData } from '../lib/hooks.js'
import { toast } from '../lib/toast.js'

// Schemes that count as a "gas certification" — only then is IGAS evidence
// relevant (§4.2). Adjustable: OFTEC (oil), Renewables, Solid Fuel, Electrical,
// F-gas and Water are deliberately excluded.
const GAS_SCHEMES = new Set(['ACS Domestic', 'ACS Commercial', 'LPG', 'Catering'])

const EMPTY_OPTS = { mlp: false, igas: false, prefFrom: '', prefTo: '' }

export default function Book({ prefill = null }) {
  const { data: delegates, loading: l1, reload: reloadDelegates } = useData(listDelegates)
  const { data: companies, loading: l2, reload: reloadCompanies } = useData(listCompanies)
  const { data: categories, loading: l3 } = useData(listCategories)
  const { data: courses, loading: l4 } = useData(listCourses)

  const [clientId, setClientId] = useState('')
  const [query, setQuery] = useState('')
  const [catKind, setCatKind] = useState(() => new Map()) // category_id -> 'REASSESS' | 'NEW'
  const [collapsed, setCollapsed] = useState({})
  const [opts, setOpts] = useState(EMPTY_OPTS)
  const [mlpCourses, setMlpCourses] = useState(() => new Set())
  const [showNewClient, setShowNewClient] = useState(false)
  const [showNewCompany, setShowNewCompany] = useState(false)
  const [nc, setNc] = useState({ forename: '', surname: '', ni_number: '', date_of_birth: '', mobile: '', email: '', company_id: '', premise: '', street: '', town: '', county: '', postcode: '' })
  const [nco, setNco] = useState({ name: '', address: '', contact_name: '', phone: '', email: '', sage_ref: '' })

  // Convert-from-inquiry: open the new-delegate form pre-filled from the inquiry.
  useEffect(() => {
    if (!prefill) return
    const parts = (prefill.name || '').trim().split(/\s+/)
    const forename = parts.shift() || ''
    const surname = parts.join(' ')
    setNc((p) => ({ ...p, forename, surname, email: prefill.email || '', mobile: prefill.mobile || '' }))
    setShowNewClient(true)
  }, [prefill])

  const schemeName = useMemo(() => {
    const m = {}
    ;(courses || []).forEach((c) => { m[c.scheme] = c.name })
    return m
  }, [courses])

  const grouped = useMemo(() => {
    const g = {}
    ;(categories || []).forEach((c) => { (g[c.scheme] = g[c.scheme] || []).push(c) })
    return g
  }, [categories])

  const catById = useMemo(() => { const m = new Map(); (categories || []).forEach((c) => m.set(c.category_id, c)); return m }, [categories])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return delegates || []
    return (delegates || []).filter((d) =>
      `${d.forename} ${d.surname}`.toLowerCase().includes(q) ||
      (d.company || '').toLowerCase().includes(q) ||
      (d.ni_number || '').toLowerCase().includes(q))
  }, [delegates, query])

  if (l1 || l2 || l3 || l4) return <div className="loading">Loading…</div>

  const selectedClient = delegates.find((d) => String(d.client_id) === String(clientId))
  const hasGasQual = categories.some((c) => catKind.has(c.category_id) && GAS_SCHEMES.has(c.scheme))
  // IGAS only applies to gas certs; auto-off when no gas qualification is ticked.
  const igasEffective = opts.igas && hasGasQual
  const money = (v) => (v == null ? '—' : '£' + Number(v).toFixed(2).replace(/\.00$/, ''))
  const selected = [...catKind.entries()].map(([id, kind]) => ({ cat: catById.get(id), kind })).filter((x) => x.cat)
  const selByScheme = {}
  for (const x of selected) (selByScheme[x.cat.scheme] = selByScheme[x.cat.scheme] || []).push(x)
  const totalPrice = selected.reduce((n, x) => n + (x.cat.price != null ? Number(x.cat.price) : 0), 0)
  const pricedCount = selected.filter((x) => x.cat.price != null).length

  // Click a qualification to cycle: off -> Reassessment -> New -> off.
  function cycleCat(id) {
    setCatKind((prev) => {
      const n = new Map(prev)
      const cur = n.get(id)
      if (!cur) n.set(id, 'REASSESS')
      else if (cur === 'REASSESS') n.set(id, 'NEW')
      else n.delete(id)
      return n
    })
  }

  async function saveCompany() {
    if (!nco.name.trim()) return toast('Company name required')
    const row = await createCompany(nco)
    reloadCompanies()
    setNc((p) => ({ ...p, company_id: String(row.company_id) }))
    setNco({ name: '', address: '', contact_name: '', phone: '', email: '', sage_ref: '' })
    setShowNewCompany(false)
    toast(`Company added: ${row.name}`)
  }

  async function saveClient() {
    if (!nc.forename.trim() || !nc.surname.trim()) return toast('Forename and surname required')
    if (!nc.company_id) return toast('Pick or add a company')
    const row = await createClient({ ...nc, company_id: Number(nc.company_id) })
    reloadDelegates()
    setClientId(String(row.client_id))
    setNc({ forename: '', surname: '', ni_number: '', date_of_birth: '', mobile: '', email: '', company_id: '', premise: '', street: '', town: '', county: '', postcode: '' })
    setShowNewClient(false)
    toast(`Delegate added: ${row.forename} ${row.surname}`)
  }

  // Sole-trader helper: open the New company form pre-filled from the delegate's
  // own details (address, contact, phone, email). User just adds the trading name.
  function copyToCompany() {
    const addr = [[nc.premise, nc.street].filter(Boolean).join(' '), nc.town, nc.county, nc.postcode].filter(Boolean).join(', ')
    setNco({
      name: '', address: addr,
      contact_name: `${nc.forename} ${nc.surname}`.trim(),
      phone: nc.mobile || '', email: nc.email || '', sage_ref: '', _postcode: nc.postcode || '',
    })
    setShowNewCompany(true)
  }

  async function createBooking() {
    if (!clientId) return toast('Pick a delegate first')
    if (catKind.size === 0) return toast('Set at least one qualification (click to choose Reassessment or New)')
    if (opts.mlp && mlpCourses.size === 0) return toast('Pick the courses in this MLP, or untick MLP')
    const cats = categories.filter((c) => catKind.has(c.category_id)).map((c) => ({ category_id: c.category_id, scheme: c.scheme, kind: catKind.get(c.category_id) }))
    try {
      await addToPool(selectedClient, cats, {
        mlp: opts.mlp, igas: igasEffective,
        prefFrom: opts.prefFrom || null, prefTo: opts.prefTo || null,
      })
    } catch (e) { return toast('Could not save booking: ' + e.message) }
    if (opts.mlp && mlpCourses.size) await createMLP(selectedClient.client_id, [...mlpCourses])
    const schemes = [...new Set(cats.map((c) => schemeName[c.scheme] || c.scheme))]
    const kinds = new Set([...catKind.values()])
    const typeLabel = kinds.size > 1 ? 'Mixed (new + reassessment)' : (kinds.has('REASSESS') ? 'Reassessment' : 'New')
    const tags = [typeLabel, opts.mlp && `MLP (${mlpCourses.size} courses)`, igasEffective && 'IGAS'].filter(Boolean).join(', ')
    toast(`${selectedClient.forename} ${selectedClient.surname} → ${schemes.join(' + ')} pool · ${tags} · ${catKind.size} qualifications`)
    setClientId(''); setCatKind(new Map()); setOpts(EMPTY_OPTS); setMlpCourses(new Set()); setQuery('')
  }

  return (
    <>
      <div className="row c2">
        <div className="card">
          <h3>① Delegate &amp; company</h3>
          <div className="body">
            <div className="field">
              <label className="fl">Delegate</label>
              <input className="search" placeholder="Search name, company or NI…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="inrow" style={{ marginTop: 8 }}>
                <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">— choose delegate{query ? ` (${filtered.length} match${filtered.length === 1 ? '' : 'es'})` : ''} —</option>
                  {filtered.map((d) => <option key={d.client_id} value={d.client_id}>{d.forename} {d.surname} · {d.company}</option>)}
                </select>
                <button className="btn ghost sm" onClick={() => { setShowNewClient(!showNewClient); setShowNewCompany(false) }}>＋ New</button>
              </div>
            </div>

            {showNewClient && (
              <div className="subform">
                <div className="sfh">New delegate</div>
                <div className="twocol">
                  <Inp label="Forename" v={nc.forename} on={(v) => setNc({ ...nc, forename: v })} />
                  <Inp label="Surname" v={nc.surname} on={(v) => setNc({ ...nc, surname: v })} />
                </div>
                <div className="twocol">
                  <Inp label="NI number" v={nc.ni_number} on={(v) => setNc({ ...nc, ni_number: v })} placeholder="AB123456C" />
                  <Inp label="Date of birth" type="date" v={nc.date_of_birth} on={(v) => setNc({ ...nc, date_of_birth: v })} />
                </div>
                <div className="twocol">
                  <Inp label="Mobile" v={nc.mobile} on={(v) => setNc({ ...nc, mobile: v })} />
                  <Inp label="Email" v={nc.email} on={(v) => setNc({ ...nc, email: v })} />
                </div>
                <div className="twocol">
                  <Inp label="House name / number" v={nc.premise} on={(v) => setNc({ ...nc, premise: v })} />
                  <Inp label="Street" v={nc.street} on={(v) => setNc({ ...nc, street: v })} />
                </div>
                <PostcodeLookup value={nc.postcode} onChange={(v) => setNc({ ...nc, postcode: v })}
                  onResolved={(a) => setNc((p) => ({ ...p, postcode: a.postcode, town: a.town || p.town, county: a.county || p.county }))} />
                <div className="twocol">
                  <Inp label="Town" v={nc.town} on={(v) => setNc({ ...nc, town: v })} />
                  <Inp label="County" v={nc.county} on={(v) => setNc({ ...nc, county: v })} />
                </div>
                <div className="field">
                  <label className="fl">Associated company <span className="muted">(pays for their courses)</span></label>
                  <div className="inrow">
                    <select value={nc.company_id} onChange={(e) => setNc({ ...nc, company_id: e.target.value })}>
                      <option value="">— add to existing company —</option>
                      {companies.map((c) => <option key={c.company_id} value={c.company_id}>{c.name}</option>)}
                    </select>
                    <button className="btn ghost sm" onClick={() => setShowNewCompany(!showNewCompany)}>＋ New</button>
                  </div>
                  <button className="btn ghost sm" type="button" style={{ marginTop: 6 }} onClick={copyToCompany} title="Sole trader? Create their company from these details — just add the trading name.">📋 Copy delegate → new company</button>
                </div>
                {showNewCompany && (
                  <div className="subform" style={{ background: '#fff' }}>
                    <div className="sfh">New company</div>
                    <Inp label="Company name" v={nco.name} on={(v) => setNco({ ...nco, name: v })} />
                    <Inp label="Address" v={nco.address} on={(v) => setNco({ ...nco, address: v })} />
                    <PostcodeLookup value={nco._postcode || ''} onChange={(v) => setNco({ ...nco, _postcode: v })}
                      onResolved={(a) => setNco((p) => ({ ...p, _postcode: a.postcode, address: p.address?.trim() ? p.address : [a.town, a.county, a.postcode].filter(Boolean).join(', ') }))} />
                    <div className="twocol">
                      <Inp label="Contact" v={nco.contact_name} on={(v) => setNco({ ...nco, contact_name: v })} />
                      <Inp label="Phone" v={nco.phone} on={(v) => setNco({ ...nco, phone: v })} />
                    </div>
                    <div className="twocol">
                      <Inp label="Email" v={nco.email} on={(v) => setNco({ ...nco, email: v })} />
                      <Inp label="Sage ref" v={nco.sage_ref} on={(v) => setNco({ ...nco, sage_ref: v })} />
                    </div>
                    <div className="inrow">
                      <button className="btn sm" onClick={saveCompany}>Save company</button>
                      <button className="btn ghost sm" onClick={() => setShowNewCompany(false)}>Cancel</button>
                    </div>
                  </div>
                )}
                <div className="inrow">
                  <button className="btn sm" onClick={saveClient}>Save delegate</button>
                  <button className="btn ghost sm" onClick={() => setShowNewClient(false)}>Cancel</button>
                </div>
              </div>
            )}

            <div className="field">
              <label className="fl">Invoiced to</label>
              <div style={{ padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, background: '#f7f9fc', color: 'var(--slate)' }}>
                {selectedClient ? selectedClient.company : '— select a delegate —'}
              </div>
              <div className="small muted" style={{ marginTop: 5 }}>Always the delegate's associated company — no other payer.</div>
            </div>

            <div className="subform">
              <div className="sfh">Booking options</div>
              <div className="field">
                <label className="fl">Assessment type</label>
                <div className="small muted">Set <b>per qualification</b> on the right — click one to cycle <b style={{ color: '#0a5ad6' }}>Reassessment</b> → <b style={{ color: '#1a8a4b' }}>New</b> → off. A delegate can mix both in one booking.</div>
              </div>
              <label className="chk"><input type="checkbox" checked={opts.mlp} onChange={(e) => setOpts({ ...opts, mlp: e.target.checked })} /> On a Managed Learning Programme (MLP)</label>
              {opts.mlp && (
                <div className="mlp-pick">
                  <div className="small muted" style={{ marginBottom: 4 }}>Courses in this programme ({mlpCourses.size} picked) — they knock off as the delegate passes each one:</div>
                  {courses.map((c) => (
                    <label className="chk" key={c.course_id}>
                      <input type="checkbox" checked={mlpCourses.has(c.course_id)} onChange={(e) => {
                        setMlpCourses((prev) => { const n = new Set(prev); e.target.checked ? n.add(c.course_id) : n.delete(c.course_id); return n })
                      }} /> {c.name}
                    </label>
                  ))}
                </div>
              )}
              <label className={'chk' + (hasGasQual ? '' : ' disabled')} title={hasGasQual ? '' : 'Only applies when a gas qualification is selected'}>
                <input type="checkbox" disabled={!hasGasQual} checked={igasEffective} onChange={(e) => setOpts({ ...opts, igas: e.target.checked })} /> IGAS evidence required {hasGasQual ? '' : '(gas courses only)'}
              </label>
              <div className="twocol" style={{ margintop: 6 }}>
                <Inp label="Preferred from (optional)" type="date" v={opts.prefFrom} on={(v) => setOpts({ ...opts, prefFrom: v })} />
                <Inp label="Preferred to (optional)" type="date" v={opts.prefTo} on={(v) => setOpts({ ...opts, prefTo: v })} />
              </div>
            </div>

            <div className="small muted">Tick qualifications on the right. The delegate joins the <b>unscheduled pool</b> for each course group you tick.</div>

            <div className="basket">
              <div className="basket-h">🧾 Selected qualifications <span className="tag">{catKind.size}</span></div>
              {catKind.size === 0 ? (
                <div className="muted small" style={{ padding: '8px 0' }}>None yet — tick qualifications on the right and they list here, grouped by course, with a running cost.</div>
              ) : (
                <>
                  {Object.entries(selByScheme).map(([scheme, items]) => (
                    <div className="basket-grp" key={scheme}>
                      <div className="basket-grp-h">{schemeName[scheme] || scheme} <span className="muted">({items.length})</span></div>
                      {items.map(({ cat, kind }) => (
                        <div className="basket-row" key={cat.category_id}>
                          <span className="b" style={{ background: kind === 'REASSESS' ? '#0a5ad6' : '#1a8a4b', color: '#fff' }}>{kind === 'REASSESS' ? 'Re' : 'New'}</span>
                          <span className="basket-code">{cat.code}</span>
                          <span className="basket-desc muted small">{cat.description}</span>
                          <span className="basket-price">{money(cat.price)}</span>
                          <button className="basket-x" title="Remove" onClick={() => setCatKind((prev) => { const nn = new Map(prev); nn.delete(cat.category_id); return nn })}>✕</button>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="basket-total"><span>Estimated cost</span><b>{money(totalPrice)}</b></div>
                  {pricedCount < selected.length && <div className="muted small" style={{ marginTop: 4 }}>{selected.length - pricedCount} module(s) have no price set yet — total is partial. Discounts/VAT come later.</div>}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <h3>② Qualifications to attempt <span className="tag">{catKind.size} selected</span></h3>
          <div className="body">
            <div className="hint">Click each qualification to cycle <b style={{ color: '#0a5ad6' }}>Reassessment</b> → <b style={{ color: '#1a8a4b' }}>New</b> → off. Set <b>once, here</b>; after the assessment you flip these to pass/fail.</div>
            {Object.entries(grouped).map(([scheme, arr]) => {
              const sel = arr.filter((c) => catKind.has(c.category_id)).length
              const isCollapsed = collapsed[scheme] ?? true
              return (
                <div className={'cgroup' + (isCollapsed ? ' collapsed' : '')} key={scheme}>
                  <div className="ch" onClick={() => setCollapsed({ ...collapsed, [scheme]: !isCollapsed })}>
                    <span className="tw">▼</span>
                    <span className="nm">{schemeName[scheme] || scheme}{GAS_SCHEMES.has(scheme) ? '' : ''}</span>
                    <span className="ct">{sel ? sel + ' / ' : ''}{arr.length}</span>
                  </div>
                  <div className="cbody">
                    <div className="cats">
                      {arr.map((c) => {
                        const k = catKind.get(c.category_id)
                        return (
                          <div className={'cat' + (k === 'REASSESS' ? ' k-re' : k === 'NEW' ? ' k-new' : '')} key={c.category_id} onClick={() => cycleCat(c.category_id)} title="Click to cycle: Reassessment -> New -> off">
                            <span className="catstate">{k === 'REASSESS' ? 'Re' : k === 'NEW' ? 'New' : '+'}</span>
                            <span><span className="code">{c.code}</span><span className="desc">{c.description}</span></span>
                            <span className="yr">{c.renewal_years ? c.renewal_years + 'yr' : '—'}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn" onClick={createBooking}>Create booking</button>
        <span className="muted small">Adds the delegate to the unscheduled pool. Confirmation email queues automatically (Flow 1).</span>
      </div>
    </>
  )
}

function PostcodeLookup({ value, onChange, onResolved }) {
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  async function look() {
    setBusy(true); setMsg({ text: 'Looking up…', cls: 'muted' })
    try {
      const a = await lookupPostcode(value)
      onResolved(a)
      setMsg({ text: `✓ ${a.postcode}${a.town ? ' · ' + a.town : ''}${a.county ? ', ' + a.county : ''}`, cls: 'ok' })
    } catch (e) {
      setMsg({ text: e.message, cls: 'error' })
    } finally { setBusy(false) }
  }
  return (
    <div className="field">
      <label className="fl">Postcode <span className="muted">(look up to fill town/county)</span></label>
      <div className="inrow">
        <input type="text" value={value} placeholder="e.g. FY1 4PT" style={{ textTransform: 'uppercase' }}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); look() } }} />
        <button className="btn ghost sm" type="button" disabled={busy} onClick={look}>🔍 Look up</button>
      </div>
      {msg && <div className={'pc-msg ' + msg.cls}>{msg.text}</div>}
    </div>
  )
}

function Inp({ label, v, on, type = 'text', placeholder }) {
  return (
    <div className="field">
      <label className="fl">{label}</label>
      <input type={type} value={v} placeholder={placeholder} onChange={(e) => on(e.target.value)} />
    </div>
  )
}
