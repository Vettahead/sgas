// ─────────────────────────────────────────────────────────────────────────────
// The one place SGAS talks to Sage. Phase 1: READ ONLY.
//
// FOUR ACTIONS, and the reason each one needs the door it has:
//
//   status    admin  — what the Admin screen shows. No secrets come back.
//   start     admin  — hands back the Sage sign-in URL. Does not touch Sage.
//   exchange  admin  — swaps the ?code= for tokens and finds the business.
//   sync      admin or internal secret — pulls invoices and payments.
//
// WHY THE CALLBACK COMES BACK TO THE APP, NOT TO THIS FUNCTION. Sage redirects
// a BROWSER, and a browser arriving here carries no credentials, which would
// mean publishing an unauthenticated endpoint that accepts an OAuth code. So
// Sage is pointed at the SGAS Admin screen instead: it receives the code as a
// normal page load and calls `exchange` with the admin credentials it already
// holds. Same handshake, no public door.
//
// The tokens never come back to the browser. Not on any action, not in any
// error. The refresh token in particular is single use and lives only in Vault.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  authoriseUrl, exchangeCode, refresh, get, getAllPages, mapInvoice, SAGE_SCOPE,
} from './sage.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Lets trusted server-side jobs (pg_cron) run a sync without an admin password,
// exactly as send-email does.
const INTERNAL_SECRET = Deno.env.get('SGAS_INTERNAL_SECRET') ?? ''

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })

const db = createClient(SUPABASE_URL, SERVICE_KEY)

// A token must never ride out inside an error string. Sage's own error bodies
// echo request parameters back, so this is not paranoia.
function scrub(message: string, secrets: (string | null | undefined)[]) {
  let out = message
  for (const s of secrets) if (s && s.length > 8) out = out.split(s).join('«hidden»')
  return out
}

// Admin credentials are proved the same way every other admin screen proves
// them: by successfully calling an admin-only RPC. It raises if they are wrong.
async function requireAdmin(admin: string, adminPw: string) {
  const { data, error } = await db.rpc('app_sage_get', { p_admin: admin, p_admin_pw: adminPw })
  if (error) throw new Error('Not authorized')
  return data
}

// ── sync: refresh the token if needed, then read ─────────────────────────────
async function freshAccessToken() {
  const { data: d, error } = await db.rpc('app_sage_dispatch')
  if (error) throw new Error(`Could not read the Sage connection: ${error.message}`)
  if (d?.error) throw new Error(d.error)          // no_app / no_client_secret / not_connected

  // Five-minute tokens mean "is it still valid" is nearly always no. A minute
  // of slack stops a token expiring mid-sync.
  const stillValid = d.access_token &&
    d.access_expires_at && new Date(d.access_expires_at).getTime() - Date.now() > 60_000
  if (stillValid) return { token: d.access_token as string, businessId: d.business_id as string }

  const t = await refresh({
    clientId: d.client_id, clientSecret: d.client_secret, refreshToken: d.refresh_token,
  })
  // Store FIRST, use second. If the process died between the refresh and the
  // write, the rotated token would be lost and the connection dead.
  const { error: sErr } = await db.rpc('app_sage_store_tokens', {
    p_access: t.access_token,
    p_refresh: t.refresh_token,
    p_access_expires_in: t.expires_in ?? null,
    p_refresh_expires_in: t.refresh_token_expires_in ?? null,
  })
  if (sErr) throw new Error(`Refreshed, but could not store the rotated token: ${sErr.message}`)
  return { token: t.access_token, businessId: d.business_id as string }
}

