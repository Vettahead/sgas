import { createClient } from '@supabase/supabase-js'
import { getJwt, getSessionToken } from './session.js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// When both env vars are present we run against the live Supabase project.
// Otherwise the app falls back to bundled seed data (see lib/core.js).
export const LIVE = Boolean(url && anon)

// The header the database reads to find out who is asking. PostgREST exposes
// request headers to SQL, and app_session_user_id() looks this one up in
// app_session. Checked 30 Aug 2026: Supabase's CORS echoes it back in
// access-control-allow-headers, so the browser will send it.
export const SESSION_HEADER = 'x-sgas-session'

// Every request goes through here, and the token is read fresh each time from
// module state rather than captured at client creation — so signing in and
// signing out take effect on the very next request with no rebuild and no new
// client. A signed-out browser sends no header at all and arrives as `anon`,
// which since the lockdown means the tables refuse it.
function fetchWithSession(input, init = {}) {
  const token = getSessionToken()
  if (!token) return fetch(input, init)

  // Headers may arrive as a Headers instance, a plain object or an array;
  // normalising through Headers is the only form that handles all three.
  const headers = new Headers(init.headers || {})
  headers.set(SESSION_HEADER, token)
  return fetch(input, { ...init, headers })
}

// `accessToken` is called before every request and supplies the OTHER proof:
// the legacy-signed JWT, which makes Postgres run the request as
// `authenticated` directly. Both proofs are sent while the changeover is in
// progress and the database accepts either, so no browser is ever caught
// between builds. The JWT half comes out once the header path is proven live.
//
// Supplying `accessToken` turns off supabase-js's own auth handling, which is
// correct: this app has never used Supabase Auth.
export const supabase = LIVE
  ? createClient(url, anon, {
      accessToken: async () => getJwt(),
      global: { fetch: fetchWithSession },
    })
  : null
