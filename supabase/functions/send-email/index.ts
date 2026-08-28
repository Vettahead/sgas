// ─────────────────────────────────────────────────────────────────────────────
// The one place SGAS sends email from.
//
// The SMTP password never leaves this function: it is decrypted from Supabase
// Vault with the service-role key, handed to the mail server, and dropped. It
// is never returned to a caller, never written to email_log, and never included
// in an error message — the catch below deliberately scrubs it, because SMTP
// libraries have a habit of putting the failed credentials in the exception.
//
// AUTH: this app does not use Supabase Auth (it has its own app_user table), so
// a JWT proves nothing here — everyone shares the public anon key. Callers must
// therefore pass admin credentials, which are checked with the same
// app_is_admin() the user-admin screen uses. verify_jwt is off for that reason;
// the check below is the real gate. Scheduled sends will come from pg_cron
// inside the database and use the internal secret instead.
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

    // ── who is asking ────────────────────────────────────────────────────────
    const trusted = INTERNAL_SECRET && internal === INTERNAL_SECRET
    if (!trusted) {
      if (!admin || !admin_pw) return json({ ok: false, error: 'Not authorized' }, 401)
      const { data: isAdmin, error } = await db.rpc('app_is_admin', { p_user: admin, p_pw: admin_pw })
      if (error || isAdmin !== true) return json({ ok: false, error: 'Not authorized' }, 401)
    }

    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) {
      return json({ ok: false, error: 'A valid "to" address is required' }, 400)
    }

    // ── settings ─────────────────────────────────────────────────────────────
    const { data: cfg } = await db.from('smtp_setting').select('host,port,secure').eq('id', true).single()
    const { data: mb } = await db.from('smtp_mailbox').select('key,address,username,from_name,secret_id').eq('key', mailbox).single()
    if (!cfg?.host) return json({ ok: false, error: 'No mail server is set up yet — Admin → Email settings' }, 400)
    if (!mb) return json({ ok: false, error: `Unknown mailbox "${mailbox}"` }, 400)
    if (!mb.secret_id) {
      return json({ ok: false, error: `No password stored for ${mb.address} — add it in Admin → Email settings` }, 400)
    }

    const { data: secretRow, error: secretErr } = await db
      .schema('vault').from('decrypted_secrets').select('decrypted_secret').eq('id', mb.secret_id).single()
    if (secretErr || !secretRow?.decrypted_secret) {
      return json({ ok: false, error: 'The stored password could not be read back' }, 500)
    }
    password = secretRow.decrypted_secret

    // ── send ─────────────────────────────────────────────────────────────────
    const client = new SMTPClient({
      connection: {
        hostname: cfg.host,
        port: Number(cfg.port) || 465,
        tls: cfg.secure !== false,          // 465 = TLS on connect; 587 = STARTTLS
        auth: { username: mb.username, password },
      },
    })

    let ok = false
    let errText: string | null = null
    try {
      await client.send({
        from: mb.from_name ? `${mb.from_name} <${mb.address}>` : mb.address,
        to: String(to),
        subject: String(subject ?? '(no subject)'),
        content: text ?? undefined,
        html: html ?? undefined,
      })
      ok = true
    } catch (e) {
      errText = scrub(String(e?.message ?? e), [password])
    } finally {
      try { await client.close() } catch { /* already gone */ }
      password = ''
    }

    // Log every attempt, delivered or not — "did Simon get the warning?" has to
    // be answerable without guessing.
    await db.from('email_log').insert({
      mailbox: mb.key, to_address: String(to), subject: subject ?? null,
      kind, ok, error: errText, ref_id: ref_id ? String(ref_id) : null,
    })

    return ok
      ? json({ ok: true, from: mb.address })
      : json({ ok: false, error: errText }, 502)
  } catch (e) {
    const msg = scrub(String((e as Error)?.message ?? e), [password])
    return json({ ok: false, error: msg }, 500)
  } finally {
    password = ''
  }
})
