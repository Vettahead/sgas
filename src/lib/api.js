// Source-agnostic data access layer.
// Every function returns the SAME view-friendly shape whether the data comes
// from live Supabase or the bundled demo store. Views never touch raw tables.

import { supabase, LIVE } from './supabase.js'
import { store, ASSESSOR_COLOR } from './demo.js'
import { todayISO, addMonths, daysUntil } from './util.js'
import { hashPassword, verifyPassword, randomSaltHex } from './auth.js'

export const isLive = LIVE
export { ASSESSOR_COLOR }

// ---- small demo lookups -----------------------------------------------------
const D = store
const co = (id) => D.companies.find((x) => x.company_id === id)
const cl = (id) => D.clients.find((x) => x.client_id === id)
const cat = (id) => D.categories.find((x) => x.category_id === id)
const crs = (id) => D.courses.find((x) => x.course_id === id)
const asr = (id) => D.assessors.find((x) => x.assessor_id === id)
const ses = (id) => D.sessions.find((x) => x.session_id === id)

function demoRollup(bookingId) {
  const rows = D.booking_categories.filter((x) => x.booking_id === bookingId)
  if (!rows.length) return 'PENDING'
  if (rows.some((x) => x.result === 'PENDING')) return 'PENDING'
  if (rows.every((x) => x.result === 'PASS')) return 'PASS'
  if (rows.every((x) => x.result === 'FAIL')) return 'FAIL'
  return 'PARTIAL'
}

// Pool is UI staging only (drafts before scheduling). Empty in live mode.
const poolList = LIVE ? [] : D.pool

// =============================================================================
// READS
// =============================================================================

export async function getDashboard() {
  if (LIVE) {
    const { data: lq } = await supabase
      .from('v_live_qualification')
      .select('client_id,forename,surname,category_code,category_desc,expiry_date,days_to_expiry')
      .gte('days_to_expiry', 0).lte('days_to_expiry', 90)
      .order('expiry_date', { ascending: true })
    const { count: sessions } = await supabase
      .from('session').select('*', { count: 'exact', head: true })
    const { data: chaseRows } = await supabase
      .from('booking')
      .select('booking_id,flag_mlp,flag_igas,flag_payment_outstanding,client:client_id(forename,surname),company:company_id(name)')
      .or('flag_mlp.eq.true,flag_igas.eq.true,flag_payment_outstanding.eq.true')
    const renewals = (lq || []).map((r) => ({
      clientId: r.client_id, name: `${r.forename} ${r.surname}`,
      code: r.category_code, desc: r.category_desc, expiry: r.expiry_date, days: r.days_to_expiry,
    }))
    const chase = (chaseRows || []).map((b) => ({
      name: `${b.client.forename} ${b.client.surname}`, payer: b.company?.name || '—',
      flags: flagList(b),
    }))
    return { renewals, chase, mlps: await listMLPs(), counts: { renew: renewals.length, sessions: sessions || 0, outstanding: chase.length } }
  }
  // demo
  const renewals = D.booking_categories
    .filter((x) => x.result === 'PASS' && x.expiry_date && daysUntil(x.expiry_date) >= 0 && daysUntil(x.expiry_date) <= 90)
    .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))
    .map((x) => {
      const b = D.bookings.find((bb) => bb.booking_id === x.booking_id)
      const client = cl(b.client_id)
      return { clientId: client.client_id, name: `${client.forename} ${client.surname}`, code: cat(x.category_id).code, desc: cat(x.category_id).description, expiry: x.expiry_date, days: daysUntil(x.expiry_date) }
    })
  const chase = D.bookings.filter((b) => b.flag_mlp || b.flag_igas || b.flag_payment_outstanding).map((b) => ({
    name: `${cl(b.client_id).forename} ${cl(b.client_id).surname}`, payer: co(b.company_id)?.name || '—', flags: flagList(b),
  }))
  return { renewals, chase, mlps: await listMLPs(), counts: { renew: renewals.length, sessions: D.sessions.length, outstanding: chase.length } }
}

function flagList(b) {
  return [b.flag_mlp && 'MLP', b.flag_igas && 'IGAS', b.flag_payment_outstanding && 'Payment'].filter(Boolean)
}

export async function listDelegates() {
  if (LIVE) {
    const { data } = await supabase
      .from('client')
      .select('client_id,forename,surname,ni_number,date_of_birth,mobile,email,company_id,company:company_id(name)')
      .order('surname', { ascending: true })
    return (data || []).map((c) => ({ ...c, company: c.company?.name || '—' }))
  }
  return D.clients.map((c) => ({
    client_id: c.client_id, forename: c.forename, surname: c.surname, ni_number: c.ni_number,
    date_of_birth: c.date_of_birth, mobile: c.mobile, email: c.email, company_id: c.company_id, company: co(c.company_id)?.name || '—',
  })).sort((a, b) => a.surname.localeCompare(b.surname))
}

