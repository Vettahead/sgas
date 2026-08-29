// Source-agnostic data access layer.
// Every function returns the SAME view-friendly shape whether the data comes
// from live Supabase or the bundled seed store. Views never touch raw tables.

import { supabase, LIVE } from './supabase.js'
import { store, ASSESSOR_COLOR } from './core.js'
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
  if (rows.some((x) => x.result === 'PENDING' || x.result === 'NYC')) return 'PENDING'
  if (rows.every((x) => x.result === 'PASS')) return 'PASS'
  if (rows.every((x) => x.result === 'FAIL')) return 'FAIL'
  return 'PARTIAL'
}

// Pool is UI staging only (drafts before scheduling). Empty in live mode.
const poolList = LIVE ? [] : D.pool

// =============================================================================
// READS
// =============================================================================

// §4.10 Renewal engine config: default look-ahead window + the "cold list"
// threshold (after this many unanswered contacts, move to phone follow-up).
export const RENEWAL_WINDOW_DEFAULT = 180   // ~6 months
export const RENEWAL_COLD_THRESHOLD = 5

export async function getDashboard({ windowDays = RENEWAL_WINDOW_DEFAULT } = {}) {
  if (LIVE) {
    const { data: lq } = await supabase
      .from('v_live_qualification')
      .select('client_id,forename,surname,email,mobile,category_code,category_desc,scheme,expiry_date,days_to_expiry')
      .gte('days_to_expiry', 0).lte('days_to_expiry', windowDays)
      .order('expiry_date', { ascending: true })
    // Booked-in = delegate already has a PENDING booking for the same qualification → drop off the list.
    const { data: pend } = await supabase
      .from('booking_category')
      .select('result,category:category_id(code),booking:booking_id(client_id)')
      .eq('result', 'PENDING')
    const bookedSet = new Set((pend || []).map((p) => `${p.booking?.client_id}:${p.category?.code}`))
    // Contact history (staged follow-up counts).
    const { data: rc } = await supabase.from('renewal_contact').select('client_id,category_code,sent_at')
    const contacts = contactIndex(rc || [])
    const { count: sessions } = await supabase
      .from('session').select('*', { count: 'exact', head: true })
    const { data: chaseRows } = await supabase
      .from('booking')
      .select('booking_id,flag_mlp,flag_igas,flag_payment_outstanding,client:client_id(forename,surname),company:company_id(name)')
      .or('flag_mlp.eq.true,flag_igas.eq.true,flag_payment_outstanding.eq.true')
    const dueAll = (lq || [])
      .filter((r) => !bookedSet.has(`${r.client_id}:${r.category_code}`))
      .map((r) => renewalEntry(r.client_id, `${r.forename} ${r.surname}`, r.category_code, r.category_desc, r.scheme, r.expiry_date, r.days_to_expiry, r.email, r.mobile, contacts))
    const chase = (chaseRows || []).map((b) => ({
      name: `${b.client.forename} ${b.client.surname}`, payer: b.company?.name || '—', flags: flagList(b),
    }))
    return dashboardShape(dueAll, chase, await listMLPs(), sessions || 0, windowDays, blockSummaries(await listBlocks()))
  }
  // demo
  const pendingSet = new Set(
    D.booking_categories.filter((x) => x.result === 'PENDING')
      .map((x) => `${D.bookings.find((b) => b.booking_id === x.booking_id)?.client_id}:${cat(x.category_id)?.code}`)
  )
  const contacts = contactIndex((D.renewal_contact || []).map((r) => ({ client_id: r.client_id, category_code: r.category_code, sent_at: r.sent_at })))
  const dueAll = D.booking_categories
    .filter((x) => x.result === 'PASS' && x.expiry_date && daysUntil(x.expiry_date) >= 0 && daysUntil(x.expiry_date) <= windowDays)
    .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))
    .map((x) => {
      const b = D.bookings.find((bb) => bb.booking_id === x.booking_id)
      const client = cl(b.client_id)
      const c = cat(x.category_id)
      return { code: c.code, clientId: client.client_id, entry: renewalEntry(client.client_id, `${client.forename} ${client.surname}`, c.code, c.description, c.scheme, x.expiry_date, daysUntil(x.expiry_date), client.email, client.mobile, contacts) }
    })
    .filter((x) => !pendingSet.has(`${x.clientId}:${x.code}`))
    .map((x) => x.entry)
  const chase = D.bookings.filter((b) => b.flag_mlp || b.flag_igas || b.flag_payment_outstanding).map((b) => ({
    name: `${cl(b.client_id).forename} ${cl(b.client_id).surname}`, payer: co(b.company_id)?.name || '—', flags: flagList(b),
  }))
  return dashboardShape(dueAll, chase, await listMLPs(), D.sessions.length, windowDays, blockSummaries(await listBlocks()))
}

// Role-relevant block worklists for the per-user dashboards (§4.10).
function blockSummaries(blocks) {
  // Only blocks that have NOT finished yet still need assigning — drop past ones.
  const awaitingBlocks = (blocks || []).filter((b) => !b.ready && (!b.end || b.end >= todayISO())).map((b) => ({
    id: b.id, course: b.course, start: b.start, end: b.end, scheme: b.scheme,
    missing: [(!b.trainerId || b.trainerGone) && 'Trainer', !b.delegates.length && 'Delegates'].filter(Boolean),
  }))
  const assessBlocks = (blocks || []).filter((b) => b.delegates.length > 0).map((b) => ({
    id: b.id, course: b.course, start: b.start, end: b.end, count: b.delegates.length,
  }))
  return { awaitingBlocks, assessBlocks }
}

function contactIndex(rows) {
  const map = {}
  for (const r of rows) {
    const k = `${r.client_id}:${r.category_code}`
    const e = map[k] || (map[k] = { count: 0, emails: 0, calls: 0, last: null })
    e.count++
    if (r.channel === 'phone') e.calls++; else e.emails++
    if (!e.last || r.sent_at > e.last) e.last = r.sent_at
  }
  return map
}
function renewalEntry(clientId, name, code, desc, scheme, expiry, days, email, mobile, contacts) {
  const c = contacts[`${clientId}:${code}`] || { count: 0, emails: 0, calls: 0, last: null }
  return { clientId, name, code, desc, scheme, expiry, days, email: email || '', mobile: mobile || '', contacts: c.count, emails: c.emails, calls: c.calls, lastContact: c.last }
}
// Split the due list into the email worklist vs the cold (phone follow-up) list.
function dashboardShape(dueAll, chase, mlps, sessions, windowDays, extra = {}) {
  // "Cold" is driven by unanswered EMAILS (calls don't push someone onto the phone list).
  const renewals = dueAll.filter((r) => r.emails < RENEWAL_COLD_THRESHOLD)
  const coldList = dueAll.filter((r) => r.emails >= RENEWAL_COLD_THRESHOLD)
  const awaitingBlocks = extra.awaitingBlocks || []
  const assessBlocks = extra.assessBlocks || []
  return {
    renewals, coldList, chase, mlps, windowDays, awaitingBlocks, assessBlocks,
    counts: {
      renew: dueAll.length, sessions, outstanding: chase.length, cold: coldList.length,
      unassigned: awaitingBlocks.length, toAssess: assessBlocks.reduce((n, b) => n + b.count, 0),
    },
  }
}

// Log an individualised renewal contact (email or phone) with optional notes.
// GDPR: one-by-one only.
export async function recordRenewalContact(clientId, code, channel = 'email', notes = null) {
  if (LIVE) {
    const { error } = await supabase.from('renewal_contact').insert({ client_id: clientId, category_code: code, channel, notes: notes || null })
    if (error) throw error
    return
  }
  D.renewal_contact = D.renewal_contact || []
  D.renewal_contact.push({ renewal_contact_id: ++D.seq.renewal, client_id: clientId, category_code: code, sent_at: new Date().toISOString(), channel, notes: notes || null })
}

// The full contact history for one delegate + qualification (newest first),
// so the renewal/cold-list rows can show a reviewable log of emails and calls.
export async function getRenewalContacts(clientId, code) {
  if (LIVE) {
    const { data } = await supabase.from('renewal_contact')
      .select('renewal_contact_id,sent_at,channel,notes')
      .eq('client_id', clientId).eq('category_code', code)
      .order('sent_at', { ascending: false })
    return (data || []).map((r) => ({ id: r.renewal_contact_id, at: r.sent_at, channel: r.channel, notes: r.notes || '' }))
  }
  return (D.renewal_contact || [])
    .filter((r) => r.client_id === clientId && r.category_code === code)
    .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))
    .map((r) => ({ id: r.renewal_contact_id, at: r.sent_at, channel: r.channel, notes: r.notes || '' }))
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
    return (data || []).map((c) => ({ ...c, delegates: counts[c.company_id] || 0, sendToEmployer: c.send_to_employer !== false }))
  }
  return D.companies.map((c) => ({ ...c, delegates: D.clients.filter((x) => x.company_id === c.company_id).length, sendToEmployer: c.send_to_employer !== false }))
}

// §4.9 Company detail: the employer plus everyone who works there.
export async function getCompany(companyId) {
  if (LIVE) {
    const { data: company } = await supabase.from('company').select('*').eq('company_id', companyId).single()
    const { data: clients } = await supabase
      .from('client')
      .select('client_id,forename,surname,ni_number,mobile,email')
      .eq('company_id', companyId).order('surname')
    const ids = (clients || []).map((c) => c.client_id)
    let byClient = {}
    if (ids.length) {
      const { data: bks } = await supabase
        .from('booking')
        .select('client_id,session:session_id(start_date)')
        .in('client_id', ids)
      for (const b of bks || []) {
        const e = byClient[b.client_id] || (byClient[b.client_id] = { count: 0, last: null })
        e.count++
        const d = b.session?.start_date
        if (d && (!e.last || d > e.last)) e.last = d
      }
    }
    const delegates = (clients || []).map((c) => ({
      ...c, bookings: byClient[c.client_id]?.count || 0, lastBooking: byClient[c.client_id]?.last || null,
    }))
    return { company: { ...company, sendToEmployer: company.send_to_employer !== false }, delegates }
  }
  const company = co(companyId)
  const delegates = D.clients.filter((c) => c.company_id === companyId).map((c) => {
    const bks = D.bookings.filter((b) => b.client_id === c.client_id)
    const dates = bks.map((b) => ses(b.session_id)?.start_date).filter(Boolean).sort()
    return { ...c, bookings: bks.length, lastBooking: dates[dates.length - 1] || null }
  }).sort((a, b) => a.surname.localeCompare(b.surname))
  return { company: { ...company, sendToEmployer: company.send_to_employer !== false }, delegates }
}