async function runSync(sinceIso: string | null) {
  const { token, businessId } = await freshAccessToken()

  // `updated_or_created_since` makes this incremental. Without it, a hundred
  // invoices a month becomes a full history download every time.
  const q = new URLSearchParams({ items_per_page: '200', attributes: 'all' })
  if (sinceIso) q.set('updated_or_created_since', sinceIso)

  const items = await getAllPages(`/sales_invoices?${q}`, token, businessId)
  const rows = items.map(mapInvoice).filter((r) => r.sage_id)

  const { data: cached, error: cErr } = await db.rpc('app_sage_cache_invoices', { p_rows: rows })
  if (cErr) throw new Error(`Read from Sage, but could not cache: ${cErr.message}`)

  // Only bookings with a matched invoice change. Everything else keeps whatever
  // a human last set, and keeps saying that is where it came from.
  const { data: applied, error: aErr } = await db.rpc('app_sage_apply_payments')
  if (aErr) throw new Error(`Cached, but could not apply to bookings: ${aErr.message}`)

  return { read: rows.length, cached, applied }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })

  let body: any = {}
  try { body = await req.json() } catch { /* an empty body is a bad request, handled below */ }
  const action = body?.action ?? ''

  try {
    switch (action) {
      // ── what the Admin screen shows ──────────────────────────────────────
      case 'status':
        return json({ ok: true, status: await requireAdmin(body.admin, body.admin_pw) })

      // ── the sign-in URL ──────────────────────────────────────────────────
      case 'start': {
        const status = await requireAdmin(body.admin, body.admin_pw)
        if (!status?.client_id) return json({ ok: false, error: 'no_app' }, 400)
        if (!body.redirect_uri) return json({ ok: false, error: 'no_redirect_uri' }, 400)
        // The caller keeps this and checks it on the way back, which is what
        // stops somebody else's ?code= being fed into this connection.
        const state = crypto.randomUUID()
        return json({ ok: true, url: authoriseUrl(status.client_id, body.redirect_uri, state), state })
      }

      // ── swap the code for tokens ─────────────────────────────────────────
      case 'exchange': {
        await requireAdmin(body.admin, body.admin_pw)
        if (!body.code) return json({ ok: false, error: 'no_code' }, 400)

        const { data: d, error } = await db.rpc('app_sage_dispatch')
        // 'not_connected' is expected here — that is the whole point of this
        // call — but a missing app or secret is a real problem.
        if (error) throw new Error(error.message)
        if (d?.error && d.error !== 'not_connected') return json({ ok: false, error: d.error }, 400)

        const t = await exchangeCode({
          clientId: d.client_id, clientSecret: d.client_secret,
          code: body.code, redirectUri: body.redirect_uri,
        })

        // Which business did they just sign us into? This is the only call that
        // may run without the X-Business header, because it is what supplies it.
        const biz = await get('/businesses', t.access_token, null)
        const first = biz?.$items?.[0] ?? biz?.[0] ?? null

        const { error: sErr } = await db.rpc('app_sage_store_tokens', {
          p_access: t.access_token,
          p_refresh: t.refresh_token,
          p_access_expires_in: t.expires_in ?? null,
          p_refresh_expires_in: t.refresh_token_expires_in ?? null,
          p_business_id: first?.id ?? null,
          p_business_name: first?.displayed_as ?? first?.name ?? null,
          p_connected_by: body.admin ?? null,
        })
        if (sErr) throw new Error(sErr.message)

        return json({
          ok: true,
          business: first?.displayed_as ?? first?.name ?? null,
          businesses: (biz?.$items ?? []).length,
          scope: SAGE_SCOPE,
        })
      }

      // ── pull invoices and payment status ─────────────────────────────────
      case 'sync': {
        const internal = INTERNAL_SECRET && body.internal_secret === INTERNAL_SECRET
        if (!internal) await requireAdmin(body.admin, body.admin_pw)
        try {
          const out = await runSync(body.since ?? null)
          await db.rpc('app_sage_sync_result', { p_ok: true, p_error: null })
          return json({ ok: true, ...out })
        } catch (e) {
          // Record the failure before rethrowing: a connection that quietly
          // stopped working is worse than one that never worked.
          await db.rpc('app_sage_sync_result', { p_ok: false, p_error: String(e).slice(0, 500) })
          throw e
        }
      }

      default:
        return json({ ok: false, error: 'unknown_action' }, 400)
    }
  } catch (e) {
    return json({ ok: false, error: scrub(String(e), [body?.admin_pw, body?.code, INTERNAL_SECRET]) }, 400)
  }
})