export async function getDelegateHistory(clientId) {
  if (LIVE) {
    const { data: client } = await supabase
      .from('client')
      .select('client_id,forename,surname,ni_number,date_of_birth,mobile,email,company:company_id(name)')
      .eq('client_id', clientId).single()
    const { data: bookings } = await supabase
      .from('booking')
      .select('booking_id,overall_result,session:session_id(start_date,end_date,assessor:assessor_id(name),course:course_id(name)),booking_category(booking_category_id,result,achieved_date,expiry_date,category:category_id(code,description))')
      .eq('client_id', clientId)
    const bk = (bookings || []).map((b) => ({
      bookingId: b.booking_id, overall: b.overall_result,
      course: b.session?.course?.name || '—', assessor: b.session?.assessor?.name || '—',
      start: b.session?.start_date,
      categories: (b.booking_category || []).map((x) => ({
        code: x.category.code, desc: x.category.description, result: x.result, achieved: x.achieved_date, expiry: x.expiry_date,
      })),
    })).sort((a, b) => new Date(b.start || 0) - new Date(a.start || 0))
    return { client: { ...client, company: client.company?.name || '—' }, bookings: bk }
  }
  const client = cl(clientId)
  const bk = D.bookings.filter((b) => b.client_id === clientId).map((b) => {
    const s = ses(b.session_id)
    return {
      bookingId: b.booking_id, overall: demoRollup(b.booking_id),
      course: crs(s.course_id)?.name || '—', assessor: asr(s.assessor_id)?.name || '—', start: s.start_date,
      categories: D.booking_categories.filter((x) => x.booking_id === b.booking_id).map((x) => ({
        code: cat(x.category_id).code, desc: cat(x.category_id).description, result: x.result, achieved: x.achieved_date, expiry: x.expiry_date,
      })),
    }
  }).sort((a, b) => new Date(b.start || 0) - new Date(a.start || 0))
  return { client: { ...client, company: co(client.company_id)?.name || '—' }, bookings: bk }
}

export async function listCompanies() {
  if (LIVE) {
    const { data } = await supabase.from('company').select('*').order('name')
    const { data: clients } = await supabase.from('client').select('company_id')
    const counts = tally(clients || [], 'company_id')
    return (data || []).map((c) => ({ ...c, delegates: counts[c.company_id] || 0 }))
  }
  return D.companies.map((c) => ({ ...c, delegates: D.clients.filter((x) => x.company_id === c.company_id).length }))
}

export async function listAssessors() {
  if (LIVE) {
    const { data } = await supabase.from('assessor').select('*').order('name')
    const { data: sessions } = await supabase.from('session').select('assessor_id')
    const counts = tally(sessions || [], 'assessor_id')
    return (data || []).map((a) => ({ ...a, sessions: counts[a.assessor_id] || 0, color: ASSESSOR_COLOR[a.assessor_id] || '#48566a' }))
  }
  return D.assessors.map((a) => ({ ...a, sessions: D.sessions.filter((s) => s.assessor_id === a.assessor_id).length, color: ASSESSOR_COLOR[a.assessor_id] || '#48566a' }))
}

export async function listCourses() {
  if (LIVE) {
    const { data } = await supabase.from('course').select('*').order('name')
    const { data: cats } = await supabase.from('category').select('scheme')
    const { data: sessions } = await supabase.from('session').select('course_id')
    const catCounts = tally(cats || [], 'scheme')
    const sesCounts = tally(sessions || [], 'course_id')
    return (data || []).map((c) => ({ ...c, qualifications: catCounts[c.scheme] || 0, sessions: sesCounts[c.course_id] || 0, awaiting: poolList.filter((p) => p.scheme === c.scheme).length }))
  }
  return D.courses.map((c) => ({
    ...c,
    qualifications: D.categories.filter((x) => x.scheme === c.scheme).length,
    sessions: D.sessions.filter((s) => s.course_id === c.course_id).length,
    awaiting: poolList.filter((p) => p.scheme === c.scheme).length,
  }))
}

export async function listCategories() {
  if (LIVE) {
    const { data } = await supabase.from('category').select('*').eq('is_active', true).order('code')
    return data || []
  }
  return D.categories
}

export async function listSessions() {
  if (LIVE) {
    const { data } = await supabase
      .from('session')
      .select('session_id,start_date,end_date,assessor:assessor_id(assessor_id,name,assigned_room),course:course_id(name)')
      .order('start_date')
    return (data || []).map((s) => ({
      session_id: s.session_id, start_date: s.start_date, end_date: s.end_date,
      assessor_id: s.assessor?.assessor_id, assessor: s.assessor?.name, room: s.assessor?.assigned_room,
      course: s.course?.name, scheme: s.course?.scheme, color: ASSESSOR_COLOR[s.assessor?.assessor_id] || '#48566a',
    }))
  }
  return D.sessions.map((s) => ({
    session_id: s.session_id, start_date: s.start_date, end_date: s.end_date,
    assessor_id: s.assessor_id, assessor: asr(s.assessor_id)?.name, room: asr(s.assessor_id)?.assigned_room,
    course: crs(s.course_id)?.name, scheme: crs(s.course_id)?.scheme, color: ASSESSOR_COLOR[s.assessor_id] || '#48566a',
  }))
}

