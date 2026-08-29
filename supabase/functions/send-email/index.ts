// ─────────────────────────────────────────────────────────────────────────────
// The one place SGAS sends email from.
//
// The SMTP password never leaves this function: it is decrypted inside the
// database, handed to the mail server, and dropped. It is never returned to a
// caller, never written to email_log, and never included in an error message —
// the catch below deliberately scrubs it, because SMTP libraries have a habit
// of putting the failed credentials in the exception.
//
// FOUR WAYS IN, deliberately different sizes:
//
//   1. internal secret ..... trusted server-side jobs (pg_cron). Send anything.
//   2. admin credentials ... the Admin screen. Send anything, and preview.
//   3. notify .............. the app, with NO credentials. It names the thing
//                            that changed; the DATABASE decides who is told and
//                            in what words. Account notifications are excluded
//                            and need door 2.
//   4. actions ............. password reset request and completion, which are
//                            by nature done by somebody who cannot sign in. The
//                            token is the credential.
//
// Door 3 exists because this app does not use Supabase Auth and the browser
// does not keep anybody's password: app_login checks it in the database and
// returns a sanitised row. A trainer notification fires the moment somebody
// drags a name onto a course, so there is nothing to authenticate with.
//
// EVERYTHING goes through RPCs in the public schema. The first version read the
// password with db.schema('vault').from('decrypted_secrets') and could never
// have worked: PostgREST only serves the schemas it is configured to expose —
// public and graphql_public — so the request was refused before it reached the
// database. Both lessons are baked in: one door in (app_smtp_dispatch), and
// every step that can fail says which step it was.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { render, tokensFor } from './wording.ts'
import { toHtml } from './layout.ts'

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

// These say something about somebody's ACCOUNT, so they are not on the open
// door. Anyone with the public key could otherwise tell a member of staff their
// password had been changed.
const ADMIN_ONLY_KINDS = ['password_changed', 'user_created', 'account_disabled', 'account_enabled']

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

// ─────────────────────────────────────────────────────────────────────────────
// Actually sending. One implementation, used by every path above, so they all
// get the same error handling and the same guarantee that the attempt is
// logged whether it worked or not.
// ─────────────────────────────────────────────────────────────────────────────
type Deliver = {
  mailbox: string; to: string; subject: string
  text?: string; html?: string; kind: string; refId?: string | null
  cc?: string | null          // the employer, on a delegate's booking email
}