export async function setSendToEmployer(companyId, value) {
  if (LIVE) {
    await supabase.from('company').update({ send_to_employer: !!value }).eq('company_id', companyId)
    return
  }
  const c = co(companyId)
  if (c) c.send_to_employer = !!value
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

// Everything a DELEGATE can book — i.e. the catalogue minus the staff-only
// awards (verifier / IQA), which staff hold but nobody books onto.
export async function listBookableCategories() {
  const cats = await listCategories()
  return cats.filter((c) => !c.staff_only)
}

export async function listSessions() {
  if (LIVE) {
    const { data } = await supabase
      .from('session')
      .select('session_id,start_date,end_date,assessor:assessor_id(assessor_id,name,assigned_room),course:course_id(name,scheme)')
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
      .select('booking_id,client_id,overall_result,disposition,assess_notes,attend_from,attend_to,client:client_id(forename,surname),booking_category(booking_category_id,result,achieved_date,expiry_date,category:category_id(code,description))')
      .eq('session_id', sessionId)
      .order('booking_id')
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
      attendFrom: b.attend_from || null, attendTo: b.attend_to || null,
      categories: (b.booking_category || []).map((x) => ({
        bookingCategoryId: x.booking_category_id, code: x.category.code, desc: x.category.description,
        result: x.result, expiry: x.expiry_date,
      })).sort((a, b) => a.bookingCategoryId - b.bookingCategoryId),
    }))
  }
  return D.bookings.filter((b) => b.session_id === sessionId).map((b) => {
    const c = cl(b.client_id)
    return {
      bookingId: b.booking_id, clientId: b.client_id, name: `${c.forename} ${c.surname}`, forename: c.forename, surname: c.surname,
      overall: demoRollup(b.booking_id),
      disposition: b.disposition || 'NONE', assessNotes: b.assess_notes || '',
      noShows: D.bookings.filter((x) => x.client_id === b.client_id && x.disposition === 'NO_SHOW').length,
      attendFrom: b.attend_from || null, attendTo: b.attend_to || null,
      categories: D.booking_categories.filter((x) => x.booking_id === b.booking_id).map((x) => ({
        bookingCategoryId: x.booking_category_id, code: cat(x.category_id).code, desc: cat(x.category_id).description, result: x.result, expiry: x.expiry_date,
      })).sort((a, b) => a.bookingCategoryId - b.bookingCategoryId),
    }
  })
}

// ---- ACS application form data (§4.7 document generation) -------------------
// Returns the field bundle consumed by lib/acspdf.js. Same shape live or demo.
function dobDDMMYYYY(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return d && m && y ? `${d}${m}${y}` : ''
}
function buildRedirect(company) {
  // Only redirect when the employer has opted in (per-company flag, §4.9).
  if (!company || company.send_to_employer === false) return null
  const addr = company.address ? String(company.address).split(/\n|,/).map((s) => s.trim()).filter(Boolean) : []
  const lines = [company.name, ...addr].filter(Boolean)
  return lines.length ? lines.slice(0, 4) : null
}
function formDelegate(b) {
  const c = b.client || {}
  const codes = Array.isArray(b.codes) ? b.codes : (b.booking_category || []).map((x) => x.category?.code).filter(Boolean)
  const house = [c.premise, c.address_number].filter(Boolean).join(' ')
  return {
    bookingId: b.booking_id,
    surname: c.surname || '', forename: c.forename || '', fullname: `${c.forename || ''} ${c.surname || ''}`.trim(),
    dob: dobDDMMYYYY(c.date_of_birth), ni: c.ni_number || '',
    house, street: c.street || '', town: c.town || '', city: c.district || '', county: c.county || '',
    postcode: c.postcode || '', telephone: c.telephone || c.mobile || '', email: c.email || '',
    medical: !!(c.medical_needs && String(c.medical_needs).trim()),
    isReassessment: !!b.is_reassessment,
    codes,
    redirect: buildRedirect(b.company),
  }
}
const FORM_SELECT = 'booking_id,is_reassessment,client:client_id(*),company:company_id(name,address,send_to_employer),booking_category(category:category_id(code))'

export async function getFormData(bookingId) {
  if (LIVE) {
    const { data } = await supabase.from('booking').select(FORM_SELECT).eq('booking_id', bookingId).single()
    return data ? formDelegate(data) : null
  }
  const b = D.bookings.find((x) => x.booking_id === bookingId)
  if (!b) return null
  const c = cl(b.client_id)
  const company = co(b.company_id ?? c?.company_id)
  const codes = D.booking_categories.filter((x) => x.booking_id === bookingId).map((x) => cat(x.category_id)?.code).filter(Boolean)
  return formDelegate({ ...b, client: c, company, codes })
}

export async function getBlockFormData(sessionId) {
  if (LIVE) {
    const { data } = await supabase.from('booking').select(FORM_SELECT).eq('session_id', sessionId)
    return (data || []).map(formDelegate)
  }
  return D.bookings.filter((b) => b.session_id === sessionId).map((b) => {
    const c = cl(b.client_id)
    const company = co(b.company_id ?? c?.company_id)
    const codes = D.booking_categories.filter((x) => x.booking_id === b.booking_id).map((x) => cat(x.category_id)?.code).filter(Boolean)
    return formDelegate({ ...b, client: c, company, codes })
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
      kind: p.kind || 'NEW', catKinds: p.cat_kinds || null, mlp: !!p.mlp, igas: !!p.igas, prefFrom: p.prefFrom || null, prefTo: p.prefTo || null }
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
      .select('client_id,company_id,booking_category(category_id,result,is_reassessment)').eq('booking_id', bookingId).single()
    if (e0) throw e0
    const cats = (orig.booking_category || []).filter((x) => x.result !== 'PASS')
    // One booking per delegate per block: merge into an existing booking if they're already on the target.
    const { data: existing } = await supabase.from('booking').select('booking_id').eq('session_id', targetSessionId).eq('client_id', orig.client_id).maybeSingle()
    let targetId
    if (existing) {
      targetId = existing.booking_id
      const { data: have } = await supabase.from('booking_category').select('category_id').eq('booking_id', targetId)
      const haveSet = new Set((have || []).map((x) => x.category_id))
      const toAdd = cats.filter((x) => !haveSet.has(x.category_id))
      if (toAdd.length) {
        const { error: em } = await supabase.from('booking_category').insert(toAdd.map((x) => ({ booking_id: targetId, category_id: x.category_id, result: 'PENDING', is_reassessment: !!x.is_reassessment })))
        if (em) throw em
      }
    } else {
      const { data: bk, error: e1 } = await supabase.from('booking')
        .insert({ client_id: orig.client_id, session_id: targetSessionId, company_id: orig.company_id || null, overall_result: 'PENDING' })
        .select().single()
      if (e1) throw e1
      targetId = bk.booking_id
      if (cats.length) {
        const { error: e2 } = await supabase.from('booking_category').insert(cats.map((x) => ({ booking_id: targetId, category_id: x.category_id, result: 'PENDING', is_reassessment: !!x.is_reassessment })))
        if (e2) throw e2
      }
    }
    const { error: e3 } = await supabase.from('booking').update({ rescheduled: true }).eq('booking_id', bookingId)
    if (e3) throw e3
    notifyEmail({ kind: 'booking_rescheduled', ref: targetId })
    return
  }
  const orig = D.bookings.find((x) => x.booking_id === bookingId)
  if (!orig) return
  const cats = D.booking_categories.filter((x) => x.booking_id === bookingId && x.result !== 'PASS')
  const existing = D.bookings.find((x) => x.session_id === targetSessionId && x.client_id === orig.client_id)
  if (existing) {
    const have = new Set(D.booking_categories.filter((x) => x.booking_id === existing.booking_id).map((x) => x.category_id))
    for (const x of cats) if (!have.has(x.category_id)) D.booking_categories.push({ booking_category_id: ++D.seq.bcat, booking_id: existing.booking_id, category_id: x.category_id, result: 'PENDING', achieved_date: null, expiry_date: null, is_reassessment: !!x.is_reassessment })
  } else {
    const newId = ++D.seq.booking
    D.bookings.push({ booking_id: newId, client_id: orig.client_id, session_id: targetSessionId, company_id: orig.company_id, overall_result: 'PENDING', disposition: 'NONE', assess_notes: null, flag_mlp: orig.flag_mlp, flag_igas: orig.flag_igas, flag_payment_outstanding: false, flag_cert_outstanding: false, flag_photo_outstanding: false, sage_ref: null, is_reassessment: orig.is_reassessment, pref_date_from: null, pref_date_to: null, rescheduled: false, last_chased: null, confirmation_sent_at: null })
    for (const x of cats) D.booking_categories.push({ booking_category_id: ++D.seq.bcat, booking_id: newId, category_id: x.category_id, result: 'PENDING', achieved_date: null, expiry_date: null, is_reassessment: !!x.is_reassessment })
  }
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
      premise: d.premise || null, street: d.street || null, town: d.town || null,
      county: d.county || null, postcode: d.postcode || null,
    }).select('client_id,forename,surname,company_id,company:company_id(name)').single()
    if (error) throw error
    return { ...data, company: data.company?.name }
  }
  const client_id = ++D.seq.client
  const row = { client_id, telephone: '', ...d }
  D.clients.push(row)
  return { ...row, company: co(d.company_id)?.name }
}

// ---- Course & qualification catalogue (item 5) --------------------------
export async function createCourse(d) {
  const row = { name: d.name, scheme: d.scheme || null, price: d.price ?? null, teamup_designator: d.teamup_designator || null, color: d.color || null, is_active: d.is_active !== false }
  if (LIVE) {
    const { data, error } = await supabase.from('course').insert(row).select().single()
    if (error) throw new Error(error.message)
    return data
  }
  const course_id = ++D.seq.course
  const full = { course_id, ...row, scheme: d.scheme || '', teamup_designator: d.teamup_designator || '' }
  D.courses.push(full)
  return full
}
export async function updateCourse(courseId, d) {
  if (LIVE) {
    const { error } = await supabase.from('course').update(d).eq('course_id', courseId)
    if (error) throw new Error(error.message)
    return
  }
  const c = crs(courseId)
  if (c) Object.assign(c, d)
}
export async function createCategory(d) {
  const row = { code: d.code, description: d.description || null, scheme: d.scheme || null, renewal_years: d.renewal_years ?? null, price: d.price ?? null, is_active: true }
  if (LIVE) {
    const { data, error } = await supabase.from('category').insert(row).select().single()
    if (error) throw new Error(error.message)
    return data
  }
  const category_id = ++D.seq.cat
  const full = { category_id, ...row, description: d.description || '', scheme: d.scheme || '' }
  D.categories.push(full)
  return full
}
export async function updateCategory(categoryId, d) {
  if (LIVE) {
    const { error } = await supabase.from('category').update(d).eq('category_id', categoryId)
    if (error) throw new Error(error.message)
    return
  }
  const c = cat(categoryId)
  if (c) Object.assign(c, d)
}

// ---- Inquiries (lead capture, item 1) -----------------------------------
function inqShape(r) {
  return {
    inquiryId: r.inquiry_id, name: r.name, email: r.email || '', mobile: r.mobile || '',
    courses: r.courses || '', prefFrom: r.pref_date_from || null, prefTo: r.pref_date_to || null,
    notes: r.notes || '', createdAt: r.created_at,
  }
}
export async function listInquiries() {
  if (LIVE) {
    const { data } = await supabase.from('inquiry').select('*').eq('status', 'open').order('created_at', { ascending: false })
    return (data || []).map(inqShape)
  }
  return D.inquiries.filter((x) => x.status === 'open')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(inqShape)
}
export async function createInquiry(d) {
  const row = {
    name: d.name, email: d.email || null, mobile: d.mobile || null, courses: d.courses || null,
    pref_date_from: d.prefFrom || null, pref_date_to: d.prefTo || null, notes: d.notes || null,
  }
  if (LIVE) {
    const { data, error } = await supabase.from('inquiry').insert(row).select().single()
    if (error) throw new Error(error.message)
    return inqShape(data)
  }
  const inquiry_id = ++D.seq.inquiry
  const full = { inquiry_id, ...row, status: 'open', created_at: new Date().toISOString(), handled_at: null }
  D.inquiries.unshift(full)
  return inqShape(full)
}
export async function setInquiryStatus(inquiryId, status) {
  if (LIVE) {
    const { error } = await supabase.from('inquiry').update({ status, handled_at: new Date().toISOString() }).eq('inquiry_id', inquiryId)
    if (error) throw new Error(error.message)
    return
  }
  const r = D.inquiries.find((x) => x.inquiry_id === inquiryId)
  if (r) { r.status = status; r.handled_at = new Date().toISOString() }
}