export async function getSessionBookings(sessionId) {
  if (LIVE) {
    const { data } = await supabase
      .from('booking')
      .select('booking_id,client_id,overall_result,disposition,assess_notes,client:client_id(forename,surname),booking_category(booking_category_id,result,achieved_date,expiry_date,category:category_id(code,description))')
      .eq('session_id', sessionId)
    const rows = data || []
    const clientIds = [...new Set(rows.map((b) => b.client_id))]
    const noShows = {}
    if (clientIds.length) {
      const { data: ns } = await supabase.from('booking').select('client_id').eq('disposition', 'NO_SHOW').in('client_id', clientIds)
      for (const r of ns || []) noShows[r.client_id] = (noShows[r.client_id] || 0) + 1
    }
    return rows.map((b) => ({
      bookingId: b.booking_id, clientId: b.client_id, name: `${b.client.forename} ${b.client.surname}`,
      forename: b.client.forename, surname: b.client.surname, overall: b.overall_result,
      disposition: b.disposition || 'NONE', assessNotes: b.assess_notes || '', noShows: noShows[b.client_id] || 0,
      categories: (b.booking_category || []).map((x) => ({
        bookingCategoryId: x.booking_category_id, code: x.category.code, desc: x.category.description,
        result: x.result, expiry: x.expiry_date,
      })),
    }))
  }
  return D.bookings.filter((b) => b.session_id === sessionId).map((b) => {
    const c = cl(b.client_id)
    return {
      bookingId: b.booking_id, clientId: b.client_id, name: `${c.forename} ${c.surname}`, forename: c.forename, surname: c.surname,
      overall: demoRollup(b.booking_id),
      disposition: b.disposition || 'NONE', assessNotes: b.assess_notes || '',
      noShows: D.bookings.filter((x) => x.client_id === b.client_id && x.disposition === 'NO_SHOW').length,
      categories: D.booking_categories.filter((x) => x.booking_id === b.booking_id).map((x) => ({
        bookingCategoryId: x.booking_category_id, code: cat(x.category_id).code, desc: cat(x.category_id).description, result: x.result, expiry: x.expiry_date,
      })),
    }
  })
}

export async function listPayments() {
  if (LIVE) {
    const { data } = await supabase
      .from('booking')
      .select('booking_id,overall_result,disposition,flag_mlp,flag_igas,flag_payment_outstanding,flag_cert_outstanding,flag_photo_outstanding,sage_ref,igas_evidence_date,last_chased,client:client_id(forename,surname),company:company_id(name)')
      .order('booking_id')
    return (data || []).map((b) => ({
      bookingId: b.booking_id, name: `${b.client.forename} ${b.client.surname}`, payer: b.company?.name || '—',
      overall: b.overall_result, disposition: b.disposition || 'NONE', mlp: b.flag_mlp, igas: b.flag_igas, pay: b.flag_payment_outstanding,
      cert: b.flag_cert_outstanding, photo: b.flag_photo_outstanding, sageRef: b.sage_ref || '', lastChased: b.last_chased,
      igasEvidenceDate: b.igas_evidence_date || null, igasExpiry: b.igas_evidence_date ? addMonths(b.igas_evidence_date, 60) : null,
    }))
  }
  return D.bookings.map((b) => ({
    bookingId: b.booking_id, name: `${cl(b.client_id).forename} ${cl(b.client_id).surname}`, payer: co(b.company_id)?.name || '—',
    overall: demoRollup(b.booking_id), disposition: b.disposition || 'NONE', mlp: b.flag_mlp, igas: b.flag_igas, pay: b.flag_payment_outstanding,
    cert: b.flag_cert_outstanding, photo: b.flag_photo_outstanding, sageRef: b.sage_ref || '', lastChased: b.last_chased,
    igasEvidenceDate: b.igas_evidence_date || null, igasExpiry: b.igas_evidence_date ? addMonths(b.igas_evidence_date, 60) : null,
  }))
}

export function getPool() {
  // Always client-side staging. Grouped by scheme for the schedule board.
  return poolList.map((p) => {
    const c = cl(p.client_id) // demo seed entries resolve here; live entries carry their own name
    const forename = p.forename ?? c?.forename ?? '?'
    const surname = p.surname ?? c?.surname ?? '?'
    return { id: p.id, clientId: p.client_id, name: `${forename} ${surname}`, forename, surname, scheme: p.scheme, categoryIds: p.category_ids, count: p.category_ids.length,
      kind: p.kind || 'NEW', mlp: !!p.mlp, igas: !!p.igas, prefFrom: p.prefFrom || null, prefTo: p.prefTo || null }
  })
}

// Delegates marked NYC / No-show at assessment that still need re-booking.
// Derived from real bookings (not the client-side draft pool), so it works in
// live too. Scheme comes from the remaining categories (course has no scheme).
// id is prefixed 'rb-' so the Schedule board knows to RE-BOOK (rescheduleDelegate)
// rather than schedule a fresh draft.
export async function getReschedulePool() {
  if (LIVE) {
    const { data } = await supabase.from('booking')
      .select('booking_id,client_id,company_id,disposition,client:client_id(forename,surname),booking_category(category_id,result,category:category_id(scheme))')
      .in('disposition', ['NYC', 'NO_SHOW']).eq('rescheduled', false)
    return (data || []).map((b) => {
      const remaining = (b.booking_category || []).filter((x) => x.result !== 'PASS')
      const scheme = remaining[0]?.category?.scheme || null
      return reschedEntry(b.booking_id, b.client_id, b.company_id, b.client.forename, b.client.surname, scheme, remaining.map((x) => x.category_id), b.disposition)
    })
  }
  return D.bookings
    .filter((b) => (b.disposition === 'NYC' || b.disposition === 'NO_SHOW') && !b.rescheduled)
    .map((b) => {
      const c = cl(b.client_id)
      const remaining = D.booking_categories.filter((x) => x.booking_id === b.booking_id && x.result !== 'PASS')
      const scheme = remaining[0] ? cat(remaining[0].category_id)?.scheme : null
      return reschedEntry(b.booking_id, b.client_id, b.company_id ?? c?.company_id, c.forename, c.surname, scheme, remaining.map((x) => x.category_id), b.disposition)
    })
}

