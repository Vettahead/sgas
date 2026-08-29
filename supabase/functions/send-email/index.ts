// ─────────────────────────────────────────────────────────────────────────────
// The one place SGAS sends email from.
//
// The SMTP password never leaves this function: it is decrypted inside the
// database, handed to the mail server, and dropped. It is never returned to a
// caller, never written to email_log, and never included in an error message —
// the catch below deliberately scrubs it, because SMTP libraries have a habit
// of putting the failed credentials in the exception.
//
// AUTH — three doors, deliberately different sizes:
//
//   1. internal secret .... trusted server-side jobs (pg_cron). Send anything.
//   2. admin credentials .. the Admin screen. Send anything, and preview.
//   3. notify .............. the app, with NO credentials at all.
//
// Door 3 exists because this app does not use Supabase Auth and the browser
// does not keep anybody's password: app_login checks it in the database and
// returns a sanitised row. A trainer notification fires the moment somebody
// drags a name onto a course, so there is nothing to authenticate with.
//
// So door 3 does not accept an address or a body. It accepts "session 42 just
// had a trainer put on it", and the DATABASE decides who is told, in what
// words, and whether the notification is switched on at all
// (app_notify_context). The worst it can be used for is making a real trainer
// receive a true statement about a real course, at most once per ten minutes.
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
import { render, tokensFor } from './wording.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Set this to let trusted server-side jobs (pg_cron) send without a password.
const INTERNAL_SECRET = Deno.env.get('SGAS_INTERNAL_SECRET') ?? ''

// How long an identical notification is suppressed for. Dragging a course about
// produces a burst of identical updates and a trainer should not get five
// emails because somebody nudged a bar. The subject carries the dates, so a
// genuine second move — to different dates — is a different subject and still
// goes out.
const REPEAT_WINDOW_MINUTES = 10

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
      notify, session_id, staff_id, prev_start, prev_end, preview,
      mailbox: mailboxIn = 'crm', to: toIn, subject: subjectIn, text: textIn, html,
      kind: kindIn = 'manual', ref_id: refIn = null,
    } = body ?? {}

    let mailbox = mailboxIn
    let to = toIn
    let subject = subjectIn
    let text = textIn
    let kind = kindIn
    let refId = refIn

    const isNotify = typeof notify === 'string' && notify.length > 0
    const wantsPreview = preview === true

    // ── who is asking ───────────────────────────────────────────────────────
    // A notification needs no credentials — it cannot choose a recipient or a
    // body. Everything else, including a preview, does.
    const trusted = INTERNAL_SECRET && internal === INTERNAL_SECRET
    if (!trusted && (!isNotify || wantsPreview)) {
      if (!admin || !admin_pw) return json({ ok: false, error: 'Not authorized' }, 401)
      const { data: isAdmin, error } = await db.rpc('app_is_admin', { p_user: admin, p_pw: admin_pw })
      // An RPC that errors and an admin check that says no are different things.
      // Saying so is the difference between "fix your password" and "the
      // function cannot reach the database".
      if (error) return json({ ok: false, error: `Could not check the admin login: ${error.message}` }, 500)
      if (isAdmin !== true) return json({ ok: false, error: 'Not authorized' }, 401)
    }

    // ── a notification composes itself ──────────────────────────────────────
    if (isNotify) {
      // `ref` is whatever the email is about: a session for the course ones, a
      // holiday for the holiday ones. session_id is still accepted so that a
      // browser running the previous build keeps working until it is reloaded.
      const ref = body?.ref ?? session_id ?? null
      const { data: ctx, error: ctxErr } = await db.rpc('app_notify_context', {
        p_kind: notify,
        p_ref: ref,
        p_staff_id: staff_id ?? null,
      })
      if (ctxErr) return json({ ok: false, error: `Could not read the notification: ${ctxErr.message}` }, 500)
      if (!ctx) return json({ ok: false, error: 'Could not read the notification' }, 500)

      // Switched off, no trainer, no email address on the record: all ordinary
      // outcomes. 200 with a reason, so a scheduler's screen never reports an
      // error for something that is working as intended.
      if (ctx.skip) return json({ ok: true, sent: false, skipped: String(ctx.skip) })

      const tokens = tokensFor(ctx, prev_start, prev_end)
      mailbox = ctx.template?.mailbox || 'crm'
      to = ctx.to
      subject = render(ctx.template?.subject ?? '', tokens)
      text = render(ctx.template?.body ?? '', tokens)
      kind = notify
      refId = ref != null ? String(ref) : null

      if (wantsPreview) return json({ ok: true, sent: false, preview: { to, subject, text, mailbox } })

      const { data: already } = await db.rpc('app_email_recent', {
        p_kind: kind, p_ref: refId, p_to: to, p_subject: subject, p_minutes: REPEAT_WINDOW_MINUTES,
      })
      if (already === true) return json({ ok: true, sent: false, skipped: 'already_sent' })
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
      p_kind: kind, p_ok: ok, p_error: errText, p_ref_id: refId ? String(refId) : null,
    })

    return ok
      ? json({ ok: true, sent: true, from: cfg.address })
      : json({ ok: false, error: errText }, 502)
  } catch (e) {
    const msg = scrub(String((e as Error)?.message ?? e), [password])
    return json({ ok: false, error: msg }, 500)
  } finally {
    password = ''
  }
})
