// ─────────────────────────────────────────────────────────────────────────────
// TEAMUP — the pull.
//
// SGAS's real working schedule lives in Teamup and that subscription lapses in
// OCTOBER. Nothing had ever come out of it: every session.teamup_event_id was
// null. On the day it lapsed, the forward schedule would simply have gone.
//
// This function is the safety net, and it is deliberately dumb. It copies
// Teamup into teamup_event and teamup_subcalendar exactly as it finds it —
// every event, the raw JSON alongside the parsed suggestions — and stops there.
// Turning those events into sessions, holidays and engagements is a separate,
// later decision made against data already safely in hand. Capture first,
// interpret afterwards: the deadline is on the capture, not the interpretation.
//
// IT IS SAFE TO RUN AS OFTEN AS YOU LIKE, and it is meant to be: they keep
// using Teamup until the switchover, so this gets run again on the day. Events
// are keyed on Teamup's own id, so a re-pull updates rather than duplicates.
//
// NOTHING IS EVER DELETED HERE. An event that has disappeared from Teamup is
// marked gone_from_teamup, not removed. If somebody deletes a month at their
// end by accident, our copy survives — which is the entire point of taking one.
//
// THE KEYS LIVE IN SUPABASE SECRETS AND NEVER REACH THE BROWSER. Vite bakes env
// vars into the client bundle, so a key used in the frontend is visible to
// every user. The calendar key is in any case a READ-ONLY sharing link: it
// cannot write to Teamup even if it leaked.
//
// DEPLOY WITH verify_jwt=false, as send-email and sage are. With it on, the
// platform rejects the request at the gateway before any of this runs and the
// browser reports it as a network fault rather than a refusal. Auth is done
// here, in code, on purpose.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { subcalendars, eventsForYear, parseTitle, parseNotes, proposeStream, type Lookups } from './teamup.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const INTERNAL_SECRET = Deno.env.get('SGAS_INTERNAL_SECRET') ?? ''

const SESSION_HEADER = 'x-sgas-session'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sgas-session',
    },
  })

const db = createClient(SUPABASE_URL, SERVICE_KEY)

// The keys are read from Vault at run time, not from the environment. Env vars
// would mean somebody in the Supabase dashboard before this could run at all,
// and Vault is already where the Sage credentials live. Env is still honoured
// if it is set, so a future deployment can move them without a code change.
const ENV_API = Deno.env.get('TEAMUP_API_KEY') ?? ''
const ENV_CAL = Deno.env.get('TEAMUP_CALENDAR_KEY') ?? ''
let TEAMUP_API_KEY = ENV_API
let TEAMUP_CALENDAR_KEY = ENV_CAL

async function loadKeys() {
  if (TEAMUP_API_KEY && TEAMUP_CALENDAR_KEY) return
  const { data, error } = await db.rpc('app_teamup_dispatch')
  if (error) throw new Error(`Could not read the Teamup keys: ${error.message}`)
  if (data?.error) throw new Error('Teamup is not set up yet — no keys stored')
  TEAMUP_API_KEY = TEAMUP_API_KEY || (data?.api_key ?? '')
  TEAMUP_CALENDAR_KEY = TEAMUP_CALENDAR_KEY || (data?.calendar_key ?? '')
  if (!TEAMUP_API_KEY || !TEAMUP_CALENDAR_KEY) throw new Error('Teamup keys are missing')
}

// Neither key may ever ride out inside an error string.
const scrub = (m: string) => {
  let out = m
  for (const s of [TEAMUP_API_KEY, TEAMUP_CALENDAR_KEY]) {
    if (s && s.length > 8) out = out.split(s).join('«hidden»')
  }
  return out
}

// The same three proofs the sage function uses, in the same order, for the same
// reasons — see supabase/functions/sage/index.ts for why each one is needed.
async function requireAdmin(req: Request, body: any) {
  const session = req.headers.get(SESSION_HEADER)
  if (session && ANON_KEY) {
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { [SESSION_HEADER]: session } },
    })
    const { data } = await asUser.rpc('app_is_admin', { p_user: '', p_pw: '' })
    if (data === true) return
  }
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (bearer) {
    const { data: tokOk } = await db.rpc('app_token_is_admin', { p_token: bearer })
    if (tokOk === true) return
  }
  if (body?.admin && body?.admin_pw) {
    const { data: isAdmin, error } = await db.rpc('app_is_admin', { p_user: body.admin, p_pw: body.admin_pw })
    if (error) throw new Error(`Could not check the admin login: ${error.message}`)
    if (isAdmin === true) return
  }
  throw new Error('Not authorized')
}