function reschedEntry(bookingId, clientId, companyId, forename, surname, scheme, categoryIds, disposition) {
  return {
    id: 'rb-' + bookingId, bookingId, clientId, company_id: companyId,
    name: `${forename} ${surname}`, forename, surname,
    scheme, categoryIds, count: categoryIds.length, kind: disposition, origin: disposition,
  }
}

// Re-book a looped-back delegate onto a new block (their remaining categories),
// and flag the original booking rescheduled so it leaves the loop-back list.
export async function rescheduleDelegate(bookingId, targetSessionId) {
  if (LIVE) {
    const { data: orig, error: e0 } = await supabase.from('booking')
      .select('client_id,company_id,booking_category(category_id,result)').eq('booking_id', bookingId).single()
    if (e0) throw e0
    const cats = (orig.booking_category || []).filter((x) => x.result !== 'PASS').map((x) => x.category_id)
    const { data: bk, error: e1 } = await supabase.from('booking')
      .insert({ client_id: orig.client_id, session_id: targetSessionId, company_id: orig.company_id || null, overall_result: 'PENDING' })
      .select().single()
    if (e1) throw e1
    if (cats.length) {
      const { error: e2 } = await supabase.from('booking_category').insert(cats.map((cid) => ({ booking_id: bk.booking_id, category_id: cid, result: 'PENDING' })))
      if (e2) throw e2
    }
    const { error: e3 } = await supabase.from('booking').update({ rescheduled: true }).eq('booking_id', bookingId)
    if (e3) throw e3
    return
  }
  const orig = D.bookings.find((x) => x.booking_id === bookingId)
  if (!orig) return
  const cats = D.booking_categories.filter((x) => x.booking_id === bookingId && x.result !== 'PASS').map((x) => x.category_id)
  const newId = ++D.seq.booking
  D.bookings.push({ booking_id: newId, client_id: orig.client_id, session_id: targetSessionId, company_id: orig.company_id, overall_result: 'PENDING', disposition: 'NONE', assess_notes: null, flag_mlp: orig.flag_mlp, flag_igas: orig.flag_igas, flag_payment_outstanding: false, flag_cert_outstanding: false, flag_photo_outstanding: false, sage_ref: null, is_reassessment: orig.is_reassessment, pref_date_from: null, pref_date_to: null, rescheduled: false, last_chased: null, confirmation_sent_at: null })
  for (const cid of cats) D.booking_categories.push({ booking_category_id: ++D.seq.bcat, booking_id: newId, category_id: cid, result: 'PENDING', achieved_date: null, expiry_date: null })
  orig.rescheduled = true
}

// =============================================================================
// WRITES
// =============================================================================

export async function createCompany(d) {
  if (LIVE) {
    const { data, error } = await supabase.from('company').insert({
      name: d.name, address: d.address, contact_name: d.contact_name, phone: d.phone, email: d.email, sage_ref: d.sage_ref,
    }).select().single()
    if (error) throw error
    return data
  }
  const company_id = ++D.seq.company
  const row = { company_id, ...d }
  D.companies.push(row)
  return row
}

export async function createClient(d) {
  if (LIVE) {
    const { data, error } = await supabase.from('client').insert({
      company_id: d.company_id, ni_number: d.ni_number, forename: d.forename, surname: d.surname,
      date_of_birth: d.date_of_birth || null, mobile: d.mobile, email: d.email,
    }).select('client_id,forename,surname,company_id,company:company_id(name)').single()
    if (error) throw error
    return { ...data, company: data.company?.name }
  }
  const client_id = ++D.seq.client
  const row = { client_id, telephone: '', ...d }
  D.clients.push(row)
  return { ...row, company: co(d.company_id)?.name }
}

// Add a draft booking to the staging pool (one entry per course/scheme ticked).
// client: { client_id, forename, surname, company_id }
// cats:   array of { category_id, scheme }
// opts:   { kind:'NEW'|'REASSESS', mlp, igas, prefFrom, prefTo } — applied to every entry
export function addToPool(client, cats, opts = {}) {
  const bySch = {}
  for (const c of cats) (bySch[c.scheme] = bySch[c.scheme] || []).push(c.category_id)
  const added = []
  for (const [scheme, ids] of Object.entries(bySch)) {
    const entry = {
      id: ++D.seq.pool, client_id: client.client_id,
      forename: client.forename, surname: client.surname, company_id: client.company_id,
      scheme, category_ids: ids,
      kind: opts.kind || 'NEW', mlp: !!opts.mlp, igas: !!opts.igas,
      prefFrom: opts.prefFrom || null, prefTo: opts.prefTo || null,
    }
    poolList.push(entry)
    added.push(entry)
  }
  return added
}