// Add a draft booking to the staging pool (one entry per course/scheme ticked).
// client: { client_id, forename, surname, company_id }
// cats:   array of { category_id, scheme }
// opts:   { kind:'NEW'|'REASSESS', mlp, igas, prefFrom, prefTo } — applied to every entry
export async function addToPool(client, cats, opts = {}) {
  const bySch = {}
  for (const c of cats) (bySch[c.scheme] = bySch[c.scheme] || []).push(c)
  const added = []
  for (const [scheme, list] of Object.entries(bySch)) {
    const ids = list.map((c) => c.category_id)
    const catKinds = {}
    list.forEach((c) => { catKinds[c.category_id] = c.kind === 'REASSESS' ? 'REASSESS' : 'NEW' })
    const kinds = new Set(Object.values(catKinds))
    const summary = kinds.size > 1 ? 'MIXED' : (kinds.has('REASSESS') ? 'REASSESS' : 'NEW')
    let entryId
    if (LIVE) {
      // A waiting delegate is a real booking with no block yet (session_id null).
      const { data: bk, error } = await supabase.from('booking').insert({
        client_id: client.client_id, session_id: null, company_id: client.company_id || null,
        overall_result: 'PENDING', flag_mlp: !!opts.mlp, flag_igas: !!opts.igas,
        is_reassessment: summary === 'REASSESS' || summary === 'MIXED',
        pref_date_from: opts.prefFrom || null, pref_date_to: opts.prefTo || null,
      }).select().single()
      if (error) throw new Error(error.message)
      entryId = bk.booking_id
      const bcRows = ids.map((cid) => ({ booking_id: bk.booking_id, category_id: cid, result: 'PENDING', is_reassessment: catKinds[cid] === 'REASSESS' }))
      if (bcRows.length) { const { error: e2 } = await supabase.from('booking_category').insert(bcRows); if (e2) throw new Error(e2.message) }
    } else {
      entryId = ++D.seq.pool
    }
    const entry = {
      id: entryId, client_id: client.client_id,
      forename: client.forename, surname: client.surname, company_id: client.company_id,
      scheme, category_ids: ids, cat_kinds: catKinds,
      kind: summary, mlp: !!opts.mlp, igas: !!opts.igas,
      prefFrom: opts.prefFrom || null, prefTo: opts.prefTo || null,
    }
    poolList.push(entry)
    added.push(entry)
  }
  return added
}

// Hydrate the in-memory pool from the DB (LIVE = bookings with no block yet).
export async function loadPool() {
  if (LIVE) {
    const { data } = await supabase
      .from('booking')
      .select('booking_id,client_id,company_id,is_reassessment,flag_mlp,flag_igas,pref_date_from,pref_date_to,client:client_id(forename,surname),booking_category(category_id,is_reassessment,category:category_id(scheme))')
      .is('session_id', null)
    poolList.length = 0
    for (const b of data || []) {
      const bcs = b.booking_category || []
      if (!bcs.length) continue
      const scheme = bcs[0].category?.scheme || null
      const catKinds = {}
      bcs.forEach((x) => { catKinds[x.category_id] = x.is_reassessment ? 'REASSESS' : 'NEW' })
      const kinds = new Set(Object.values(catKinds))
      poolList.push({
        id: b.booking_id, client_id: b.client_id,
        forename: b.client?.forename, surname: b.client?.surname, company_id: b.company_id,
        scheme, category_ids: bcs.map((x) => x.category_id), cat_kinds: catKinds,
        kind: kinds.size > 1 ? 'MIXED' : (kinds.has('REASSESS') ? 'REASSESS' : 'NEW'),
        mlp: !!b.flag_mlp, igas: !!b.flag_igas, prefFrom: b.pref_date_from || null, prefTo: b.pref_date_to || null,
      })
    }
  }
  return getPool()
}

// Is a given category in this pool entry a reassessment? Per-qualification now;
// falls back to the entry-level kind for older entries without cat_kinds.
function catReassess(p, cid) {
  if (p.cat_kinds) return p.cat_kinds[cid] === 'REASSESS'
  return p.kind === 'REASSESS' || p.kind === 'MIXED'
}

// Booking columns carrying the options captured at Book time. booking.is_reassessment
// is a SUMMARY (any qualification a reassessment); the per-qual flag lives on booking_category.
function bookingAttrs(p) {
  return {
    flag_mlp: !!p.mlp, flag_igas: !!p.igas,
    is_reassessment: p.kind === 'REASSESS' || p.kind === 'MIXED',
    pref_date_from: p.prefFrom || null, pref_date_to: p.prefTo || null,
  }
}

// Attach a waiting pool item to a block. booking has UNIQUE(client_id, session_id),
// so a delegate has ONE booking per block — if they already have one, MERGE this
// item's modules into it (one booking, many modules) rather than adding a second
// (which would silently violate the constraint and appear to "do nothing").
// Returns the booking id this pool item ended up as — the delegate's
// confirmation is sent against it, so the caller needs to know.
async function attachPoolItem(blockId, p) {
  if (LIVE) {
    const { data: existing } = await supabase.from('booking').select('booking_id').eq('session_id', blockId).eq('client_id', p.client_id).maybeSingle()
    if (existing) {
      const { data: have } = await supabase.from('booking_category').select('category_id').eq('booking_id', existing.booking_id)
      const haveSet = new Set((have || []).map((x) => x.category_id))
      const { data: wbcs } = await supabase.from('booking_category').select('booking_category_id,category_id').eq('booking_id', p.id)
      for (const bc of wbcs || []) {
        if (haveSet.has(bc.category_id)) await supabase.from('booking_category').delete().eq('booking_category_id', bc.booking_category_id)
        else await supabase.from('booking_category').update({ booking_id: existing.booking_id }).eq('booking_category_id', bc.booking_category_id)
      }
      await supabase.from('booking').delete().eq('booking_id', p.id)
      return existing.booking_id
    } else {
      const { error } = await supabase.from('booking').update({ session_id: blockId }).eq('booking_id', p.id)
      if (error) throw new Error(error.message)
      return p.id
    }
  } else {
    const existing = D.bookings.find((b) => b.session_id === blockId && b.client_id === p.client_id)
    if (existing) {
      const have = new Set(D.booking_categories.filter((x) => x.booking_id === existing.booking_id).map((x) => x.category_id))
      for (const cid of p.category_ids) {
        if (!have.has(cid)) D.booking_categories.push({ booking_category_id: ++D.seq.bcat, booking_id: existing.booking_id, category_id: cid, result: 'PENDING', achieved_date: null, expiry_date: null, is_reassessment: catReassess(p, cid) })
      }
      return existing.booking_id
    } else {
      const booking_id = ++D.seq.booking
      D.bookings.push({ booking_id, client_id: p.client_id, session_id: blockId, company_id: p.company_id ?? cl(p.client_id)?.company_id, overall_result: 'PENDING', disposition: 'NONE', assess_notes: null, flag_payment_outstanding: false, last_chased: null, confirmation_sent_at: null, ...bookingAttrs(p) })
      for (const cid of p.category_ids) D.booking_categories.push({ booking_category_id: ++D.seq.bcat, booking_id, category_id: cid, result: 'PENDING', achieved_date: null, expiry_date: null, is_reassessment: catReassess(p, cid) })
      return booking_id
    }
  }
}