// Everything the parser needs to turn shorthand into suggestions, read once per
// pull rather than per event. Initials come from the real staff list, so a new
// starter needs no code change: "Keith Rimmer" gives KR, "S Johnston" gives SJ.
async function lookups(): Promise<Lookups> {
  const [staff, courses, cats, companies, mappings] = await Promise.all([
    db.from('assessor').select('assessor_id,name'),
    db.from('course').select('name'),
    db.from('category').select('code'),
    db.from('company').select('name'),
    db.from('import_mapping').select('target_code').eq('kind', 'employer').eq('decision', 'create'),
  ])
  const staffByInitials: Record<string, number> = {}
  const staffByName: Record<string, number> = {}
  for (const s of staff.data ?? []) {
    const parts = String(s.name || '').trim().split(/\s+/).filter(Boolean)
    if (!parts.length) continue
    staffByName[parts.join(' ').toLowerCase()] = s.assessor_id
    // First name alone, because the sub-calendars say "Keith Assessments", not
    // "Keith Rimmer Assessments". Dropped entirely on a clash — two Keiths mean
    // the first name proves nothing.
    const first = parts[0].toLowerCase()
    if (first in staffByName && staffByName[first] !== s.assessor_id) delete staffByName[first]
    else staffByName[first] = s.assessor_id
    if (parts.length < 2) continue
    const ini = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    // A clash means the initials prove nothing, so neither person gets them.
    if (ini in staffByInitials) { delete staffByInitials[ini]; continue }
    staffByInitials[ini] = s.assessor_id
  }
  // Employers the import is going to create count as customers too — that is
  // how "EDINA Re T&A" finds EDINA before EDINA exists as a company.
  const employerNames = [
    ...(companies.data ?? []).map((c) => String(c.name || '')),
    ...(mappings.data ?? []).map((m) => String(m.target_code || '')),
  ].filter((n) => n.length > 2)
  return {
    staffByInitials,
    staffByName,
    courseNames: (courses.data ?? []).map((c) => String(c.name || '')).filter(Boolean),
    categoryCodes: (cats.data ?? []).map((c) => String(c.code || '')).filter(Boolean),
    employerNames: [...new Set(employerNames)],
  }
}