// Booking columns carrying the options captured at Book time.
function bookingAttrs(p) {
  return {
    flag_mlp: !!p.mlp, flag_igas: !!p.igas,
    is_reassessment: p.kind === 'REASSESS',
    pref_date_from: p.prefFrom || null, pref_date_to: p.prefTo || null,
  }
}

export async function scheduleCourse({ scheme, courseId, assessorId, poolIds, from, to }) {
  const items = poolList.filter((p) => poolIds.includes(p.id))
  if (LIVE) {
    const { data: sess, error: e1 } = await supabase.from('session').insert({
      assessor_id: assessorId, course_id: courseId, start_date: from, end_date: to,
    }).select().single()
    if (e1) throw e1
    for (const p of items) {
      const { data: bkRow, error: e2 } = await supabase.from('booking').insert({
        client_id: p.client_id, session_id: sess.session_id, company_id: p.company_id || null, overall_result: 'PENDING', ...bookingAttrs(p),
      }).select().single()
      if (e2) throw e2
      const rows = p.category_ids.map((cid) => ({ booking_id: bkRow.booking_id, category_id: cid, result: 'PENDING' }))
      if (rows.length) {
        const { error: e3 } = await supabase.from('booking_category').insert(rows)
        if (e3) throw e3
      }
    }
  } else {
    const session_id = ++D.seq.session
    D.sessions.push({ session_id, assessor_id: assessorId, course_id: courseId, start_date: from, end_date: to, teamup_event_id: 'tu-' + session_id })
    for (const p of items) {
      const booking_id = ++D.seq.booking
      D.bookings.push({ booking_id, client_id: p.client_id, session_id, company_id: p.company_id ?? cl(p.client_id)?.company_id, overall_result: 'PENDING', disposition: 'NONE', assess_notes: null, flag_payment_outstanding: false, last_chased: null, confirmation_sent_at: null, ...bookingAttrs(p) })
      for (const cid of p.category_ids) {
        D.booking_categories.push({ booking_category_id: ++D.seq.bcat, booking_id, category_id: cid, result: 'PENDING', achieved_date: null, expiry_date: null })
      }
    }
  }
  // remove scheduled items from the staging pool
  for (const p of items) {
    const i = poolList.findIndex((x) => x.id === p.id)
    if (i >= 0) poolList.splice(i, 1)
  }
  return items.length
}

export async function markCategory(bookingCategoryId, result) {
  if (LIVE) {
    const patch = result === 'PASS'
      ? { result: 'PASS', achieved_date: todayISO(), expiry_date: null } // trigger fills expiry
      : { result: 'FAIL', achieved_date: null, expiry_date: null }
    const { error } = await supabase.from('booking_category').update(patch).eq('booking_category_id', bookingCategoryId)
    if (error) throw error
    return
  }
  const row = D.booking_categories.find((x) => x.booking_category_id === bookingCategoryId)
  if (!row) return
  row.result = result
  if (result === 'PASS') {
    row.achieved_date = row.achieved_date || todayISO()
    const yrs = cat(row.category_id)?.renewal_years
    row.expiry_date = yrs ? addMonths(row.achieved_date, Math.round(yrs * 12)) : null
  } else {
    row.achieved_date = null
    row.expiry_date = null
  }
  const b = D.bookings.find((bb) => bb.booking_id === row.booking_id)
  if (b) b.overall_result = demoRollup(row.booking_id)
}

export async function setFlag(bookingId, key, value) {
  const col = { mlp: 'flag_mlp', igas: 'flag_igas', pay: 'flag_payment_outstanding', cert: 'flag_cert_outstanding', photo: 'flag_photo_outstanding' }[key]
  if (LIVE) {
    const { error } = await supabase.from('booking').update({ [col]: value }).eq('booking_id', bookingId)
    if (error) throw error
    return
  }
  const b = D.bookings.find((x) => x.booking_id === bookingId)
  if (b) b[col] = value
}

export async function chaseBooking(bookingId, items = '') {
  if (LIVE) {
    const { error } = await supabase.from('booking').update({ last_chased: todayISO() }).eq('booking_id', bookingId)
    if (error) throw error
    const { error: e2 } = await supabase.from('chase_log').insert({ booking_id: bookingId, items, channel: 'email' })
    if (e2) throw e2
    return
  }
  const b = D.bookings.find((x) => x.booking_id === bookingId)
  if (b) b.last_chased = todayISO()
  D.chase_log.push({ chase_id: ++D.seq.chase, booking_id: bookingId, chased_at: new Date().toISOString(), items, channel: 'email' })
}

export async function setSageRef(bookingId, ref) {
  if (LIVE) {
    const { error } = await supabase.from('booking').update({ sage_ref: ref || null }).eq('booking_id', bookingId)
    if (error) throw error
    return
  }
  const b = D.bookings.find((x) => x.booking_id === bookingId)
  if (b) b.sage_ref = ref
}

export async function getChaseLog(bookingId) {
  if (LIVE) {
    const { data } = await supabase.from('chase_log').select('chase_id,chased_at,items,channel').eq('booking_id', bookingId).order('chased_at', { ascending: false })
    return (data || []).map((r) => ({ id: r.chase_id, at: r.chased_at, items: r.items || '', channel: r.channel }))
  }
  return D.chase_log.filter((x) => x.booking_id === bookingId)
    .sort((a, b) => new Date(b.chased_at) - new Date(a.chased_at))
    .map((r) => ({ id: r.chase_id, at: r.chased_at, items: r.items || '', channel: r.channel }))
}

