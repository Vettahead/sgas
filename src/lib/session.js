// ──────────────────────────────────────────────────────────────────────────────
// The signed-in browser's token.
//
// This app does not use Supabase Auth, so until now every request — signed in
// or not — reached Postgres as the `anon` role, and the only way to make the
// app work was to let `anon` read and write everything. That is why the anon
// key, which ships inside the JavaScript bundle and is therefore public, could
// read every delegate's date of birth and NI number.
//
// app_login now returns a short-lived JWT carrying `role: authenticated` plus
// our own app_user_id / app_role claims. supabase.js hands it to every request,
// so the database can finally tell a signed-in member of staff apart from
// somebody who merely has the public key.
//
// NOTHING DEPENDS ON IT YET. The table policies still allow anon exactly as
// before, so no token, an expired token, or an old build all behave as today.
// The lockdown is a separate migration, and it must not be applied until this
// has been proven live — see supabase/README.md.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'sgas_token'

// Kept in memory as well as localStorage: the accessToken hook below is called
// on every single request and must not touch storage that often.
let cached = null
let loaded = false

// Read `exp` without verifying anything. The browser cannot verify a signature
// and must not pretend to — the database is what decides whether a token is
// good. This only avoids sending one we already know is stale.
function expiryOf(token) {
  try {
    const body = token.split('.')[1]
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'))
    return (JSON.parse(json).exp || 0) * 1000
  } catch {
    return 0
  }
}

export function setToken(token) {
  cached = token || null
  loaded = true
  try {
    if (token) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode, or storage full — the in-memory copy still works */
  }
}

export function clearToken() {
  setToken(null)
}

// Returns null rather than an expired token. Null means the request goes out as
// anon, which is exactly what happens today, so an expired session degrades to
// the current behaviour instead of failing.
export function getToken() {
  if (!loaded) {
    try {
      cached = localStorage.getItem(KEY)
    } catch {
      cached = null
    }
    loaded = true
  }
  if (!cached) return null
  if (expiryOf(cached) <= Date.now()) {
    clearToken()
    return null
  }
  return cached
}

// For the sign-in screen and anything that wants to show session state.
export function hasToken() {
  return getToken() !== null
}