async function pull(fromYear: number, toYear: number) {
  await loadKeys()
  const look = await lookups()

  // 1. the sub-calendars, so their names are captured even if a year is empty
  const subs = await subcalendars(TEAMUP_CALENDAR_KEY, TEAMUP_API_KEY)
  await db.from('teamup_subcalendar').upsert(
    subs.map((s) => ({ subcalendar_id: s.id, name: s.name, updated_at: new Date().toISOString() })),
    { onConflict: 'subcalendar_id' },
  )
  // A suggestion is only ever offered where nobody has answered yet, so this
  // can never talk over a decision somebody already made. It now carries the
  // person and the slot they fill as well as the kind, because "<name>
  // Assessments" is a course stream with an owner, not that person's diary.
  for (const s of subs) {
    const p = proposeStream(s.name, look.staffByName)
    await db.from('teamup_subcalendar')
      .update({ proposed: p.kind ?? null, proposed_role: p.role ?? null, proposed_staff: p.staff ?? null })
      .eq('subcalendar_id', s.id).is('decision', null)
  }

  // 2. the events, a year at a time
  const now = new Date().toISOString()
  const seen: string[] = []
  let years = 0
  for (let y = fromYear; y <= toYear; y++) {
    const evs = await eventsForYear(TEAMUP_CALENDAR_KEY, TEAMUP_API_KEY, y)
    years++
    if (!evs.length) continue
    const rows = evs.map((e) => ({
      event_id: String(e.id),
      subcalendar_ids: e.subcalendar_ids ?? [],
      title: e.title ?? null,
      start_dt: e.start_dt ?? null,
      end_dt: e.end_dt ?? null,
      all_day: !!e.all_day,
      who: e.who ?? null,
      location: e.location ?? null,
      notes: e.notes ?? null,
      // Title AND notes. The title says what the day was; the notes say who was
      // on it and whether each qualification was an initial or a re-sit — which
      // the Access file never recorded at all.
      parsed: (() => {
        const t = parseTitle(e.title, look)
        const delegates = parseNotes(e.notes, look.categoryCodes)
        return delegates.length ? { ...t, delegates } : t
      })(),
      raw: e,
      last_seen: now,
    }))
    for (const r of rows) seen.push(r.event_id)
    // Chunked because a year can be several hundred events and one oversized
    // request failing would lose the whole year.
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from('teamup_event')
        .upsert(rows.slice(i, i + 200), { onConflict: 'event_id' })
      if (error) throw new Error(`Could not store the events: ${error.message}`)
    }
  }

  // 3. anything inside the window we did NOT see this time has gone from
  //    Teamup. Marked, never deleted. Anything outside the window is left
  //    alone — not being asked for is not the same as being gone.
  const from = `${fromYear}-01-01`, to = `${toYear}-12-31`
  const { data: inWindow } = await db.from('teamup_event')
    .select('event_id').gte('start_dt', from).lte('start_dt', to)
  const seenSet = new Set(seen)
  const missing = (inWindow ?? []).map((r) => r.event_id).filter((id) => !seenSet.has(id))
  if (missing.length) {
    await db.from('teamup_event').update({ gone_from_teamup: true }).in('event_id', missing)
  }
  // And anything that came back is not gone after all.
  for (let i = 0; i < seen.length; i += 200) {
    await db.from('teamup_event').update({ gone_from_teamup: false }).in('event_id', seen.slice(i, i + 200))
  }

  // 4. per-sub-calendar counts and a few example titles, so the mapping screen
  //    can show a person what each stream actually contains.
  const { data: all } = await db.from('teamup_event')
    .select('event_id,subcalendar_ids,title,start_dt').eq('gone_from_teamup', false)
  const stat = new Map<number, { n: number; first?: string; last?: string; titles: string[] }>()
  for (const e of all ?? []) {
    for (const sid of (e.subcalendar_ids ?? []) as number[]) {
      const s = stat.get(sid) ?? { n: 0, titles: [] }
      s.n++
      const d = e.start_dt ? String(e.start_dt).slice(0, 10) : undefined
      if (d && (!s.first || d < s.first)) s.first = d
      if (d && (!s.last || d > s.last)) s.last = d
      if (s.titles.length < 5 && e.title && !s.titles.includes(e.title)) s.titles.push(e.title)
      stat.set(sid, s)
    }
  }
  for (const [sid, s] of stat) {
    await db.from('teamup_subcalendar').update({
      events: s.n, first_event: s.first ?? null, last_event: s.last ?? null, sample_titles: s.titles,
    }).eq('subcalendar_id', sid)
  }

  return {
    subcalendars: subs.length,
    years_asked: years,
    events_seen: seen.length,
    events_gone: missing.length,
    from: fromYear,
    to: toYear,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  let body: any = {}
  try { body = await req.json() } catch { /* status takes no body */ }

  try {
    const internal = INTERNAL_SECRET && req.headers.get('x-sgas-internal') === INTERNAL_SECRET
    if (!internal) await requireAdmin(req, body)

    const action = body?.action ?? 'status'

    if (action === 'status') {
      const { count } = await db.from('teamup_event')
        .select('event_id', { count: 'exact', head: true })
      let configured = true
      try { await loadKeys() } catch { configured = false }
      return json({ ok: true, configured, events: count ?? 0 })
    }

    if (action === 'pull') {
      // Their calendar holds nothing before 2022 and a little in 2027. The
      // default window is wide on purpose: asking for an empty year costs one
      // request and missing a full one costs the data.
      const thisYear = new Date().getFullYear()
      const fromYear = Number(body.from_year) || 2015
      const toYear = Number(body.to_year) || thisYear + 3
      if (toYear - fromYear > 25) throw new Error('That window is too wide')
      return json({ ok: true, ...(await pull(fromYear, toYear)) })
    }

    throw new Error(`Unknown action: ${action}`)
  } catch (e) {
    const msg = scrub(e instanceof Error ? e.message : String(e))
    return json({ ok: false, error: msg }, /Not authorized/.test(msg) ? 401 : 400)
  }
})