// Per-delegate attendance disposition: 'NONE' | 'NYC' | 'NO_SHOW' (see §4.4).
// PASS/FAIL of individual qualifications stay on booking_category.
export async function setDisposition(bookingId, disposition) {
  if (LIVE) {
    const { error } = await supabase.from('booking').update({ disposition }).eq('booking_id', bookingId)
    if (error) throw error
    return
  }
  const b = D.bookings.find((x) => x.booking_id === bookingId)
  if (b) b.disposition = disposition
}

export async function setAssessNotes(bookingId, notes) {
  if (LIVE) {
    const { error } = await supabase.from('booking').update({ assess_notes: notes }).eq('booking_id', bookingId)
    if (error) throw error
    return
  }
  const b = D.bookings.find((x) => x.booking_id === bookingId)
  if (b) b.assess_notes = notes
}

function tally(rows, key) {
  const out = {}
  for (const r of rows) out[r[key]] = (out[r[key]] || 0) + 1
  return out
}

// =============================================================================
// APP-MANAGED USER ACCOUNTS (login + Admin screen)
// LIVE: credentials are verified INSIDE Postgres via SECURITY DEFINER RPCs
// (pgcrypto/bcrypt) from sgas_secure_auth.sql. The app_user table is locked by
// RLS so the anon key can neither read password hashes nor list users directly.
// Admin actions re-confirm the acting admin's password (verified in-DB).
// DEMO: in-memory only, hashed client-side.
// =============================================================================

const sanitizeUser = (u) => ({ user_id: u.user_id, username: u.username, name: u.name, email: u.email, role: u.role, is_active: u.is_active })

export async function appLogin(username, password) {
  const uname = (username || '').trim()
  if (!uname || !password) throw new Error('Enter a username and password')
  if (LIVE) {
    const { data, error } = await supabase.rpc('app_login', { p_username: uname, p_password: password })
    if (error) throw new Error('Could not reach the server')
    const row = (data || [])[0]
    if (!row) throw new Error('Invalid username or password')
    return sanitizeUser(row)
  }
  const row = store.users.find((u) => u.username.toLowerCase() === uname.toLowerCase())
  if (!row || !row.is_active) throw new Error('Invalid username or password')
  const ok = await verifyPassword(password, row.password_salt, row.password_hash)
  if (!ok) throw new Error('Invalid username or password')
  return sanitizeUser(row)
}

export async function listUsers(adminAuth) {
  if (LIVE) {
    const { data, error } = await supabase.rpc('app_list_users', { p_admin: adminAuth.username, p_admin_pw: adminAuth.password })
    if (error) throw new Error(/Not authorized/.test(error.message) ? 'Password incorrect' : error.message)
    return data || []
  }
  return store.users.map(sanitizeUser).sort((a, b) => a.username.localeCompare(b.username))
}

export async function createUser({ username, name, email, role, password }, adminAuth) {
  const uname = (username || '').trim()
  if (!uname) throw new Error('Username is required')
  if (!password) throw new Error('Password is required')
  if (LIVE) {
    const { data, error } = await supabase.rpc('app_create_user', {
      p_admin: adminAuth.username, p_admin_pw: adminAuth.password,
      p_username: uname, p_name: name, p_email: email, p_role: role || 'STANDARD', p_password: password,
    })
    if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'That username is already taken' : error.message)
    return (data || [])[0]
  }
  const salt = randomSaltHex()
  const hash = await hashPassword(password, salt)
  if (store.users.some((u) => u.username.toLowerCase() === uname.toLowerCase())) throw new Error('That username is already taken')
  const row = { user_id: ++store.seq.user, username: uname, name, email, role: role || 'STANDARD', is_active: true, password_hash: hash, password_salt: salt }
  store.users.push(row)
  return sanitizeUser(row)
}

export async function updateUser(userId, patch, adminAuth) {
  if (LIVE) {
    const { error } = await supabase.rpc('app_update_user', {
      p_admin: adminAuth.username, p_admin_pw: adminAuth.password, p_target: userId,
      p_name: patch.name ?? null, p_email: patch.email ?? null, p_role: patch.role ?? null,
      p_is_active: 'is_active' in patch ? patch.is_active : null,
    })
    if (error) throw new Error(error.message)
    return
  }
  const fields = {}
  for (const k of ['name', 'email', 'role', 'is_active']) if (k in patch) fields[k] = patch[k]
  const u = store.users.find((x) => x.user_id === userId)
  if (u) Object.assign(u, fields)
}

export async function setUserPassword(userId, password, adminAuth) {
  if (!password) throw new Error('Password is required')
  if (LIVE) {
    const { error } = await supabase.rpc('app_set_password', {
      p_admin: adminAuth.username, p_admin_pw: adminAuth.password, p_target: userId, p_password: password,
    })
    if (error) throw new Error(error.message)
    return
  }
  const salt = randomSaltHex()
  const hash = await hashPassword(password, salt)
  const u = store.users.find((x) => x.user_id === userId)
  if (u) { u.password_hash = hash; u.password_salt = salt }
}