async function deliver(db: ReturnType<typeof createClient>, d: Deliver) {
  let password = ''
  try {
    const { data: cfg, error: cfgErr } = await db.rpc('app_smtp_dispatch', { p_key: d.mailbox })
    if (cfgErr) return { ok: false, error: `Could not read the mail settings: ${cfgErr.message}`, status: 500 }
    if (!cfg) return { ok: false, error: 'Could not read the mail settings', status: 500 }
    if (cfg.error === 'unknown_mailbox') return { ok: false, error: `Unknown mailbox "${d.mailbox}"`, status: 400 }
    if (cfg.error === 'no_server') return { ok: false, error: 'No mail server is set up yet — Admin → Email', status: 400 }
    if (cfg.error === 'no_password') {
      return { ok: false, error: `No password stored for ${cfg.address || d.mailbox} — add it in Admin → Email`, status: 400 }
    }
    password = String(cfg.password || '')
    if (!password) return { ok: false, error: 'The stored password could not be read back', status: 500 }

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
        to: String(d.to),
        cc: d.cc ? [String(d.cc)] : undefined,
        subject: String(d.subject ?? '(no subject)'),
        // Both versions, always. The text is exactly what was typed in Admin —
        // it is what a plain-text client, a screen reader and the Sent log
        // show. The HTML is that same text laid out (layout.ts); a caller that
        // built its own HTML keeps it.
        content: d.text ?? undefined,
        html: d.html ?? (d.text ? toHtml(d.text, String(d.subject ?? '')) : undefined),
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
      p_mailbox: cfg.key, p_to: String(d.to), p_subject: d.subject ?? null,
      p_kind: d.kind, p_ok: ok, p_error: errText, p_ref_id: d.refId ? String(d.refId) : null,
    })

    return ok ? { ok: true, from: cfg.address } : { ok: false, error: errText, status: 502 }
  } finally {
    password = ''
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  const db = createClient(SUPABASE_URL, SERVICE_KEY)

  try {
    const body = await req.json()
    const {
      admin, admin_pw, internal, action,
      notify, ref, session_id, staff_id, prev_start, prev_end, preview,
      mailbox: mailboxIn = 'crm', to: toIn, subject: subjectIn, text: textIn, html,
      kind: kindIn = 'manual', ref_id: refIn = null,
    } = body ?? {}

    // ── door 4: password resets ──────────────────────────────────────────────
    // Nobody here can sign in, by definition. Neither branch reveals whether an
    // account exists: the request always answers the same way, whatever
    // happened, because the difference between "sent" and "no such account" is
    // a list of who works here.
    if (action === 'password_reset_request') {
      const { data: st, error: stErr } = await db.rpc('app_password_reset_start', {
        p_identifier: String(body?.identifier ?? ''),
      })
      if (stErr) return json({ ok: true })          // still no information leaked
      if (!st || st.skip) return json({ ok: true })

      const { data: tpl } = await db.rpc('app_template_for_send', { p_key: 'password_reset' })
      if (!tpl || tpl.skip) return json({ ok: true })

      const base = String(tpl.app_url || '').replace(/\/+$/, '')
      const tokens = tokensFor({
        name: st.name, username: st.username, minutes: st.minutes,
        link: `${base}/?reset=${encodeURIComponent(String(st.token))}`,
      })
      await deliver(db, {
        mailbox: tpl.template?.mailbox || 'crm',
        to: String(st.to),
        subject: render(tpl.template?.subject ?? '', tokens),
        text: render(tpl.template?.body ?? '', tokens),
        kind: 'password_reset',
        refId: st.user_id != null ? String(st.user_id) : null,
      })
      return json({ ok: true })
    }

    if (action === 'password_reset_complete') {
      const { data: done, error: doneErr } = await db.rpc('app_password_reset_complete', {
        p_token: String(body?.token ?? ''), p_password: String(body?.password ?? ''),
      })
      // Here the reason IS the point — "that link has expired" is what the
      // person needs to read.
      if (doneErr) return json({ ok: false, error: doneErr.message }, 400)

      // Tell them it changed. If this fails the password is still changed, so
      // it must not turn a success into an error.
      try {
        const { data: ctx } = await db.rpc('app_notify_context', {
          p_kind: 'password_changed', p_ref: done.user_id, p_staff_id: null,
        })
        if (ctx && !ctx.skip) {
          const tokens = tokensFor(ctx)
          await deliver(db, {
            mailbox: ctx.template?.mailbox || 'crm',
            to: String(ctx.to),
            subject: render(ctx.template?.subject ?? '', tokens),
            text: render(ctx.template?.body ?? '', tokens),
            kind: 'password_changed', refId: String(done.user_id),
          })
        }
      } catch { /* the password is changed; the note about it is not critical */ }

      return json({ ok: true, username: done.username })
    }

    let mailbox = mailboxIn
    let to = toIn
    let subject = subjectIn
    let text = textIn
    let kind = kindIn
    let refId = refIn
    let cc: string | null = null

    const isNotify = typeof notify === 'string' && notify.length > 0
    const wantsPreview = preview === true
    const accountKind = isNotify && ADMIN_ONLY_KINDS.includes(notify)

    // ── who is asking ───────────────────────────────────────────────────────
    // An ordinary notification needs no credentials — it cannot choose a
    // recipient or a body. Everything else does: a raw send, a preview, and
    // anything that talks about somebody's account.
    const trusted = INTERNAL_SECRET && internal === INTERNAL_SECRET
    if (!trusted && (!isNotify || wantsPreview || accountKind)) {
      if (!admin || !admin_pw) return json({ ok: false, error: 'Not authorized' }, 401)
      const { data: isAdmin, error } = await db.rpc('app_is_admin', { p_user: admin, p_pw: admin_pw })
      // An RPC that errors and an admin check that says no are different things.
      if (error) return json({ ok: false, error: `Could not check the admin login: ${error.message}` }, 500)
      if (isAdmin !== true) return json({ ok: false, error: 'Not authorized' }, 401)
    }

    // ── a notification composes itself ──────────────────────────────────────
    if (isNotify) {
      // `ref` is whatever the email is about: a session for the course ones, a
      // holiday for the holiday ones, a login for the account ones. session_id
      // is still accepted so a browser on the previous build keeps working.
      const theRef = ref ?? session_id ?? null
      // A delegate's booking email needs the course it was on, which a
      // cancelled booking no longer points at — so that family has its own
      // context function rather than a fourth parameter on the shared one.
      const isBooking = notify.startsWith('booking_')
      const { data: ctx, error: ctxErr } = isBooking
        ? await db.rpc('app_notify_booking', {
            p_kind: notify, p_ref: theRef, p_session: body?.session ?? null,
          })
        : await db.rpc('app_notify_context', {
            p_kind: notify, p_ref: theRef, p_staff_id: staff_id ?? null,
          })
      if (ctxErr) return json({ ok: false, error: `Could not read the notification: ${ctxErr.message}` }, 500)
      if (!ctx) return json({ ok: false, error: 'Could not read the notification' }, 500)

      // Switched off, no trainer, no email address on the record: all ordinary
      // outcomes. 200 with a reason, so nobody's screen reports an error for
      // something that is working as intended.
      if (ctx.skip) return json({ ok: true, sent: false, skipped: String(ctx.skip) })

      const tokens = tokensFor(ctx, prev_start, prev_end)
      mailbox = ctx.template?.mailbox || 'crm'
      to = ctx.to
      cc = ctx.cc || null
      subject = render(ctx.template?.subject ?? '', tokens)
      text = render(ctx.template?.body ?? '', tokens)
      kind = notify
      refId = theRef != null ? String(theRef) : null

      if (wantsPreview) return json({ ok: true, sent: false, preview: { to, cc, subject, text, mailbox } })

      const { data: already } = await db.rpc('app_email_recent', {
        p_kind: kind, p_ref: refId, p_to: to, p_subject: subject, p_minutes: REPEAT_WINDOW_MINUTES,
      })
      if (already === true) return json({ ok: true, sent: false, skipped: 'already_sent' })
    }

    if (!to || !EMAIL_RE.test(String(to))) {
      return json({ ok: false, error: 'A valid "to" address is required' }, 400)
    }

    const r = await deliver(db, { mailbox, to: String(to), subject, text, html, kind, refId, cc })

    // Only once it has actually gone. The column has to mean "they were told",
    // not "we meant to tell them".
    if (r.ok && kind === 'booking_confirmed' && refId) {
      try { await db.rpc('app_booking_confirmed', { p_booking_id: Number(refId) }) } catch { /* the email went; the stamp is a nicety */ }
    }

    return r.ok
      ? json({ ok: true, sent: true, from: r.from })
      : json({ ok: false, error: r.error }, r.status ?? 502)
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500)
  }
})
