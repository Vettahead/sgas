// ─────────────────────────────────────────────────────────────────────────────
// The one place SGAS sends email from.
//
// The SMTP password never leaves this function: it is decrypted inside the
// database, handed to the mail server, and dropped. It is never returned to a
// caller, never written to email_log, and never included in an error message —
// the catch below deliberately scrubs it, because SMTP libraries have a habit
// of putting the failed credentials in the exception.
//
// AUTH: this app does not use Supabase Auth (it has its own app_user table), so
// a JWT proves nothing here — everyone shares the public anon key. Callers must
// therefore pass admin credentials, which are checked with the same
// app_is_admin() the user-admin screen uses. verify_jwt is off for that reason;
// the check below is the real gate. Scheduled sends will come from pg_cron
// inside the database and use the internal secret instead.
//
// EVERYTHING goes through RPCs in the public schema. The first version read the
// password with db.schema('vault').from('decrypted_secrets') and could never
// have worked: PostgREST only serves the schemas it is configured to expose —
// public and graphql_public — so the request was refused before it reached the
// database. Nothing was logged either, because the failure happened before the
// log write, which is why the screen could only say "non-2xx". Both lessons are
// baked in below: one door in (app_smtp_dispatch), and every step that can fail
// says which step it was.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Set this to let trusted server-side jobs (pg_cron) send without a password.
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

// Never let a secret ride out inside an error string.
function scrub(message: string, secrets: string[]) {
  let out = message
  for (const s of secrets) {
    if (s && s.length > 3) out = out.split(s).join('«password hidden»')
  }
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  const db = createClient(SUPABASE_URL, SERVICE_KEY)
  let password = ''

  try {
    const body = await req.json()
    const {
      admin, admin_pw, internal,
      mailbox = 'crm', to, subject, text, html,
      kind = 'manual', ref_id = null,
    } = body ?? {}

    // ── who is asking ───────────────────────────────────────────────────────
    const trusted = INTERNAL_SECRET && internal === INTERNAL_SECRET
    if (!trusted) {
      if (!admin || !admin_pw) return json({ ok: false, error: 'Not authorized' }, 401)
      const { data: isAdmin, error } = await db.rpc('app_is_admin', { p_user: admin, p_pw: admin_pw })
      // An RPC that errors and an admin check that says no are different things.
      // Saying so is the difference between "fix your password" and "the
      // function cannot reach the database".
      if (error) return json({ ok: false, error: `Could not check the admin login: ${error.message}` }, 500)
      if (isAdmin !== true) return json({ ok: false, error: 'Not authorized' }, 401)
    }

    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) {
      return json({ ok: false, error: 'A valid "to" address is required' }, 400)
    }

    // ── settings and password, in one call ──────────────────────────────────
    const { data: cfg, error: cfgErr } = await db.rpc('app_smtp_dispatch', { p_key: mailbox })
    if (cfgErr) return json({ ok: false, error: `Could not read the mail settings: ${cfgErr.message}` }, 500)
    if (!cfg) return json({ ok: false, error: 'Could not read the mail settings' }, 500)
    if (cfg.error === 'unknown_mailbox') return json({ ok: false, error: `Unknown mailbox "${mailbox}"` }, 400)
    if (cfg.error === 'no_server') return json({ ok: false, error: 'No mail server is set up yet — Admin → Email settings' }, 400)
    if (cfg.error === 'no_password') {
      return json({ ok: false, error: `No password stored for ${cfg.address || mailbox} — add it in Admin → Email settings` }, 400)
    }
    password = String(cfg.password || '')
    if (!password) return json({ ok: false, error: 'The stored password could not be read back' }, 500)

    // ── send ────────────────────────────────────────────────────────────────
    const client = new SMTPClient({
      connection: {
        hostname: cfg.host,
        port: Number(cfg.port) || 465,
        tls: cfg.secure !== false,          // 465 = TLS on connect; 587 = STARTTLS
        auth: { username: cfg.username, password },
      },
    })

    let ok = false
    let errText: string | null = null
    try {
      await client.send({
        from: cfg.from_name ? `${cfg.from_name} <${cfg.address}>` : cfg.address,
        to: String(to),
        subject: String(subject ?? '(no subject)'),
        content: text ?? undefined,
        html: html ?? undefined,
      })
      ok = true
    } catch (e) {
      errText = scrub(String((e as Error)?.message ?? e), [password])
    } finally {
      try { await client.close() } catch { /* already gone */ }
      password = ''
    }

    // Log every attempt, delivered or not — "did Simon get the warning?" has to
    // be answerable without guessing.
    await db.rpc('app_email_log_write', {
      p_mailbox: cfg.key, p_to: String(to), p_subject: subject ?? null,
      p_kind: kind, p_ok: ok, p_error: errText, p_ref_id: ref_id ? String(ref_id) : null,
    })

    return ok
      ? json({ ok: true, from: cfg.address })
      : json({ ok: false, error: errText }, 502)
  } catch (e) {
    const msg = scrub(String((e as Error)?.message ?? e), [password])
    return json({ ok: false, error: msg }, 500)
  } finally {
    password = ''
  }
})