// =============================================================================
// MLP (Managed Learning Programme) + IGAS evidence (§4.8)
// MLP = a chosen set of courses for a new entrant. A course is "done" when the
// delegate has a PASSED booking on a session of that course; progress/complete
// are computed, so they knock off automatically as courses are passed.
// =============================================================================

async function passedCourseIdsByClient(clientIds) {
  const out = {}
  if (!clientIds.length) return out
  const { data } = await supabase.from('booking').select('client_id,session:session_id(course_id)').eq('overall_result', 'PASS').in('client_id', clientIds)
  for (const b of data || []) (out[b.client_id] = out[b.client_id] || new Set()).add(b.session?.course_id)
  return out
}

export async function listMLPs() {
  if (LIVE) {
    const { data: rows } = await supabase.from('mlp')
      .select('mlp_id,client_id,label,client:client_id(forename,surname),mlp_course(course_id,course:course_id(name))')
    const ids = [...new Set((rows || []).map((m) => m.client_id))]
    const passed = await passedCourseIdsByClient(ids)
    return (rows || []).map((m) => mlpShape(m.mlp_id, m.client_id, `${m.client.forename} ${m.client.surname}`, m.label,
      (m.mlp_course || []).map((mc) => ({ courseId: mc.course_id, name: mc.course?.name })), passed[m.client_id] || new Set()))
  }
  return D.mlps.map((m) => {
    const passed = new Set(D.bookings.filter((b) => b.client_id === m.client_id && demoRollup(b.booking_id) === 'PASS').map((b) => ses(b.session_id)?.course_id))
    const courses = D.mlp_courses.filter((mc) => mc.mlp_id === m.mlp_id).map((mc) => ({ courseId: mc.course_id, name: crs(mc.course_id)?.name }))
    return mlpShape(m.mlp_id, m.client_id, `${cl(m.client_id).forename} ${cl(m.client_id).surname}`, m.label, courses, passed)
  })
}

function mlpShape(mlpId, clientId, name, label, courses, passedSet) {
  const withDone = courses.map((c) => ({ ...c, done: passedSet.has(c.courseId) }))
  const done = withDone.filter((c) => c.done).length
  return { mlpId, clientId, name, label, courses: withDone, total: withDone.length, done, complete: withDone.length > 0 && done === withDone.length }
}

// Enroll/replace a delegate's MLP with a chosen set of courses.
export async function createMLP(clientId, courseIds, label = 'Managed Learning Programme') {
  if (LIVE) {
    const { data: ex } = await supabase.from('mlp').select('mlp_id').eq('client_id', clientId).limit(1)
    let mlpId = ex && ex[0] ? ex[0].mlp_id : null
    if (mlpId) { await supabase.from('mlp_course').delete().eq('mlp_id', mlpId); await supabase.from('mlp').update({ label }).eq('mlp_id', mlpId) }
    else { const { data: m, error } = await supabase.from('mlp').insert({ client_id: clientId, label }).select().single(); if (error) throw error; mlpId = m.mlp_id }
    if (courseIds.length) { const { error: e2 } = await supabase.from('mlp_course').insert(courseIds.map((cid) => ({ mlp_id: mlpId, course_id: cid }))); if (e2) throw e2 }
    return mlpId
  }
  let m = D.mlps.find((x) => x.client_id === clientId)
  if (m) { m.label = label; D.mlp_courses = D.mlp_courses.filter((mc) => mc.mlp_id !== m.mlp_id) }
  else { m = { mlp_id: ++D.seq.mlp, client_id: clientId, label, created_at: new Date().toISOString(), completed_at: null }; D.mlps.push(m) }
  for (const cid of courseIds) D.mlp_courses.push({ mlp_course_id: ++D.seq.mlpc, mlp_id: m.mlp_id, course_id: cid })
  return m.mlp_id
}

// Record (or clear) IGAS work-based evidence. Recording a date clears the chase
// flag; expiry = date + 5y is computed in listPayments.
export async function setIgasEvidence(bookingId, date) {
  if (LIVE) {
    const { error } = await supabase.from('booking').update({ igas_evidence_date: date || null, flag_igas: date ? false : true }).eq('booking_id', bookingId)
    if (error) throw error
    return
  }
  const b = D.bookings.find((x) => x.booking_id === bookingId)
  if (b) { b.igas_evidence_date = date || null; b.flag_igas = date ? false : true }
}

// =============================================================================
// STAFF (shared list) + COURSE BLOCKS + per-block role assignment
// New model: blocks (course + dates) come from Teamup; each block needs a
// Trainer, Assessor and Verifier (all from the shared staff list) plus delegates.
// The physical table is still `assessor` (reused as the staff list).
// =============================================================================

const ROLE_COL = { trainer: 'trainer_id', assessor: 'assessor_id', verifier: 'verifier_id' }

export async function listStaff() {
  if (LIVE) {
    const { data } = await supabase.from('assessor').select('*').eq('is_active', true).order('name')
    return (data || []).map((s) => ({ staff_id: s.assessor_id, name: s.name, room: s.assigned_room, email: s.email, teamup: s.teamup_subcalendar, color: ASSESSOR_COLOR[s.assessor_id] || '#48566a' }))
  }
  return D.assessors.filter((a) => a.is_active !== false).map((s) => ({ staff_id: s.assessor_id, name: s.name, room: s.assigned_room, email: s.email, teamup: s.teamup_subcalendar, color: ASSESSOR_COLOR[s.assessor_id] || '#48566a' }))
}

