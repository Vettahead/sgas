import { useEffect, useMemo, useState } from 'react'
import {
  searchDelegates, listCompanies, listBookableCategories, listClientCourses, createClient, createCompany,
  addToPool, createMLP, listBlocks, addDelegatesToBlock, getDelegateHistory, deleteBookingCategory,
} from '../lib/api.js'
import { lookupPostcode } from '../lib/postcode.js'
import { useData } from '../lib/hooks.js'
import { toast } from '../lib/toast.js'
import { fmt, todayISO } from '../lib/util.js'
import { renewalSummary, RENEWAL_BADGE } from '../lib/renewals.js'
import { loadLabel, dayLoad } from '../lib/seats.js'

// Schemes that count as a "gas certification" — only then is IGAS evidence
// relevant (§4.2). Adjustable: OFTEC (oil), Renewables, Solid Fuel, Electrical,
// F-gas and Water are deliberately excluded.
const GAS_SCHEMES = new Set(['ACS Domestic', 'ACS Commercial', 'LPG', 'Catering'])

const EMPTY_OPTS = { mlp: false, igas: false, prefFrom: '', prefTo: '' }

// How far ahead the course picker looks. Anything later than this is not a
// date anybody books over the phone; it is a plan.
const PICKER_MONTHS = 6

export default function Book({ prefill = null }) {
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')
  // Debounced -- otherwise every keystroke is its own database round trip.
  useEffect(() => {
    const t = setTimeout(() => setTerm(query), 250)
    return () => clearTimeout(t)
  }, [query])

  // Searches the DATABASE, not a list held in the browser. The old version
  // filtered whatever listDelegates() had returned, and PostgREST truncates an
  // unranged select at 1,000 rows -- so the search box was real but could only
  // ever see roughly surnames A-D. Do not go back to filtering a full list here.
  const { data: dres, loading: l1, reload: reloadDelegates } = useData(() => searchDelegates(term), [term])
  const delegates = dres?.rows || []
  const delegatesTotal = dres?.total
  const { data: companies, loading: l2, reload: reloadCompanies } = useData(listCompanies)
  const { data: categories, loading: l3 } = useData(listBookableCategories)
  const { data: courses, loading: l4 } = useData(listClientCourses)
  // Every scheduled course, so a delegate can be put straight onto dates.
  // Loaded once; the picker filters it down to the next few months of whatever
  // course groups the ticked qualifications belong to.
  const { data: blocks, reload: reloadBlocks } = useData(listBlocks)

  const [clientId, setClientId] = useState('')
  // The chosen delegate is HELD, not looked up: with a paged search the row can
  // easily not be in the page on screen when the booking is submitted.
  const [picked, setPicked] = useState(null)
  const [catKind, setCatKind] = useState(() => new Map()) // category_id -> 'REASSESS' | 'NEW'
  const [collapsed, setCollapsed] = useState({})
  const [qualFilter, setQualFilter] = useState('')
  const [opts, setOpts] = useState(EMPTY_OPTS)
  const [mlpCourses, setMlpCourses] = useState(() => new Set())
  const [showNewClient, setShowNewClient] = useState(false)
  const [showNewCompany, setShowNewCompany] = useState(false)
  const [nc, setNc] = useState({ forename: '', surname: '', ni_number: '', date_of_birth: '', mobile: '', email: '', company_id: '', premise: '', street: '', town: '', county: '', postcode: '' })
  const [nco, setNco] = useState({ name: '', address: '', contact_name: '', phone: '', email: '', sage_ref: '' })
  // scheme -> session id. A scheme with no pick goes to the waiting pool.
  const [sessionPick, setSessionPick] = useState(() => new Map())
  const [busy, setBusy] = useState(false)

  // Convert-from-enquiry: open the new-delegate form pre-filled from the
  // enquiry — AND put the name in the search box, so if this person is already
  // a delegate (the second-time-round caller) their record is sitting in the
  // list to pick, rather than a duplicate being created.
  useEffect(() => {
    if (!prefill) return
    // From a delegate's record ("Book them on a course"): the person is
    // already on file, so pick them — no new-delegate form.
    if (prefill.clientId) {
      const id = String(prefill.clientId)
      setClientId(id)
      getDelegateHistory(Number(id)).then((h) => {
        if (h?.client) { setPicked({ ...h.client, company: h.client.company }); setQuery(prefill.name || '') }
      }).catch(() => {})
      return
    }
    const parts = (prefill.name || '').trim().split(/\s+/)
    const forename = parts.shift() || ''
    const surname = parts.join(' ')
    setNc((p) => ({ ...p, forename, surname, email: prefill.email || '', mobile: prefill.mobile || '' }))
    setShowNewClient(true)
    if (surname) { setQuery(prefill.name.trim()); setTerm(prefill.name.trim()) }
  }, [prefill])

  // ── what the chosen delegate already holds ────────────────────────────────
  // Jen's ask: while booking somebody on, see what they have and when it runs
  // out, so "your water and plumbing is due in three months — do it the same
  // week" is a sentence she can say on the phone. Loaded when a delegate is
  // picked; refreshed after a wrong imported line is removed.
  const catById = useMemo(() => { const m = new Map(); (categories || []).forEach((c) => m.set(c.category_id, c)); return m }, [categories])
  const catByCode = useMemo(() => { const m = new Map(); (categories || []).forEach((c) => m.set(c.code, c)); return m }, [categories])
  const [held, setHeld] = useState(null) // renewalSummary rows, or null while loading / none picked
  const [heldTick, setHeldTick] = useState(0)
  useEffect(() => {
    if (!clientId) { setHeld(null); return }
    let alive = true
    setHeld(null)
    getDelegateHistory(Number(clientId))
      .then((h) => {
        if (!alive) return
        const rows = renewalSummary(h?.bookings || [])
        setHeld(rows)
        // Open the course groups they already hold something in — that is
        // almost always where the next booking lives.
        const open = {}
        for (const r of rows) { const c = catByCode.get(r.code); if (c) open[c.scheme] = false }
        setCollapsed((prev) => ({ ...prev, ...open }))
      })
      .catch(() => { if (alive) setHeld([]) })
    return () => { alive = false }
  }, [clientId, heldTick])

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


  // Upcoming, bookable runs by scheme: not internal, not already finished,
  // within the next few months, soonest first.
  const upcomingByScheme = useMemo(() => {
    const today = todayISO()
    const limit = new Date(); limit.setMonth(limit.getMonth() + PICKER_MONTHS)
    const lim = limit.toISOString().slice(0, 10)
    const out = {}
    for (const b of blocks || []) {
      if (b.isInternal || !b.scheme || !b.start) continue
      const end = b.end || b.start
      if (end < today || b.start > lim) continue
      ;(out[b.scheme] = out[b.scheme] || []).push(b)
    }
    for (const k of Object.keys(out)) out[k].sort((x, y) => x.start.localeCompare(y.start))
    return out
  }, [blocks])

  // Double-click guard for every save on this screen. Above the loading
  // return: a hook below it changes the hook count between renders.
  const [saving, setSaving] = useState(false)

  // Only the FIRST delegate load blocks the screen. Blocking on l1 afterwards
  // would tear the form down on every keystroke and throw away the focus.
  if (!dres || l2 || l3 || l4) return <div className="loading">Loading…</div>

  const selectedClient = (picked && String(picked.client_id) === String(clientId))
    ? picked
    : delegates.find((d) => String(d.client_id) === String(clientId))
  const hasGasQual = categories.some((c) => catKind.has(c.category_id) && GAS_SCHEMES.has(c.scheme))
  // IGAS only applies to gas certs; auto-off when no gas qualification is ticked.
  const igasEffective = opts.igas && hasGasQual
  const money = (v) => (v == null ? '—' : '£' + Number(v).toFixed(2).replace(/\.00$/, ''))
  const selected = [...catKind.entries()].map(([id, kind]) => ({ cat: catById.get(id), kind })).filter((x) => x.cat)
  const selByScheme = {}
  for (const x of selected) (selByScheme[x.cat.scheme] = selByScheme[x.cat.scheme] || []).push(x)
  const totalPrice = selected.reduce((n, x) => n + (x.cat.price != null ? Number(x.cat.price) : 0), 0)
  const pricedCount = selected.filter((x) => x.cat.price != null).length
  const schemesTicked = Object.keys(selByScheme)

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

  // From the "already holds" panel: put that qualification on this booking as
  // a reassessment — the renewal Jen has just talked them into.
  function addHeldAsReassess(row) {
    const c = catByCode.get(row.code)
    if (!c) return toast(`${row.code} is not on the bookable list`)
    setCatKind((prev) => { const n = new Map(prev); n.set(c.category_id, 'REASSESS'); return n })
    setCollapsed((p) => ({ ...p, [c.scheme]: false }))
    toast(`${row.code} added as a reassessment`)
  }

  // From the same panel: the imported record is wrong, take that line off.
  async function removeHeld(row) {
    if (!row.bcId) return toast('That one cannot be removed from here')
    const ok = window.confirm(`Remove ${row.code} — ${row.desc} — from ${selectedClient?.forename || 'this delegate'}'s record?\n\nOnly this qualification goes; the course it came from stays. Use it when the imported record says they hold something they never did.`)
    if (!ok) return
    try { await deleteBookingCategory(row.bcId); toast(`${row.code} removed`); setHeldTick((n) => n + 1) }
    catch (e) { toast('Could not remove it: ' + e.message) }
  }

  async function saveCompany() {
    if (saving) return
    if (!nco.name.trim()) return toast('Company name required')
    setSaving(true)
    let row
    try { row = await createCompany(nco) } catch (e) { setSaving(false); return toast('Could not save the company: ' + e.message) }
    setSaving(false)
    reloadCompanies()
    setNc((p) => ({ ...p, company_id: String(row.company_id) }))
    setNco({ name: '', address: '', contact_name: '', phone: '', email: '', sage_ref: '' })
    setShowNewCompany(false)
    toast(`Company added: ${row.name}`)
  }

  async function saveClient() {
    if (saving) return
    if (!nc.forename.trim() || !nc.surname.trim()) return toast('Forename and surname required')
    if (!nc.company_id) return toast('Pick or add a company')
    setSaving(true)
    let row
    try { row = await createClient({ ...nc, company_id: Number(nc.company_id) }) } catch (e) { setSaving(false); return toast('Could not save the delegate: ' + e.message) }
    setSaving(false)
    reloadDelegates()
    setClientId(String(row.client_id))
    setPicked(row)
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

  function pickSession(scheme, sessionId) {
    setSessionPick((prev) => {
      const n = new Map(prev)
      if (sessionId == null || n.get(scheme) === sessionId) n.delete(scheme); else n.set(scheme, sessionId)
      return n
    })
  }

  // ── the booking itself ────────────────────────────────────────────────────
  // One button. Each course group ticked becomes a booking; a group with a
  // course picked underneath goes straight onto those dates, a group without
  // one waits in the pool for Simon to place. Most calls are for a known date,
  // so the picker is offered first — but the pool is still there for "I want
  // a course that isn't scheduled yet".
  async function createBooking() {
    if (!clientId) return toast('Pick a delegate first')
    if (catKind.size === 0) return toast('Set at least one qualification (click to choose Reassessment or New)')
    if (opts.mlp && mlpCourses.size === 0) return toast('Pick the courses in this MLP, or untick MLP')
    const cats = categories.filter((c) => catKind.has(c.category_id)).map((c) => ({ category_id: c.category_id, scheme: c.scheme, kind: catKind.get(c.category_id) }))
    setBusy(true)
    let added
    try {
      added = await addToPool(selectedClient, cats, {
        mlp: opts.mlp, igas: igasEffective,
        prefFrom: opts.prefFrom || null, prefTo: opts.prefTo || null,
      })
    } catch (e) { setBusy(false); return toast('Could not save booking: ' + e.message) }
    if (opts.mlp && mlpCourses.size) await createMLP(selectedClient.client_id, [...mlpCourses])

    // Straight onto dates where a course was picked.
    const onto = []
    const pooled = []
    for (const e of added) {
      const sid = sessionPick.get(e.scheme)
      const blk = sid != null ? (blocks || []).find((b) => String(b.id) === String(sid)) : null
      if (blk) {
        try { await addDelegatesToBlock(blk.id, [e.id]); onto.push(blk) }
        catch (err) { toast(`Booked, but could not put them on ${blk.course}: ${err.message} — they are in the waiting pool`); pooled.push(e) }
      } else pooled.push(e)
    }
    setBusy(false)

    const kinds = new Set([...catKind.values()])
    const typeLabel = kinds.size > 1 ? 'Mixed (new + reassessment)' : (kinds.has('REASSESS') ? 'Reassessment' : 'New')
    const tags = [typeLabel, opts.mlp && `MLP (${mlpCourses.size} courses)`, igasEffective && 'IGAS'].filter(Boolean).join(', ')
    const who = `${selectedClient.forename} ${selectedClient.surname}`
    const parts = []
    if (onto.length) parts.push(onto.map((b) => `${b.course} ${fmt(b.start)}${b.end && b.end !== b.start ? '–' + fmt(b.end) : ''}`).join(' + '))
    if (pooled.length) parts.push(`${pooled.map((e) => schemeName[e.scheme] || e.scheme).join(' + ')} waiting pool`)
    toast(`${who} → ${parts.join(' · ')} · ${tags} · ${catKind.size} qualifications`)

    setClientId(''); setPicked(null); setCatKind(new Map()); setOpts(EMPTY_OPTS); setMlpCourses(new Set()); setQuery(''); setSessionPick(new Map())
    if (onto.length) reloadBlocks()
  }

  const pickedCount = schemesTicked.filter((s) => sessionPick.has(s)).length

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
                <select value={clientId} onChange={(e) => {
                  const id = e.target.value
                  setClientId(id)
                  setPicked(delegates.find((d) => String(d.client_id) === id) || null)
                }}>
                  <option value="">— choose delegate{query ? ` (${delegates.length}${delegatesTotal != null && delegatesTotal > delegates.length ? ` of ${delegatesTotal}` : ''} match${delegates.length === 1 ? '' : 'es'})` : ''} —</option>
                  {selectedClient && !delegates.some((d) => String(d.client_id) === String(clientId)) && (
                    <option value={clientId}>{selectedClient.forename} {selectedClient.surname} · {selectedClient.company}</option>
                  )}
                  {delegates.map((d) => <option key={d.client_id} value={d.client_id}>{d.forename} {d.surname} · {d.company}</option>)}
                </select>
                <button className="btn ghost sm" onClick={() => { setShowNewClient(!showNewClient); setShowNewCompany(false) }}>＋ New</button>
              </div>
            </div>

            {showNewClient && (
              <div className="subform" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'search') { e.preventDefault(); if (showNewCompany && e.target.closest('.subform .subform')) saveCompany(); else saveClient() } }}>
                <div className="sfh">New delegate</div>
                <div className="twocol">
                  <Inp label="Forename" v={nc.forename} on={(v) => setNc({ ...nc, forename: v })} />
                  <Inp label="Surname" v={nc.surname} on={(v) => setNc({ ...nc, surname: v })} />
                </div>
                <div className="twocol">
                  <Inp label="NI number" v={nc.ni_number} on={(v) => setNc({ ...nc, ni_number: v })} placeholder="AB123456C" kind="ni" />
                  <Inp label="Date of birth" type="date" v={nc.date_of_birth} on={(v) => setNc({ ...nc, date_of_birth: v })} />
                </div>
                <div className="twocol">
                  <Inp label="Mobile" v={nc.mobile} on={(v) => setNc({ ...nc, mobile: v })} type="tel" />
                  <Inp label="Email" v={nc.email} on={(v) => setNc({ ...nc, email: v })} type="email" />
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
                      <Inp label="Phone" v={nco.phone} on={(v) => setNco({ ...nco, phone: v })} type="tel" />
                    </div>
                    <div className="twocol">
                      <Inp label="Email" v={nco.email} on={(v) => setNco({ ...nco, email: v })} type="email" />
                      <Inp label="Sage ref" v={nco.sage_ref} on={(v) => setNco({ ...nco, sage_ref: v })} />
                    </div>
                    <div className="inrow">
                      <button className="btn sm" disabled={saving} onClick={saveCompany}>Save company</button>
                      <button className="btn ghost sm" onClick={() => setShowNewCompany(false)}>Cancel</button>
                    </div>
                  </div>
                )}
                <div className="inrow">
                  <button className="btn sm" disabled={saving} onClick={saveClient}>Save delegate</button>
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

            {/* ── what they already hold ─────────────────────────────────── */}
            {selectedClient && (
              <div className="subform">
                <div className="sfh">What {selectedClient.forename} already holds
                  {held && held.length > 0 && (
                    <span className="renew-alert" style={{ marginLeft: 8, display: 'inline-flex' }}>
                      {held.filter((r) => r.status === 'expired').length > 0 && <span className="b fail">{held.filter((r) => r.status === 'expired').length} expired</span>}
                      {held.filter((r) => r.status === 'soon').length > 0 && <span className="b due">{held.filter((r) => r.status === 'soon').length} due ≤ 90 days</span>}
                    </span>
                  )}
                </div>
                {held == null && <div className="muted small">Looking up their record…</div>}
                {held && held.length === 0 && <div className="muted small">Nothing passed on record — a new delegate, or the import has nothing for them.</div>}
                {held && held.length > 0 && (
                  <>
                    <div className="small muted" style={{ marginBottom: 6 }}>Their passes, with expiry. Say it back to them — <b>“is that right?”</b> — then ＋ adds it to this booking as a renewal, ✕ takes a wrong imported line off their record.</div>
                    <table>
                      <tbody>
                        {held.map((r) => {
                          const [cls, label] = RENEWAL_BADGE[r.status]
                          const onBooking = catByCode.has(r.code) && catKind.has(catByCode.get(r.code).category_id)
                          return (
                            <tr key={r.code}>
                              <td style={{ padding: '6px 8px' }}><b>{r.code}</b> <span className="muted small">{r.desc}</span></td>
                              <td className="nowrap" style={{ padding: '6px 8px' }}>
                                <span className={'b ' + cls}>{label}</span>
                                {r.expiry && <span className="muted small" style={{ marginLeft: 6 }}>{fmt(r.expiry)}{r.days != null && r.days >= 0 ? ` · ${r.days}d` : ''}</span>}
                              </td>
                              <td className="nowrap" style={{ padding: '6px 8px', textAlign: 'right' }}>
                                {onBooking
                                  ? <span className="b pass">on this booking</span>
                                  : <button className="btn ghost sm" onClick={() => addHeldAsReassess(r)} title="Add to this booking as a reassessment">＋ renew</button>}
                                {' '}
                                <button className="btn ghost sm" onClick={() => removeHeld(r)} title="Wrong on the imported record — take this line off" disabled={!r.bcId}>✕</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )}

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
              <div className="twocol" style={{ marginTop: 6 }}>
                <Inp label="Preferred from (optional)" type="date" v={opts.prefFrom} on={(v) => setOpts({ ...opts, prefFrom: v })} />
                <Inp label="Preferred to (optional)" type="date" v={opts.prefTo} on={(v) => setOpts({ ...opts, prefTo: v })} />
              </div>
            </div>

            {/* ── which dates ───────────────────────────────────────────── */}
            <div className="subform">
              <div className="sfh">Which dates?</div>
              {schemesTicked.length === 0 && <div className="muted small">Tick qualifications on the right first — the scheduled courses for each group appear here.</div>}
              {schemesTicked.map((scheme) => {
                const runs = upcomingByScheme[scheme] || []
                const cur = sessionPick.get(scheme)
                return (
                  <div key={scheme} style={{ marginBottom: 10 }}>
                    <div className="small" style={{ fontWeight: 650, marginBottom: 6 }}>{schemeName[scheme] || scheme}</div>
                    <div className="inq-courses" style={{ margin: 0 }}>
                      <button type="button" className={'inq-chip' + (cur == null ? ' on' : '')} onClick={() => pickSession(scheme, null)} title="No date yet — Simon places them from the waiting list">
                        {cur == null ? '✓ ' : ''}Waiting pool
                      </button>
                      {runs.map((b) => {
                        const load = dayLoad(b)
                        const full = load.seats != null && load.peak >= load.seats
                        return (
                          <button type="button" key={b.id} className={'inq-chip' + (String(cur) === String(b.id) ? ' on' : '')} onClick={() => pickSession(scheme, b.id)}
                            title={`${b.course} · ${loadLabel(b)}${b.trainer ? ' · ' + b.trainer : ''}`}>
                            {String(cur) === String(b.id) ? '✓ ' : ''}{fmt(b.start)}{b.end && b.end !== b.start ? '–' + fmt(b.end) : ''}
                            <span className="muted" style={{ fontWeight: 500 }}> · {b.course}{b.trainer ? ' · ' + b.trainer.split(' ')[0] : ''}</span>
                            {load.seats != null && <span className={'b ' + (full ? 'fail' : 'pass')} style={{ marginLeft: 6 }}>{full ? 'full' : `${load.seats - load.peak} space${load.seats - load.peak === 1 ? '' : 's'}`}</span>}
                          </button>
                        )
                      })}
                      {runs.length === 0 && <span className="muted small" style={{ alignSelf: 'center' }}>Nothing scheduled in the next {PICKER_MONTHS} months — waiting pool it is.</span>}
                    </div>
                  </div>
                )
              })}
            </div>

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
            <div className="field">
              <input type="search" value={qualFilter} placeholder="Find a qualification — code or description, e.g. CCN1 or water" onChange={(e) => setQualFilter(e.target.value)} />
            </div>
            {Object.entries(grouped).map(([scheme, all]) => {
              const qf = qualFilter.trim().toLowerCase()
              const arr = qf ? all.filter((c) => (c.code || '').toLowerCase().includes(qf) || (c.description || '').toLowerCase().includes(qf)) : all
              if (qf && !arr.length) return null
              const sel = all.filter((c) => catKind.has(c.category_id)).length
              // Filtering opens every group that has a match; otherwise as before.
              const isCollapsed = qf ? false : (collapsed[scheme] ?? true)
              return (
                <div className={'cgroup' + (isCollapsed ? ' collapsed' : '')} key={scheme}>
                  <div className="ch" onClick={() => setCollapsed({ ...collapsed, [scheme]: !isCollapsed })}>
                    <span className="tw">▼</span>
                    <span className="nm">{schemeName[scheme] || scheme}</span>
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
      <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" onClick={createBooking} disabled={busy}>
          {pickedCount > 0 ? `Book onto ${pickedCount === schemesTicked.length ? 'the course' + (pickedCount > 1 ? 's' : '') : 'the picked course' + (pickedCount > 1 ? 's' : '') + ' (rest to pool)'}` : 'Add to waiting pool'}
        </button>
        <span className="muted small">
          {pickedCount > 0
            ? 'Puts them on those dates now. The delegate email is switched off until the wording is agreed, so nothing goes out.'
            : 'No dates picked — they join the waiting pool for Simon to place. Pick a date under “Which dates?” to book them straight on.'}
        </span>
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

// type="tel" / "email" bring up the right keyboard on a tablet; kind="ni"
// capitalises as you type, because an NI number is always upper case.
function Inp({ label, v, on, type = 'text', placeholder, kind = null }) {
  const extra = kind === 'ni' ? { autoCapitalize: 'characters', style: { textTransform: 'uppercase' } } : {}
  return (
    <div className="field">
      <label className="fl">{label}</label>
      <input type={type} value={v} placeholder={placeholder} onChange={(e) => on(e.target.value)} {...extra} />
    </div>
  )
}