export async function scheduleCourse({ scheme, courseId, assessorId, poolIds, from, to }) {
  const items = poolList.filter((p) => poolIds.includes(p.id))
  let blockId
  if (LIVE) {
    const { data: sess, error: e1 } = await supabase.from('session').insert({
      assessor_id: assessorId, course_id: courseId, start_date: from, end_date: to,
    }).select().single()
    if (e1) throw e1
    blockId = sess.session_id
  } else {
    blockId = ++D.seq.session
    D.sessions.push({ session_id: blockId, assessor_id: assessorId, course_id: courseId, start_date: from, end_date: to, teamup_event_id: 'tu-' + blockId })
  }
  for (const p of items) {
    const bookingId = await attachPoolItem(blockId, p)
    if (bookingId != null) notifyEmail({ kind: 'booking_confirmed', ref: bookingId })
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
      : result === 'NYC'
        ? { result: 'NYC', achieved_date: null, expiry_date: null }
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

const sanitizeUser = (u) => ({ user_id: u.user_id, username: u.username, name: u.name, email: u.email, role: u.role, is_active: u.is_active, staffId: u.staff_id ?? u.staffId ?? null })

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

// Nothing in the database points at a login, so this is a real delete. The
// guards live in the RPC (never yourself, never the last active admin) because
// a guard in the browser is a suggestion.
export async function deleteUser(userId, adminAuth) {
  if (LIVE) {
    const { data, error } = await supabase.rpc('app_delete_user', {
      p_admin: adminAuth.username, p_admin_pw: adminAuth.password, p_user_id: userId,
    })
    if (error) throw new Error(/Not authorized/.test(error.message) ? 'Password incorrect' : error.message)
    return data
  }
  const i = store.users.findIndex((u) => u.user_id === userId)
  if (i < 0) throw new Error('That login no longer exists')
  const u = store.users[i]
  if (u.role === 'ADMIN' && u.is_active && !store.users.some((x) => x.user_id !== userId && x.role === 'ADMIN' && x.is_active)) {
    throw new Error('That is the last admin account — make somebody else an admin first')
  }
  store.users.splice(i, 1)
  return { deleted: u.username }
}

export async function listUsers(adminAuth) {
  if (LIVE) {
    const { data, error } = await supabase.rpc('app_list_users', { p_admin: adminAuth.username, p_admin_pw: adminAuth.password })
    if (error) throw new Error(/Not authorized/.test(error.message) ? 'Password incorrect' : error.message)
    return (data || []).map(sanitizeUser)
  }
  return store.users.map(sanitizeUser).sort((a, b) => a.username.localeCompare(b.username))
}

export async function createUser({ username, name, email, role, password, staffId }, adminAuth) {
  const uname = (username || '').trim()
  if (!uname) throw new Error('Username is required')
  if (!password) throw new Error('Password is required')
  if (LIVE) {
    const { data, error } = await supabase.rpc('app_create_user', {
      p_admin: adminAuth.username, p_admin_pw: adminAuth.password,
      p_username: uname, p_name: name, p_email: email, p_role: role || 'STANDARD', p_password: password,
      p_staff_id: staffId != null && staffId !== '' ? Number(staffId) : null,
    })
    if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'That username is already taken' : error.message)
    return (data || [])[0]
  }
  const salt = randomSaltHex()
  const hash = await hashPassword(password, salt)
  if (store.users.some((u) => u.username.toLowerCase() === uname.toLowerCase())) throw new Error('That username is already taken')
  const row = { user_id: ++store.seq.user, username: uname, name, email, role: role || 'STANDARD', is_active: true, password_hash: hash, password_salt: salt, staff_id: staffId != null && staffId !== '' ? Number(staffId) : null }
  store.users.push(row)
  return sanitizeUser(row)
}

export async function updateUser(userId, patch, adminAuth) {
  if (LIVE) {
    const { error } = await supabase.rpc('app_update_user', {
      p_admin: adminAuth.username, p_admin_pw: adminAuth.password, p_target: userId,
      p_name: patch.name ?? null, p_email: patch.email ?? null, p_role: patch.role ?? null,
      p_is_active: 'is_active' in patch ? patch.is_active : null,
      p_set_staff: 'staffId' in patch,
      p_staff_id: 'staffId' in patch && patch.staffId != null && patch.staffId !== '' ? Number(patch.staffId) : null,
    })
    if (error) throw new Error(error.message)
    return
  }
  const fields = {}
  for (const k of ['name', 'email', 'role', 'is_active']) if (k in patch) fields[k] = patch[k]
  if ('staffId' in patch) fields.staff_id = patch.staffId != null && patch.staffId !== '' ? Number(patch.staffId) : null
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

// Current staff by default. Somebody who has left keeps their record and
// everything they ever taught — they simply stop appearing here, and therefore
// stop appearing in every trainer / assessor / verifier picker in the app,
// because they all read this one function. Pass { includeLeft: true } for the
// Admin list's "Show past staff" tick.
const staffShape = (s) => ({
  staff_id: s.assessor_id, name: s.name, room: s.assigned_room, email: s.email,
  teamup: s.teamup_subcalendar, leftOn: s.left_on || null,
  color: ASSESSOR_COLOR[s.assessor_id] || '#48566a',
})

export async function listStaff({ includeLeft = false } = {}) {
  if (LIVE) {
    let q = supabase.from('assessor').select('*').eq('is_active', true)
    if (!includeLeft) q = q.is('left_on', null)
    const { data } = await q.order('name')
    return (data || []).map(staffShape)
  }
  return D.assessors
    .filter((a) => a.is_active !== false && (includeLeft || !a.left_on))
    .map(staffShape)
}

// Leaving, and coming back. A date rather than a flag, so "when did Denis
// leave?" is answerable later.
export async function setStaffLeft(staffId, leftOn) {
  const value = leftOn === null ? null : (leftOn || todayISO())
  if (LIVE) {
    const { error } = await supabase.from('assessor').update({ left_on: value }).eq('assessor_id', staffId)
    if (error) throw new Error(error.message)
    return value
  }
  const a = D.assessors.find((x) => x.assessor_id === staffId)
  if (a) a.left_on = value
  return value
}

// What a staff record is attached to. Used to decide whether "remove" means
// "mark as left" (a real person with a history) or "delete outright" (a seed
// row nobody has ever used), and to warn about courses still to come.
export async function staffUsage(staffId) {
  const today = todayISO()
  if (LIVE) {
    const { data: ses } = await supabase.from('session')
      .select('session_id,end_date,trainer_id,assessor_id,verifier_id')
      .or(`trainer_id.eq.${staffId},assessor_id.eq.${staffId},verifier_id.eq.${staffId}`)
    const rows = ses || []
    const { count: bookings } = await supabase.from('booking')
      .select('booking_id', { count: 'exact', head: true })
      .or(`trainer_id.eq.${staffId},verifier_id.eq.${staffId}`)
    return {
      sessions: rows.length,
      upcoming: rows.filter((s) => !s.end_date || s.end_date >= today).length,
      bookings: bookings || 0,
    }
  }
  const rows = D.sessions.filter((s) => s.trainer_id === staffId || s.assessor_id === staffId || s.verifier_id === staffId)
  return { sessions: rows.length, upcoming: rows.filter((s) => !s.end_date || s.end_date >= today).length, bookings: 0 }
}

// Only for a record with no history at all — a seed row, or one added by
// mistake. The database refuses anything else (session and booking both point
// at assessor with NO ACTION), which is the guarantee that a real person's
// history cannot be deleted by accident from this screen.
export async function deleteStaff(staffId) {
  if (LIVE) {
    const { error } = await supabase.from('assessor').delete().eq('assessor_id', staffId)
    if (error) {
      if (error.code === '23503') {
        throw new Error('This person is on courses or bookings, so their record has to stay. Mark them as left instead — their history is kept and they disappear from the lists.')
      }
      throw new Error(error.message)
    }
    return
  }
  const i = D.assessors.findIndex((x) => x.assessor_id === staffId)
  if (i >= 0) D.assessors.splice(i, 1)
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

export async function updateStaff(staffId, d) {
  const patch = {}
  if ('name' in d) patch.name = d.name
  if ('email' in d) patch.email = d.email
  if ('room' in d) patch.assigned_room = d.room
  if (!Object.keys(patch).length) return
  if (LIVE) {
    const { error } = await supabase.from('assessor').update(patch).eq('assessor_id', staffId)
    if (error) throw new Error(error.message)
    return
  }
  const a = D.assessors.find((x) => x.assessor_id === staffId)
  if (a) Object.assign(a, patch)
}

// ---- Holidays (staff time off) ----------------------------------------------
// Time off is now a request with a decision on it. REJECTED rows are dropped
// here rather than filtered by every caller — a refused request is not time off
// and has no business on a calendar.
const holidayShape = (h, name) => ({
  holidayId: h.holiday_id, staffId: h.staff_id, staffName: name,
  start: h.start_date, end: h.end_date, note: h.note || '',
  status: h.status || 'APPROVED',
  pending: (h.status || 'APPROVED') === 'REQUESTED',
  decisionNote: h.decision_note || '',
})

export async function listHolidays({ includeRejected = false } = {}) {
  if (LIVE) {
    let q = supabase.from('holiday')
      .select('holiday_id,staff_id,start_date,end_date,note,status,decision_note,staff:staff_id(name)')
    if (!includeRejected) q = q.neq('status', 'REJECTED')
    const { data } = await q.order('start_date')
    return (data || []).map((h) => holidayShape(h, h.staff?.name || '—'))
  }
  D.holidays = D.holidays || []
  return D.holidays
    .filter((h) => includeRejected || (h.status || 'APPROVED') !== 'REJECTED')
    .map((h) => holidayShape(h, asr(h.staff_id)?.name || '—'))
}

// ─────────────────────────────────────────────────────────────────────────────
// App settings — small, non-secret, one row per key. Readable by anyone (the
// calendar has to know who approves holidays before it can decide whether to
// ask), writable only by an admin.
// ─────────────────────────────────────────────────────────────────────────────
export async function getSettings() {
  if (LIVE) {
    const { data } = await supabase.from('app_setting').select('key,value')
    const out = {}
    for (const r of data || []) out[r.key] = r.value
    return out
  }
  store.settings = store.settings || { holiday_approver_staff_id: null }
  return { ...store.settings }
}

export async function saveSetting(key, value, adminAuth) {
  if (LIVE) {
    const { error } = await supabase.rpc('app_setting_save', {
      p_admin: adminAuth.username, p_admin_pw: adminAuth.password, p_key: key, p_value: value,
    })
    if (error) throw new Error(/Not authorized/.test(error.message) ? 'Password incorrect' : error.message)
    return value
  }
  store.settings = store.settings || {}
  store.settings[key] = value
  return value
}

// Who may approve time off: the named approver, and any admin as the fallback
// so nothing stalls for a fortnight while that person is in Australia.
export function canApproveHolidays(user, settings) {
  if (!user) return false
  if (user.role === 'ADMIN') return true
  const approver = settings ? settings.holiday_approver_staff_id : null
  return approver != null && String(approver) === String(user.staffId)
}

// Everything still waiting on somebody, for the approver's list.
export async function listHolidayRequests() {
  if (LIVE) {
    const { data } = await supabase.from('holiday')
      .select('holiday_id,staff_id,start_date,end_date,note,status,decision_note,staff:staff_id(name)')
      .eq('status', 'REQUESTED').order('start_date')
    return (data || []).map((h) => holidayShape(h, h.staff?.name || '—'))
  }
  return (D.holidays || []).filter((h) => h.status === 'REQUESTED')
    .map((h) => holidayShape(h, asr(h.staff_id)?.name || '—'))
}

// asApprover: the person entering it can approve holidays, so theirs goes
// straight on the calendar. Everyone else's waits, and the approver is emailed.
export async function createHoliday({ staffId, from, to, note, requestedBy = null, asApprover = false }) {
  if (!staffId) throw new Error('Pick a staff member')
  if (!from || !to) throw new Error('Set start and end dates')
  if (from > to) throw new Error('Start must be on or before end')
  const status = asApprover ? 'APPROVED' : 'REQUESTED'
  let id = null
  if (LIVE) {
    const { data, error } = await supabase.from('holiday').insert({
      staff_id: Number(staffId), start_date: from, end_date: to, note: note || null,
      status, requested_by: requestedBy ? Number(requestedBy) : null,
      decided_at: asApprover ? new Date().toISOString() : null,
      decided_by: asApprover && requestedBy ? Number(requestedBy) : null,
    }).select('holiday_id').single()
    if (error) throw new Error(error.message)
    id = data?.holiday_id ?? null
  } else {
    D.holidays = D.holidays || []; D.seq.holiday = D.seq.holiday || 0
    id = ++D.seq.holiday
    D.holidays.push({ holiday_id: id, staff_id: Number(staffId), start_date: from, end_date: to, note: note || null, status, requested_by: requestedBy || null })
  }
  if (status === 'REQUESTED' && id != null) notifyEmail({ kind: 'holiday_requested', ref: id })
  return { holidayId: id, status }
}

// Approve or reject. The reason is optional on an approval and worth insisting
// on for a refusal, which is why the screen asks for one.
export async function decideHoliday(holidayId, decision, { note = '', decidedBy = null } = {}) {
  const id = Number(holidayId)
  const status = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED'
  if (LIVE) {
    const { error } = await supabase.from('holiday').update({
      status, decision_note: note || null,
      decided_by: decidedBy ? Number(decidedBy) : null, decided_at: new Date().toISOString(),
    }).eq('holiday_id', id)
    if (error) throw new Error(error.message)
  } else {
    const h = (D.holidays || []).find((x) => x.holiday_id === id)
    if (h) Object.assign(h, { status, decision_note: note || null, decided_by: decidedBy || null })
  }
  notifyEmail({ kind: status === 'APPROVED' ? 'holiday_approved' : 'holiday_rejected', ref: id })
  return status
}
export async function deleteHoliday(holidayId) {
  const id = Number(holidayId)
  if (LIVE) {
    const { error } = await supabase.from('holiday').delete().eq('holiday_id', id)
    if (error) throw new Error(error.message)
    return
  }
  D.holidays = (D.holidays || []).filter((h) => h.holiday_id !== id)
}
// Pure helper: does this staff member have any holiday overlapping [from,to]?
export function staffOnHoliday(holidays, staffId, from, to) {
  return (holidays || []).some((h) => String(h.staffId) === String(staffId) && h.start <= to && h.end >= from)
}
// Inclusive day count of a date range.
export function rangeDays(from, to) {
  if (!from || !to) return 0
  return Math.round((new Date(to) - new Date(from)) / 86400000) + 1
}
// Inclusive WEEKDAY count (Sat/Sun excluded) — used for holiday days taken.
export function weekdayDays(from, to) {
  if (!from || !to) return 0
  let n = 0; const d = new Date(from + 'T00:00:00'); const end = new Date(to + 'T00:00:00')
  while (d <= end) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; d.setDate(d.getDate() + 1) }
  return n
}

// ---- Engagements (personal timed calendar entries) --------------------------
const ENG_COLS = 'engagement_id,owner_user_id,title,start_date,start_time,end_time'
// An engagement shows on your calendar if you own it OR you're a member (your staff_id).
export async function listEngagements(ownerUserId, ownerStaffId) {
  if (LIVE) {
    let rows = []
    if (ownerUserId == null && ownerStaffId == null) {
      rows = (await supabase.from('engagement').select(ENG_COLS).order('start_date')).data || []
    } else {
      if (ownerUserId != null) rows = (await supabase.from('engagement').select(ENG_COLS).eq('owner_user_id', ownerUserId)).data || []
      if (ownerStaffId != null) {
        const { data: mrows } = await supabase.from('engagement_member').select('engagement_id').eq('staff_id', Number(ownerStaffId))
        const ids = [...new Set((mrows || []).map((r) => r.engagement_id))].filter((id) => !rows.some((o) => o.engagement_id === id))
        if (ids.length) rows = rows.concat((await supabase.from('engagement').select(ENG_COLS).in('engagement_id', ids)).data || [])
      }
    }
    const ids = rows.map((r) => r.engagement_id)
    const memMap = {}
    if (ids.length) {
      const { data: mem } = await supabase.from('engagement_member').select('engagement_id,staff_id,assessor:staff_id(name)').in('engagement_id', ids)
      for (const m of mem || []) (memMap[m.engagement_id] ||= []).push({ staffId: m.staff_id, name: m.assessor?.name || '—' })
    }
    return rows.map((e) => ({ engagementId: e.engagement_id, ownerUserId: e.owner_user_id, title: e.title, date: e.start_date, startTime: e.start_time, endTime: e.end_time, members: memMap[e.engagement_id] || [] }))
  }
  D.engagements = D.engagements || []; D.engagementMembers = D.engagementMembers || []
  const owned = D.engagements.filter((e) => (ownerUserId == null && ownerStaffId == null) || e.owner_user_id === ownerUserId)
  const memIds = D.engagementMembers.filter((m) => ownerStaffId != null && m.staff_id === Number(ownerStaffId)).map((m) => m.engagement_id)
  const extra = D.engagements.filter((e) => memIds.includes(e.engagement_id) && !owned.includes(e))
  return [...owned, ...extra].map((e) => ({
    engagementId: e.engagement_id, ownerUserId: e.owner_user_id, title: e.title, date: e.start_date, startTime: e.start_time, endTime: e.end_time,
    members: D.engagementMembers.filter((m) => m.engagement_id === e.engagement_id).map((m) => ({ staffId: m.staff_id, name: (D.assessors.find((a) => a.assessor_id === m.staff_id) || {}).name || '—' })),
  }))
}
export async function createEngagement({ ownerUserId, title, date, startTime, endTime, memberStaffIds }) {
  if (!title || !title.trim()) throw new Error('Enter a title')
  if (!date) throw new Error('Pick a date')
  const members = (memberStaffIds || []).map(Number).filter(Boolean)
  if (LIVE) {
    const { data, error } = await supabase.from('engagement').insert({ owner_user_id: ownerUserId ?? null, title: title.trim(), start_date: date, start_time: startTime || null, end_time: endTime || null }).select('engagement_id').single()
    if (error) throw new Error(error.message)
    if (members.length) {
      const { error: e2 } = await supabase.from('engagement_member').insert(members.map((sid) => ({ engagement_id: data.engagement_id, staff_id: sid })))
      if (e2) throw new Error(e2.message)
    }
    return
  }
  D.engagements = D.engagements || []; D.seq.engagement = D.seq.engagement || 0; D.engagementMembers = D.engagementMembers || []
  const id = ++D.seq.engagement
  D.engagements.push({ engagement_id: id, owner_user_id: ownerUserId ?? null, title: title.trim(), start_date: date, start_time: startTime || null, end_time: endTime || null })
  for (const sid of members) D.engagementMembers.push({ engagement_id: id, staff_id: sid })
}
export async function deleteEngagement(engagementId) {
  const id = Number(engagementId)
  if (LIVE) { const { error } = await supabase.from('engagement').delete().eq('engagement_id', id); if (error) throw new Error(error.message); return }
  D.engagements = (D.engagements || []).filter((e) => e.engagement_id !== id)
  D.engagementMembers = (D.engagementMembers || []).filter((m) => m.engagement_id !== id)
}
export async function updateHoliday(holidayId, { from, to }) {
  const patch = {}
  if (from) patch.start_date = from
  if (to) patch.end_date = to
  if (!Object.keys(patch).length) return
  if (LIVE) { const { error } = await supabase.from('holiday').update(patch).eq('holiday_id', Number(holidayId)); if (error) throw new Error(error.message); return }
  const h = (D.holidays || []).find((x) => x.holiday_id === Number(holidayId)); if (h) Object.assign(h, patch)
}
export async function updateEngagement(engagementId, { date, startTime, endTime, memberStaffIds }) {
  const id = Number(engagementId)
  const patch = {}
  if (date) patch.start_date = date
  if (startTime !== undefined) patch.start_time = startTime || null
  if (endTime !== undefined) patch.end_time = endTime || null
  if (LIVE) {
    if (Object.keys(patch).length) { const { error } = await supabase.from('engagement').update(patch).eq('engagement_id', id); if (error) throw new Error(error.message) }
    if (memberStaffIds !== undefined) {
      const members = (memberStaffIds || []).map(Number).filter(Boolean)
      await supabase.from('engagement_member').delete().eq('engagement_id', id)
      if (members.length) { const { error } = await supabase.from('engagement_member').insert(members.map((sid) => ({ engagement_id: id, staff_id: sid }))); if (error) throw new Error(error.message) }
    }
    return
  }
  const e = (D.engagements || []).find((x) => x.engagement_id === id); if (e) Object.assign(e, patch)
  if (memberStaffIds !== undefined) {
    D.engagementMembers = (D.engagementMembers || []).filter((m) => m.engagement_id !== id)
    for (const sid of (memberStaffIds || []).map(Number).filter(Boolean)) D.engagementMembers.push({ engagement_id: id, staff_id: sid })
  }
}

// Booking-type for a delegate inside a block: a no-show/NYC disposition wins,
// otherwise reassessment vs new. Mirrors the waiting-pool colour kinds.
const delegateKind = (disposition, isReassess) =>
  disposition === 'NO_SHOW' ? 'NO_SHOW' : disposition === 'NYC' ? 'NYC' : isReassess ? 'REASSESS' : 'NEW'

// Per-module kind: NEW (all new) / REASSESS (all reassessment) / MIXED (both).
// disposition (NYC/No-show) still wins. flags = per-category is_reassessment booleans.
const kindFromFlags = (disposition, flags) => {
  if (disposition === 'NO_SHOW') return 'NO_SHOW'
  if (disposition === 'NYC') return 'NYC'
  if (!flags.length) return 'NEW'
  const re = flags.filter(Boolean).length
  return re === 0 ? 'NEW' : re === flags.length ? 'REASSESS' : 'MIXED'
}

// A "block" = a course session (course + dates) with its three role slots and delegates.
export async function listBlocks() {
  if (LIVE) {
    const { data } = await supabase
      .from('session')
      .select('session_id,start_date,end_date,teamup_event_id,trainer_id,assessor_id,verifier_id,course:course_id(course_id,name,scheme,color,teamup_designator),trainer:trainer_id(name,left_on),assessor:assessor_id(name),verifier:verifier_id(name),booking(booking_id,is_reassessment,disposition,attend_from,attend_to,client:client_id(forename,surname),company:company_id(name),booking_category(category_id,is_reassessment,category:category_id(code))))')
      .order('start_date')
    return (data || []).map((s) => block({
      id: s.session_id, start: s.start_date, end: s.end_date, designator: s.course?.teamup_designator,
      courseId: s.course?.course_id, course: s.course?.name, scheme: s.course?.scheme, color: s.course?.color,
      trainerId: s.trainer_id, assessorId: s.assessor_id, verifierId: s.verifier_id,
      trainer: s.trainer?.name, assessor: s.assessor?.name, verifier: s.verifier?.name,
      trainerLeftOn: s.trainer?.left_on || null,
      delegates: (s.booking || []).map((b) => ({
        bookingId: b.booking_id, name: `${b.client.forename} ${b.client.surname}`,
        kind: kindFromFlags(b.disposition, (b.booking_category || []).map((x) => !!x.is_reassessment)),
        codes: (b.booking_category || []).map((x) => x.category?.code).filter(Boolean),
        categoryIds: (b.booking_category || []).map((x) => x.category_id),
        attendFrom: b.attend_from || null, attendTo: b.attend_to || null,
        employer: b.company?.name || null,
      })),
    }))
  }
  return D.sessions.map((s) => {
    const course = crs(s.course_id)
    const bks = D.bookings.filter((b) => b.session_id === s.session_id)
    return block({
      id: s.session_id, start: s.start_date, end: s.end_date, designator: course?.teamup_designator,
      courseId: s.course_id, course: course?.name, scheme: course?.scheme, color: course?.color,
      trainerId: s.trainer_id, assessorId: s.assessor_id, verifierId: s.verifier_id,
      trainer: asr(s.trainer_id)?.name, assessor: asr(s.assessor_id)?.name, verifier: asr(s.verifier_id)?.name,
      trainerLeftOn: asr(s.trainer_id)?.left_on || null,
      delegates: bks.map((b) => ({
        bookingId: b.booking_id, name: `${cl(b.client_id).forename} ${cl(b.client_id).surname}`,
        kind: kindFromFlags(b.disposition, D.booking_categories.filter((x) => x.booking_id === b.booking_id).map((x) => !!x.is_reassessment)),
        codes: D.booking_categories.filter((x) => x.booking_id === b.booking_id).map((x) => cat(x.category_id)?.code).filter(Boolean),
        categoryIds: D.booking_categories.filter((x) => x.booking_id === b.booking_id).map((x) => x.category_id),
        attendFrom: b.attend_from || null, attendTo: b.attend_to || null,
        employer: co(b.company_id)?.name || null,
      })),
    })
  })
}

function block(b) {
  // A course that has already run keeps its trainer's name for the record, even
  // if that person has since left. One still to come needs somebody who is
  // actually here — so it counts as unstaffed and shows up in "Needs attention"
  // rather than quietly looking covered.
  const over = b.end && b.end < todayISO()
  const trainerGone = Boolean(b.trainerId && b.trainerLeftOn && !over)
  // A block is schedulable/pushable once it has a Trainer and at least one
  // delegate. Assessor + Verifier are now chosen at the assessment phase.
  const ready = Boolean(b.trainerId && !trainerGone && b.delegates.length)
  return { ...b, ready, trainerGone }
}

export async function assignBlockRole(blockId, role, staffId) {
  const col = ROLE_COL[role]
  if (!col) throw new Error('Unknown role')
  const value = staffId || null

  // Who was on it before, so a swap can tell BOTH people. Read before the
  // write, obviously — afterwards the old name is gone.
  let prev = null
  if (role === 'trainer') {
    if (LIVE) {
      const { data } = await supabase.from('session').select('trainer_id').eq('session_id', blockId).maybeSingle()
      prev = data ? data.trainer_id : null
    } else {
      const s0 = ses(blockId)
      prev = s0 ? s0.trainer_id || null : null
    }
  }

  if (LIVE) {
    const { error } = await supabase.from('session').update({ [col]: value }).eq('session_id', blockId)
    if (error) throw new Error(error.message)
  } else {
    const s = ses(blockId)
    if (s) s[col] = value
  }

  // Only the trainer is notified. Assessor and verifier are chosen at the
  // assessment phase, on the day, with the person in the room.
  if (role === 'trainer' && prev !== value) {
    if (prev) notifyEmail({ kind: 'trainer_removed', sessionId: blockId, staffId: prev })
    if (value) notifyEmail({ kind: 'trainer_assigned', sessionId: blockId })
  }
}

export async function addDelegatesToBlock(blockId, poolIds) {
  const items = poolList.filter((p) => poolIds.includes(p.id))
  for (const p of items) {
    const bookingId = await attachPoolItem(blockId, p)
    // Being given dates is the moment there is something worth telling them.
    if (bookingId != null) notifyEmail({ kind: 'booking_confirmed', ref: bookingId })
  }
  for (const p of items) {
    const i = poolList.findIndex((x) => x.id === p.id)
    if (i >= 0) poolList.splice(i, 1)
  }
  return items.length
}

// Add one or more qualifications to a delegate's EXISTING booking (item 13 —
// "he's also going to do this"). cats = [{ category_id, kind:'NEW'|'REASSESS' }].
// Skips qualifications already on the booking; keeps booking.is_reassessment in sync.
export async function addQualsToBooking(bookingId, cats) {
  if (!cats || !cats.length) return 0
  if (LIVE) {
    const { data: existing } = await supabase.from('booking_category').select('category_id').eq('booking_id', bookingId)
    const have = new Set((existing || []).map((x) => x.category_id))
    const rows = cats.filter((c) => !have.has(c.category_id))
      .map((c) => ({ booking_id: bookingId, category_id: c.category_id, result: 'PENDING', is_reassessment: c.kind === 'REASSESS' }))
    if (rows.length) {
      const { error } = await supabase.from('booking_category').insert(rows)
      if (error) throw new Error(error.message)
      if (rows.some((r) => r.is_reassessment)) await supabase.from('booking').update({ is_reassessment: true }).eq('booking_id', bookingId)
    }
    return rows.length
  }
  const have = new Set(D.booking_categories.filter((x) => x.booking_id === bookingId).map((x) => x.category_id))
  let n = 0
  for (const c of cats) {
    if (have.has(c.category_id)) continue
    D.booking_categories.push({ booking_category_id: ++D.seq.bcat, booking_id: bookingId, category_id: c.category_id, result: 'PENDING', achieved_date: null, expiry_date: null, is_reassessment: c.kind === 'REASSESS' })
    have.add(c.category_id); n++
  }
  if (n) { const b = D.bookings.find((x) => x.booking_id === bookingId); if (b && cats.some((c) => c.kind === 'REASSESS')) b.is_reassessment = true }
  return n
}


// --- Catalogue tidy tools (move = updateCourse/updateCategory with {scheme}; delete below) ---
export async function deleteCourse(courseId) {
  if (LIVE) {
    const { error } = await supabase.from('course').delete().eq('course_id', courseId)
    if (error) throw new Error(error.code === '23503' ? 'This course has sessions/bookings — cannot delete. Set it inactive instead.' : error.message)
    return
  }
  if (D.sessions.some((s) => s.course_id === courseId)) throw new Error('This course has sessions — cannot delete. Set it inactive instead.')
  if (D.mlp_courses.some((m) => m.course_id === courseId)) throw new Error('This course is part of an MLP — cannot delete.')
  const i = D.courses.findIndex((c) => c.course_id === courseId)
  if (i >= 0) D.courses.splice(i, 1)
}

export async function deleteCategory(categoryId) {
  if (LIVE) {
    const { error } = await supabase.from('category').delete().eq('category_id', categoryId)
    if (error) throw new Error(error.code === '23503' ? 'This qualification is used in bookings — cannot delete. Set it inactive instead.' : error.message)
    return
  }
  if (D.booking_categories.some((bc) => bc.category_id === categoryId)) throw new Error('This qualification is used in bookings — cannot delete. Set it inactive instead.')
  if (D.pool.some((p) => (p.category_ids || []).includes(categoryId))) throw new Error('This qualification is in the scheduling pool — cannot delete.')
  const i = D.categories.findIndex((c) => c.category_id === categoryId)
  if (i >= 0) D.categories.splice(i, 1)
}

// Distinct schemes from the category catalogue — single source for all filter dropdowns.
export async function listSchemes() {
  if (LIVE) {
    const { data } = await supabase.from('category').select('scheme')
    return [...new Set((data || []).map((r) => r.scheme).filter(Boolean))].sort()
  }
  return [...new Set(D.categories.map((c) => c.scheme).filter(Boolean))].sort()
}

// Create an empty block (course + span) in advance — Simon authors these ahead of time.
export async function createBlock({ courseId, from, to }) {
  if (LIVE) {
    const { data, error } = await supabase.from('session').insert({ course_id: courseId, start_date: from, end_date: to }).select().single()
    if (error) throw new Error(error.message)
    return data.session_id
  }
  const session_id = ++D.seq.session
  D.sessions.push({ session_id, course_id: courseId, start_date: from, end_date: to, trainer_id: null, assessor_id: null, verifier_id: null, teamup_event_id: 'tu-' + session_id })
  return session_id
}

// Move/resize a block on the calendar — persist new start/end dates (drag-move or
// edge-resize). Dates are ISO 'YYYY-MM-DD'. Used by the calendar.
export async function updateBlock(sessionId, { from, to, courseId }) {
  const patch = {}
  if (from) patch.start_date = from
  if (to) patch.end_date = to
  if (courseId) patch.course_id = courseId
  if (!Object.keys(patch).length) return

  // The dates it is moving FROM, for the email. Read first, same reason as above.
  let before = null
  if (LIVE) {
    const { data } = await supabase.from('session')
      .select('start_date,end_date,trainer_id').eq('session_id', sessionId).maybeSingle()
    before = data || null
  } else {
    const s0 = D.sessions.find((x) => x.session_id === sessionId)
    before = s0 ? { start_date: s0.start_date, end_date: s0.end_date, trainer_id: s0.trainer_id } : null
  }

  if (LIVE) {
    const { error } = await supabase.from('session').update(patch).eq('session_id', sessionId)
    if (error) throw new Error(error.message)
  } else {
    const s = D.sessions.find((x) => x.session_id === sessionId)
    if (s) Object.assign(s, patch)
  }

  // Only when the DATES actually changed and somebody is down to run it. A
  // drag that lands where it started is not news, and neither is a course with
  // no trainer on it yet.
  const moved = before && before.trainer_id
    && ((from && from !== before.start_date) || (to && to !== before.end_date))
  if (moved) {
    notifyEmail({
      kind: 'course_moved', sessionId,
      prevStart: before.start_date, prevEnd: before.end_date,
    })
  }

  // The delegates are on that course too. One email each, with the dates it
  // moved from — the ten-minute rule stops a nudged bar filling anybody's inbox.
  const datesChanged = before && ((from && from !== before.start_date) || (to && to !== before.end_date))
  if (datesChanged) {
    const ids = LIVE
      ? await supabase.from('booking').select('booking_id').eq('session_id', sessionId)
        .then(({ data }) => (data || []).map((b) => b.booking_id)).catch(() => [])
      : D.bookings.filter((b) => b.session_id === sessionId).map((b) => b.booking_id)
    for (const id of ids) {
      notifyEmail({ kind: 'booking_moved', ref: id, prevStart: before.start_date, prevEnd: before.end_date })
    }
  }
}

// Delete a block (session). Blocked if delegates are booked on it.
export async function deleteBlock(sessionId) {
  if (LIVE) {
    const { error } = await supabase.from('session').delete().eq('session_id', sessionId)
    if (error) throw new Error(error.code === '23503' ? 'This block has delegates booked — remove them first.' : error.message)
    return
  }
  if (D.bookings.some((b) => b.session_id === sessionId)) throw new Error('This block has delegates booked — remove them first.')
  const i = D.sessions.findIndex((x) => x.session_id === sessionId)
  if (i >= 0) D.sessions.splice(i, 1)
}

// Set a delegate's attendance window inside the block (null/null = full course).
export async function setBookingAttendance(bookingId, from, to) {
  const patch = { attend_from: from || null, attend_to: to || null }
  if (LIVE) {
    const { error } = await supabase.from('booking').update(patch).eq('booking_id', bookingId)
    if (error) throw new Error(error.message)
    return
  }
  const b = D.bookings.find((x) => x.booking_id === bookingId)
  if (b) Object.assign(b, patch)
}

// Put a scheduled delegate back into the waiting pool (un-schedule) — for when a
// delegate was placed on the wrong block.
export async function returnToPool(bookingId) {
  if (LIVE) {
    // Read the course first: once session_id is null the email cannot say what
    // they have been taken off, and the send happens after this returns.
    const { data: was } = await supabase.from('booking').select('session_id').eq('booking_id', bookingId).maybeSingle()
    const { error } = await supabase.from('booking').update({ session_id: null }).eq('booking_id', bookingId)
    if (error) throw new Error(error.message)
    if (was?.session_id) notifyEmail({ kind: 'booking_cancelled', ref: bookingId, session: was.session_id })
    return
  }
  const b = D.bookings.find((x) => x.booking_id === bookingId)
  if (!b) return
  const bcs = D.booking_categories.filter((x) => x.booking_id === bookingId)
  const catIds = bcs.map((x) => x.category_id)
  const catKinds = {}; bcs.forEach((x) => { catKinds[x.category_id] = x.is_reassessment ? 'REASSESS' : 'NEW' })
  const kinds = new Set(Object.values(catKinds))
  const client = cl(b.client_id)
  poolList.push({
    id: ++D.seq.pool, client_id: b.client_id, forename: client?.forename, surname: client?.surname, company_id: b.company_id,
    scheme: cat(catIds[0])?.scheme || null, category_ids: catIds, cat_kinds: catKinds,
    kind: kinds.size > 1 ? 'MIXED' : (kinds.has('REASSESS') ? 'REASSESS' : 'NEW'),
    mlp: !!b.flag_mlp, igas: !!b.flag_igas, prefFrom: b.pref_date_from || null, prefTo: b.pref_date_to || null,
  })
  D.booking_categories = D.booking_categories.filter((x) => x.booking_id !== bookingId)
  const i = D.bookings.findIndex((x) => x.booking_id === bookingId); if (i >= 0) D.bookings.splice(i, 1)
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF ACCREDITATIONS + EXPIRY
// The list of accreditations IS the qualification catalogue (src of truth =
// the `category` table), so it groups and orders exactly like the Courses
// screen and re-ordering there re-orders here. Two extra flags live on a
// category: `staff_only` (an award staff hold but delegates never book, e.g.
// verifier / IQA — hidden from booking) and `staff_requirement`
// (MUST / NICE / OPTIONAL — how hard a requirement it is to work at SGAS).
// A held accreditation is one row per staff member per qualification, updated
// in place on re-certification so the record shows the CURRENT position.
// ─────────────────────────────────────────────────────────────────────────────

export const STAFF_REQUIREMENTS = ['MUST', 'NICE', 'OPTIONAL']
export const REQUIREMENT_LABEL = { MUST: 'Must have', NICE: 'Nice to have', OPTIONAL: 'Optional' }
// How far ahead to start warning. Chosen per browser in the Admin panel.
export const WARN_MONTH_CHOICES = [3, 6, 9, 12]
export const DEFAULT_WARN_MONTHS = 6

// Pure: expiry from the date achieved + how many years it runs for.
// Returns null when either is missing (some awards never expire).
export function expiryFrom(achievedOn, years) {
  if (!achievedOn || years === '' || years === null || years === undefined) return null
  const n = Number(years)
  if (!Number.isFinite(n) || n <= 0) return null
  const d = new Date(achievedOn + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  // Whole years move the year; part years (e.g. 0.5) move whole months.
  if (Number.isInteger(n)) d.setFullYear(d.getFullYear() + n)
  else d.setMonth(d.getMonth() + Math.round(n * 12))
  return d.toISOString().slice(0, 10)
}

// Pure: where an accreditation stands today.
// state: 'none' (no expiry set) | 'ok' | 'due' (inside the warning window) | 'expired'
export function accreditationStatus(expiresOn, warnMonths = DEFAULT_WARN_MONTHS) {
  if (!expiresOn) return { state: 'none', days: null, label: 'No expiry set' }
  const days = daysUntil(expiresOn)
  if (days < 0) {
    const n = Math.abs(days)
    return { state: 'expired', days, label: n === 1 ? 'Expired yesterday' : `Expired ${n} days ago` }
  }
  const warnFrom = daysUntil(addMonths(todayISO(), warnMonths))
  const label = days === 0 ? 'Expires today' : days === 1 ? 'Expires tomorrow'
    : days < 60 ? `${days} days left`
    : `${Math.round(days / 30.44)} months left`
  return { state: days <= warnFrom ? 'due' : 'ok', days, label }
}

// The pick-list: every active qualification, ordered by scheme then code so the
// UI can group it the same way the Courses screen does.
export async function listAccreditationCatalogue() {
  const cats = await listCategories()
  return [...cats]
    .map((c) => ({
      category_id: c.category_id, code: c.code, description: c.description || '',
      scheme: c.scheme, renewal_years: c.renewal_years ?? null,
      staffOnly: !!c.staff_only, requirement: c.staff_requirement || null,
    }))
    .sort((a, b) => a.scheme.localeCompare(b.scheme) || a.code.localeCompare(b.code))
}

// Held accreditations. Pass a staffId for one person, or omit for everyone
// (that's what the report and the expiring-soon counts run off).
export async function listStaffAccreditations(staffId = null) {
  const shape = (r, cat) => ({
    id: r.staff_accreditation_id, staffId: r.staff_id, staffName: r.staffName || '',
    categoryId: r.category_id, code: cat?.code || '?', description: cat?.description || '',
    scheme: cat?.scheme || '—', requirement: cat?.staff_requirement || null,
    achievedOn: r.achieved_on || '', years: r.years ?? '', expiresOn: r.expires_on || '',
    evidenceUrl: r.evidence_url || '', evidenceName: r.evidence_name || '', notes: r.notes || '',
  })
  if (LIVE) {
    let q = supabase.from('staff_accreditation')
      .select('staff_accreditation_id,staff_id,category_id,achieved_on,years,expires_on,evidence_url,evidence_name,notes,staff:staff_id(name),category:category_id(code,description,scheme,staff_requirement)')
    if (staffId) q = q.eq('staff_id', Number(staffId))
    const { data } = await q
    return (data || [])
      .map((r) => shape({ ...r, staffName: r.staff?.name }, r.category))
      .sort((a, b) => a.scheme.localeCompare(b.scheme) || a.code.localeCompare(b.code))
  }
  D.staffAccreditations = D.staffAccreditations || []
  return D.staffAccreditations
    .filter((r) => !staffId || r.staff_id === Number(staffId))
    .map((r) => shape({ ...r, staffName: asr(r.staff_id)?.name }, D.categories.find((c) => c.category_id === r.category_id)))
    .sort((a, b) => a.scheme.localeCompare(b.scheme) || a.code.localeCompare(b.code))
}

// Add or update. One row per staff member per qualification — re-certifying
// overwrites rather than stacking up, so the record is always the current one.
export async function saveStaffAccreditation(d) {
  const staffId = Number(d.staffId), categoryId = Number(d.categoryId)
  if (!staffId) throw new Error('Pick a staff member')
  if (!categoryId) throw new Error('Pick an accreditation')
  if (d.achievedOn && d.expiresOn && d.expiresOn < d.achievedOn) {
    throw new Error('The expiry date is before the date achieved')
  }
  const row = {
    staff_id: staffId, category_id: categoryId,
    achieved_on: d.achievedOn || null,
    years: d.years === '' || d.years === null || d.years === undefined ? null : Number(d.years),
    expires_on: d.expiresOn || null,
    evidence_url: d.evidenceUrl || null, evidence_name: d.evidenceName || null,
    notes: d.notes || null,
  }
  if (LIVE) {
    const { error } = await supabase
      .from('staff_accreditation')
      .upsert(row, { onConflict: 'staff_id,category_id' })
    if (error) throw new Error(error.message)
    return
  }
  D.staffAccreditations = D.staffAccreditations || []
  D.seq.staffAccred = D.seq.staffAccred || 0
  const existing = D.staffAccreditations.find((r) => r.staff_id === staffId && r.category_id === categoryId)
  if (existing) Object.assign(existing, row)
  else D.staffAccreditations.push({ staff_accreditation_id: ++D.seq.staffAccred, ...row })
}

export async function deleteStaffAccreditation(id) {
  const n = Number(id)
  if (LIVE) {
    const { error } = await supabase.from('staff_accreditation').delete().eq('staff_accreditation_id', n)
    if (error) throw new Error(error.message)
    return
  }
  D.staffAccreditations = (D.staffAccreditations || []).filter((r) => r.staff_accreditation_id !== n)
}

// Tag a qualification as a staff requirement, and/or mark it staff-only so it
// stays off the booking screens. Pass null to clear.
export async function setCategoryStaffFlags(categoryId, { staffOnly, requirement }) {
  const id = Number(categoryId)
  const patch = {}
  if (staffOnly !== undefined) patch.staff_only = !!staffOnly
  if (requirement !== undefined) {
    if (requirement && !STAFF_REQUIREMENTS.includes(requirement)) throw new Error('Unknown requirement level')
    patch.staff_requirement = requirement || null
  }
  if (!Object.keys(patch).length) return
  if (LIVE) {
    const { error } = await supabase.from('category').update(patch).eq('category_id', id)
    if (error) throw new Error(error.message)
    return
  }
  const c = D.categories.find((x) => x.category_id === id)
  if (c) Object.assign(c, patch)
}

// =============================================================================
// EMAIL SETTINGS + SENDING
// The SMTP passwords are NOT kept in a column and never come back to the
// browser. app_smtp_get returns `password_set: true/false` and nothing more,
// which is what lets the Admin field sit blank after the first save. The
// password itself lives in Supabase Vault and is only ever decrypted inside the
// send-email Edge Function using the service-role key.
//
// Sending goes through that Edge Function too, so the credentials never reach
// the client at all. Admin credentials are re-confirmed on every call, exactly
// as the user-admin actions already do.
// =============================================================================

const DEMO_SMTP = {
  host: 'smtp.sgas.co.uk', port: 465, secure: true, updated_at: null,
  mailboxes: [
    { key: 'bookings', address: 'bookings@sgas.co.uk', username: 'bookings@sgas.co.uk', from_name: 'SGAS Bookings', password_set: false },
    { key: 'crm', address: 'crm@sgas.co.uk', username: 'crm@sgas.co.uk', from_name: 'SGAS', password_set: false },
    { key: 'holidays', address: 'holidays@sgas.co.uk', username: 'holidays@sgas.co.uk', from_name: 'SGAS Holidays', password_set: false },
  ],
}

export async function getSmtpSettings(adminAuth) {
  if (LIVE) {
    const { data, error } = await supabase.rpc('app_smtp_get', {
      p_admin: adminAuth.username, p_admin_pw: adminAuth.password,
    })
    if (error) throw new Error(/Not authorized/.test(error.message) ? 'Password incorrect' : error.message)
    return data
  }
  if (!store.smtp) store.smtp = JSON.parse(JSON.stringify(DEMO_SMTP))
  return JSON.parse(JSON.stringify(store.smtp))
}

// A blank password means "leave the stored one alone" — that is the whole point
// of the empty box. '__CLEAR__' removes one.
export async function saveSmtpSettings({ host, port, secure, mailboxes }, adminAuth) {
  if (LIVE) {
    const { data, error } = await supabase.rpc('app_smtp_save', {
      p_admin: adminAuth.username, p_admin_pw: adminAuth.password,
      p_host: host, p_port: Number(port) || 465, p_secure: !!secure,
      p_mailboxes: mailboxes,
    })
    if (error) throw new Error(/Not authorized/.test(error.message) ? 'Password incorrect' : error.message)
    return data
  }
  if (!store.smtp) store.smtp = JSON.parse(JSON.stringify(DEMO_SMTP))
  const s = store.smtp
  s.host = host || s.host; s.port = Number(port) || s.port; s.secure = !!secure
  for (const m of mailboxes || []) {
    const row = s.mailboxes.find((x) => x.key === m.key)
    if (!row) continue
    if (m.address) row.address = m.address
    if (m.username) row.username = m.username
    if (m.from_name) row.from_name = m.from_name
    if (m.password === '__CLEAR__') row.password_set = false
    else if (m.password) row.password_set = true
  }
  s.updated_at = new Date().toISOString()
  return JSON.parse(JSON.stringify(s))
}

// Every non-2xx from an Edge Function arrives as the same useless sentence --
// "Edge Function returned a non-2xx status code" -- because supabase-js puts
// the response body on error.context and leaves error.message generic. The
// first test send failed with a precise, correct explanation sitting in that
// body and Chris was shown the generic line instead. So: always dig it out.
async function functionError(error, fallback) {
  const res = error && error.context
  if (res && typeof res.json === 'function') {
    try {
      const body = await res.json()
      if (body && body.error) return new Error(String(body.error))
    } catch {
      // Not JSON. The body can only be read once, so a text() retry is likely
      // to fail too -- try anyway, then give up gracefully.
      try {
        const t = await res.text()
        if (t) return new Error(t.slice(0, 300))
      } catch { /* nothing readable left */ }
    }
  }
  return new Error((error && error.message) || fallback)
}

// One way in for every email the app sends, so that flows added later inherit
// the error handling rather than each inventing their own.
export async function sendMail({ mailbox = 'crm', to, subject, text, html, kind = 'manual', refId = null }, adminAuth) {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: {
      admin: adminAuth.username, admin_pw: adminAuth.password,
      mailbox, to, subject, text, html, kind, ref_id: refId,
    },
  })
  if (error) throw await functionError(error, 'The send failed')
  if (!data || !data.ok) throw new Error((data && data.error) || 'The send failed')
  return data
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications.
//
// Fire-and-forget ON PURPOSE. A trainer being emailed must never slow down, or
// fail, the thing the person on the screen actually asked for: dropping a name
// on a course has to feel instant, and an SMTP round trip does not. Nothing
// here is awaited by its caller and nothing here throws — every attempt is
// written to email_log, which is where "did it go?" is answered.
//
// The app sends NO wording and NO address. It says which session changed, and
// the database decides who is told and in what words (app_notify_context +
// the editable templates in Admin → Email settings). That is what lets this
// work without anybody's password: the browser does not keep one.
// ─────────────────────────────────────────────────────────────────────────────
export function notifyEmail({ kind, ref, sessionId, staffId = null, prevStart = null, prevEnd = null, session = null }) {
  const id = ref != null ? ref : sessionId          // a session, a holiday — whatever it is about
  if (!kind || id == null) return Promise.resolve({ ok: true, sent: false, skipped: 'nothing_to_send' })
  if (!LIVE) {
    // Demo mode has no mail server. Show it in the log so the Admin screen
    // demonstrates the flow.
    if (!store.emailLog) store.emailLog = []
    store.emailLog.unshift({
      sent_at: new Date().toISOString(), mailbox: 'crm', to_address: 'trainer@example.com',
      subject: `[demo] ${kind}`, kind, ok: true, error: null,
    })
    return Promise.resolve({ ok: true, sent: false, demo: true })
  }
  return supabase.functions
    .invoke('send-email', {
      body: {
        notify: kind, ref: id, staff_id: staffId, session,
        prev_start: prevStart, prev_end: prevEnd,
      },
    })
    .then(({ data, error }) => (error ? { ok: false } : data))
    .catch(() => ({ ok: false }))
}

// ─────────────────────────────────────────────────────────────────────────────
// The Access import worklist.
//
// Twenty years of free-text data entry means the file names its qualifications
// and its staff in ways only a person can resolve: "S GASDSDON", "S GADSDON",
// "S GASDSON" and "S G" are all Simon. Nothing is imported on a guess, so every
// distinct value gets a row here and a human decides what it means.
// ─────────────────────────────────────────────────────────────────────────────
export async function listImportMappings(adminAuth) {
  if (!LIVE) return []
  const { data, error } = await supabase.rpc('app_import_mappings', {
    p_admin: adminAuth.username, p_admin_pw: adminAuth.password,
  })
  if (error) throw new Error(/Not authorized/.test(error.message) ? 'Password incorrect' : error.message)
  return data || []
}

export async function saveImportMapping({ kind, source, decision, targetCode = null, targetId = null, note = null }, adminAuth) {
  if (!LIVE) return { ok: true }
  const { error } = await supabase.rpc('app_import_map_save', {
    p_admin: adminAuth.username, p_admin_pw: adminAuth.password,
    p_kind: kind, p_source: source, p_decision: decision,
    p_target_code: targetCode, p_target_id: targetId, p_note: note,
  })
  if (error) throw new Error(/Not authorized/.test(error.message) ? 'Password incorrect' : error.message)
  return { ok: true }
}

// Only fills in rows nobody has decided yet, so it can never overwrite an answer.
export async function acceptImportProposals(kind, adminAuth) {
  if (!LIVE) return 0
  const { data, error } = await supabase.rpc('app_import_accept_proposals', {
    p_admin: adminAuth.username, p_admin_pw: adminAuth.password, p_kind: kind,
  })
  if (error) throw new Error(/Not authorized/.test(error.message) ? 'Password incorrect' : error.message)
  return data || 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Account emails.
//
// These say something about somebody's login, so they are NOT on the open
// notify door — the Edge Function requires admin credentials for them.
// Otherwise anyone holding the public key could tell a member of staff their
// password had been changed.
//
// Never awaited by the thing that triggered it: disabling an account must not
// fail because a mail server is slow.
// ─────────────────────────────────────────────────────────────────────────────
export function notifyAccount({ kind, userId }, adminAuth) {
  if (!kind || userId == null || !adminAuth) return Promise.resolve({ ok: true, sent: false })
  if (!LIVE) {
    if (!store.emailLog) store.emailLog = []
    store.emailLog.unshift({
      sent_at: new Date().toISOString(), mailbox: 'crm', to_address: 'staff@example.com',
      subject: `[demo] ${kind}`, kind, ok: true, error: null,
    })
    return Promise.resolve({ ok: true, sent: false, demo: true })
  }
  return supabase.functions
    .invoke('send-email', {
      body: { admin: adminAuth.username, admin_pw: adminAuth.password, notify: kind, ref: userId },
    })
    .then(({ data, error }) => (error ? { ok: false } : data))
    .catch(() => ({ ok: false }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Forgotten password.
//
// The browser never sees the token. It asks the Edge Function to start a reset;
// the function gets the token from the database, puts it in an email, and
// forgets it. The reply is the same whether or not the account exists — the
// difference between "sent" and "no such account" is a list of who works here.
// ─────────────────────────────────────────────────────────────────────────────
export async function requestPasswordReset(identifier) {
  if (!identifier || !identifier.trim()) throw new Error('Enter your username or email address')
  if (!LIVE) return { ok: true, demo: true }
  try {
    await supabase.functions.invoke('send-email', {
      body: { action: 'password_reset_request', identifier: identifier.trim() },
    })
  } catch { /* the answer is the same either way, including when it fails */ }
  return { ok: true }
}

// The token IS the credential here — there is nothing else to prove who this
// is. Unlike the request above, the reason for a failure is the point: "that
// link has expired" is exactly what the person needs to read.
export async function completePasswordReset(token, password) {
  if (!token) throw new Error('That link is missing its code — ask for a new one')
  if (!password || password.length < 8) throw new Error('Choose a password of at least 8 characters')
  if (!LIVE) return { ok: true, username: 'demo' }
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { action: 'password_reset_complete', token, password },
  })
  if (error) throw await functionError(error, 'That link could not be used')
  if (!data || !data.ok) throw new Error((data && data.error) || 'That link could not be used')
  return data
}

// Proves the whole path without anyone reading the password back: the function
// reports what the mail server actually said.
export async function sendTestEmail({ mailbox, to }, adminAuth) {
  if (LIVE) {
    return sendMail({
      mailbox, to, kind: 'test',
      subject: 'SGAS test email',
      text: 'This is a test from the SGAS Training Management system.\n\n'
        + 'If you are reading it, the mail settings are working.',
    }, adminAuth)
  }
  const s = store.smtp || DEMO_SMTP
  const row = s.mailboxes.find((x) => x.key === mailbox)
  if (!row || !row.password_set) throw new Error(`No password stored for ${(row && row.address) || mailbox}`)
  if (!store.emailLog) store.emailLog = []
  store.emailLog.unshift({ sent_at: new Date().toISOString(), mailbox, to_address: to, subject: 'SGAS test email', kind: 'test', ok: true, error: null })
  return { ok: true, from: row.address, demo: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// The wording of the automatic emails, editable in Admin.
//
// The templates live in the database, not in the code, so Chris can change what
// they say without a deploy. Placeholders are {{like_this}} and are filled in by
// the Edge Function at send time — see supabase/functions/send-email/wording.ts,
// which is the source of truth for the list.
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_TEMPLATES = [
  {
    key: 'course_moved', name: 'Course dates changed', mailbox: 'crm', enabled: true,
    description: 'Sent to the trainer already on a course when its dates are changed.',
    subject: '{{course}} has moved to {{dates}}',
    body: 'Hello {{trainer}},\n\n{{course}}, which you are down to run, has been moved.\n\n  Was:    {{old_dates}}\n  Now:    {{dates}} ({{days}})\n  Where:  {{room}}\n  Booked: {{delegates}}\n\nSGAS Training Management',
  },
  {
    key: 'trainer_assigned', name: 'Trainer put on a course', mailbox: 'crm', enabled: true,
    description: 'Sent to a trainer when they are put on a course.',
    subject: 'You are on {{course}}, {{dates}}',
    body: 'Hello {{trainer}},\n\nYou have been put on {{course}}.\n\n  When:   {{dates}} ({{days}})\n  Where:  {{room}}\n  Booked: {{delegates}}\n\nThe number booked can still change. The system holds the up-to-date position.\n\nSGAS Training Management',
  },
  {
    key: 'trainer_removed', name: 'Trainer taken off a course', mailbox: 'crm', enabled: true,
    description: 'Sent to a trainer when they are taken off a course, including when somebody else is put on in their place.',
    subject: 'You are no longer on {{course}}, {{dates}}',
    body: 'Hello {{trainer}},\n\nYou have been taken off {{course}} on {{dates}}.\n\nNothing further is needed from you. If that looks wrong, let the office know.\n\nSGAS Training Management',
  },
]

export async function listEmailTemplates(adminAuth) {
  if (LIVE) {
    const { data, error } = await supabase.rpc('app_email_templates', {
      p_admin: adminAuth.username, p_admin_pw: adminAuth.password,
    })
    if (error) throw new Error(/Not authorized/.test(error.message) ? 'Password incorrect' : error.message)
    return data || []
  }
  if (!store.templates) store.templates = JSON.parse(JSON.stringify(DEMO_TEMPLATES))
  return JSON.parse(JSON.stringify(store.templates))
}

export async function saveEmailTemplate({ key, subject, body, enabled, mailbox }, adminAuth) {
  if (LIVE) {
    const { data, error } = await supabase.rpc('app_email_template_save', {
      p_admin: adminAuth.username, p_admin_pw: adminAuth.password,
      p_key: key, p_subject: subject, p_body: body, p_enabled: !!enabled, p_mailbox: mailbox || null,
    })
    if (error) throw new Error(/Not authorized/.test(error.message) ? 'Password incorrect' : error.message)
    return data || []
  }
  if (!store.templates) store.templates = JSON.parse(JSON.stringify(DEMO_TEMPLATES))
  const t = store.templates.find((x) => x.key === key)
  if (!t) throw new Error('No such template')
  Object.assign(t, { subject, body, enabled: !!enabled, mailbox: mailbox || t.mailbox, updated_at: new Date().toISOString() })
  return JSON.parse(JSON.stringify(store.templates))
}

// A course to preview against: the most recently starting one that actually has
// a trainer on it, so the preview shows real names and real dates rather than
// invented ones.
async function previewSession() {
  const { data } = await supabase.from('session')
    .select('session_id,trainer_id').not('trainer_id', 'is', null)
    .order('start_date', { ascending: false }).limit(1)
  return (data || [])[0] || null
}

const HOLIDAY_KINDS = ['holiday_requested', 'holiday_approved', 'holiday_rejected']

// Something real to render against, chosen by what the email is about.
async function previewHoliday() {
  const { data } = await supabase.from('holiday')
    .select('holiday_id').order('start_date', { ascending: false }).limit(1)
  return (data || [])[0] || null
}

// Rendered by the SAME code that will send it — the preview cannot drift from
// the email, because it is the email, stopped one step short of the mail server.
export async function previewEmailTemplate(kind, adminAuth) {
  if (!LIVE) return { demo: true }

  if (HOLIDAY_KINDS.includes(kind)) {
    const h = await previewHoliday()
    if (!h) return { none: 'holiday' }
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        admin: adminAuth.username, admin_pw: adminAuth.password,
        notify: kind, ref: h.holiday_id, preview: true,
      },
    })
    if (error) throw await functionError(error, 'Could not build the preview')
    if (data && data.skipped) return { skipped: data.skipped }
    return data && data.preview ? data.preview : { skipped: 'no_preview' }
  }

  const s = await previewSession()
  if (!s) return { none: 'course' }
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: {
      admin: adminAuth.username, admin_pw: adminAuth.password,
      // "Taken off" is about somebody who is no longer on the session, so the
      // caller has to name them. For a preview, that is whoever is on it now.
      notify: kind, ref: s.session_id, staff_id: s.trainer_id, preview: true,
      // A move has to have something to have moved from.
      prev_start: '2026-01-05', prev_end: '2026-01-07',
    },
  })
  if (error) throw await functionError(error, 'Could not build the preview')
  if (data && data.skipped) return { skipped: data.skipped }
  return data && data.preview ? data.preview : { skipped: 'no_preview' }
}

export async function listEmailLog(adminAuth, limit = 50) {
  if (LIVE) {
    const { data, error } = await supabase.rpc('app_email_log', {
      p_admin: adminAuth.username, p_admin_pw: adminAuth.password, p_limit: limit,
    })
    if (error) throw new Error(/Not authorized/.test(error.message) ? 'Password incorrect' : error.message)
    return data || []
  }
  return (store.emailLog || []).slice(0, limit)
}