export async function createStaff(d) {
  if (LIVE) {
    const { data, error } = await supabase.from('assessor').insert({ name: d.name, assigned_room: d.room, email: d.email, teamup_subcalendar: d.teamup }).select().single()
    if (error) throw new Error(error.message)
    return { staff_id: data.assessor_id, name: data.name }
  }
  const staff_id = ++D.seq.staff
  D.assessors.push({ assessor_id: staff_id, name: d.name, assigned_room: d.room, email: d.email, teamup_subcalendar: d.teamup, is_active: true })
  return { staff_id, name: d.name }
}

// A "block" = a course session (course + dates) with its three role slots and delegates.
export async function listBlocks() {
  if (LIVE) {
    const { data } = await supabase
      .from('session')
      .select('session_id,start_date,end_date,teamup_event_id,trainer_id,assessor_id,verifier_id,course:course_id(course_id,name,teamup_designator),trainer:trainer_id(name),assessor:assessor_id(name),verifier:verifier_id(name),booking(booking_id,client:client_id(forename,surname))')
      .order('start_date')
    return (data || []).map((s) => block({
      id: s.session_id, start: s.start_date, end: s.end_date, designator: s.course?.teamup_designator,
      course: s.course?.name, scheme: s.course?.scheme,
      trainerId: s.trainer_id, assessorId: s.assessor_id, verifierId: s.verifier_id,
      trainer: s.trainer?.name, assessor: s.assessor?.name, verifier: s.verifier?.name,
      delegates: (s.booking || []).map((b) => ({ bookingId: b.booking_id, name: `${b.client.forename} ${b.client.surname}` })),
    }))
  }
  return D.sessions.map((s) => {
    const course = crs(s.course_id)
    const bks = D.bookings.filter((b) => b.session_id === s.session_id)
    return block({
      id: s.session_id, start: s.start_date, end: s.end_date, designator: course?.teamup_designator,
      course: course?.name, scheme: course?.scheme,
      trainerId: s.trainer_id, assessorId: s.assessor_id, verifierId: s.verifier_id,
      trainer: asr(s.trainer_id)?.name, assessor: asr(s.assessor_id)?.name, verifier: asr(s.verifier_id)?.name,
      delegates: bks.map((b) => ({ bookingId: b.booking_id, name: `${cl(b.client_id).forename} ${cl(b.client_id).surname}` })),
    })
  })
}

function block(b) {
  // A block is schedulable/pushable once it has a Trainer and at least one
  // delegate. Assessor + Verifier are now chosen at the assessment phase.
  const ready = Boolean(b.trainerId && b.delegates.length)
  return { ...b, ready }
}

export async function assignBlockRole(blockId, role, staffId) {
  const col = ROLE_COL[role]
  if (!col) throw new Error('Unknown role')
  const value = staffId || null
  if (LIVE) {
    const { error } = await supabase.from('session').update({ [col]: value }).eq('session_id', blockId)
    if (error) throw new Error(error.message)
    return
  }
  const s = ses(blockId)
  if (s) s[col] = value
}

export async function addDelegatesToBlock(blockId, poolIds) {
  const items = poolList.filter((p) => poolIds.includes(p.id))
  if (LIVE) {
    for (const p of items) {
      const { data: bkRow, error: e1 } = await supabase.from('booking')
        .insert({ client_id: p.client_id, session_id: blockId, company_id: p.company_id || null, overall_result: 'PENDING', ...bookingAttrs(p) })
        .select().single()
      if (e1) throw new Error(e1.message)
      const rows = p.category_ids.map((cid) => ({ booking_id: bkRow.booking_id, category_id: cid, result: 'PENDING' }))
      if (rows.length) {
        const { error: e2 } = await supabase.from('booking_category').insert(rows)
        if (e2) throw new Error(e2.message)
      }
    }
  } else {
    for (const p of items) {
      const booking_id = ++D.seq.booking
      D.bookings.push({ booking_id, client_id: p.client_id, session_id: blockId, company_id: p.company_id ?? cl(p.client_id)?.company_id, overall_result: 'PENDING', disposition: 'NONE', assess_notes: null, flag_payment_outstanding: false, last_chased: null, confirmation_sent_at: null, ...bookingAttrs(p) })
      for (const cid of p.category_ids) {
        D.booking_categories.push({ booking_category_id: ++D.seq.bcat, booking_id, category_id: cid, result: 'PENDING', achieved_date: null, expiry_date: null })
      }
    }
  }
  for (const p of items) {
    const i = poolList.findIndex((x) => x.id === p.id)
    if (i >= 0) poolList.splice(i, 1)
  }
  return items.length
}

// STUB: real Teamup push lands here once API + access keys are in place. It will
// upsert this block onto each assigned staff member's Teamup sub-calendar.
// For now it just reports what WOULD be pushed so the UI can confirm.
export async function pushBlockToTeamup(blockId) {
  const blocks = await listBlocks()
  const b = blocks.find((x) => x.id === blockId)
  if (!b) throw new Error('Block not found')
  const targets = [b.trainer, b.assessor, b.verifier].filter(Boolean)
  return { course: b.course, targets, note: 'Teamup integration not yet connected — this is a preview of what will be pushed.' }
}
