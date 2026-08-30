// ──────────────────────────────────────────────────────────────────────────────
// What this browser holds to prove it is signed in.
//
// This app does not use Supabase Auth. Before the lockdown every request — signed
// in or not — reached Postgres as `anon`, and the only way to make the app work
// was to let `anon` read and write everything. That is why the anon key, which
// ships inside the JavaScript bundle and is therefore public, could read every
// delegate's date of birth and NI number. That is closed.
//
// TWO PROOFS ARE HELD AT ONCE, on purpose, while we change over:
//
//   • the JWT (`sgas_token`) — minted by app_login and signed with this
//     project's LEGACY JWT SECRET. Supabase is retiring the legacy keys by the
//     end of 2026, and the anon key is itself a JWT signed with that secret, so
//     the day that secret is revoked is the day sign-in stops working.
//
//   • the session token (`sgas_session`) — a row in app_session. No signing
//     secret, so nothing to retire, nothing to leak and nothing to rotate. It
//     can also be revoked, which a JWT never can: sign out here and the session
//     is dead at the database on the very next request.
//
// supabase.js sends both. The database accepts either. The JWT half comes out
// once the header path has been proven on the live site — see
// docs/claude/sgas-session-tokens-plan.md.
// ─────────────────────────────────────────────────────────────────────────────

const JWT_KEY = 'sgas_token'
const SESSION_KEY = 'sgas_session'

// Kept in memory as well as localStorage: these are read on every single
// request and must not touch storage that often.
let jwt = null
let jwtLoaded = false
let session = null // { t: token, e: epoch ms }
let sessionLoaded = false

function readStore(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // private mode, or storage disabled — the in-memory copy still works
  }
}

function writeStore(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* nothing to do: the in-memory copy carries this tab */
  }
}

// Read `exp` out of a JWT without verifying anything. The browser cannot verify
// a signature and must not pretend to — the database is what decides whether a
// token is good. This only avoids sending one we already know is stale.
function jwtExpiry(token) {
  try {
    const body = token.split('.')[1]
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'))
    return (JSON.parse(json).exp || 0) * 1000
  } catch {
    return 0
  }
}

// ── writing ──────────────────────────────────────────────────────────────────

// Called once, by appLogin, with whatever the server handed back. Either half
// may be missing — an older database returns no session token, and the JWT is
// null when the signing secret is absent — and the app has to work either way.
export function setTokens({ token = null, sessionToken = null, sessionExpires = null } = {}) {
  jwt = token || null
  jwtLoaded = true
  writeStore(JWT_KEY, jwt)

  // A session token is opaque random bytes and carries no expiry of its own,
  // so the server tells us when it ends. Falling back to 12 hours keeps an
  // older database working rather than treating its token as already dead.
  if (sessionToken) {
    const exp = sessionExpires ? Date.parse(sessionExpires) : Date.now() + 12 * 3600 * 1000
    session = { t: sessionToken, e: Number.isFinite(exp) ? exp : Date.now() + 12 * 3600 * 1000 }
    writeStore(SESSION_KEY, JSON.stringify(session))
  } else {
    session = null
    writeStore(SESSION_KEY, null)
  }
  sessionLoaded = true
}

export function clearTokens() {
  jwt = null
  session = null
  jwtLoaded = true
  sessionLoaded = true
  writeStore(JWT_KEY, null)
  writeStore(SESSION_KEY, null)
}

// ── reading ──────────────────────────────────────────────────────────────────
// Both return null rather than something known to be stale. Null means the
// request goes out as `anon`, which since the lockdown means empty screens —
// App.jsx watches for exactly that and signs the person out with an
// explanation, rather than leaving them looking at a system that seems broken.

export function getJwt() {
  if (!jwtLoaded) {
    jwt = readStore(JWT_KEY)
    jwtLoaded = true
  }
  if (!jwt) return null
  if (jwtExpiry(jwt) <= Date.now()) {
    jwt = null
    writeStore(JWT_KEY, null)
    return null
  }
  return jwt
}

export function getSessionToken() {
  if (!sessionLoaded) {
    try {
      session = JSON.parse(readStore(SESSION_KEY) || 'null')
    } catch {
      session = null
    }
    sessionLoaded = true
  }
  if (!session?.t) return null
  if (!(session.e > Date.now())) {
    session = null
    writeStore(SESSION_KEY, null)
    return null
  }
  return session.t
}

// Signed in as far as this browser can tell. Either proof will do — the
// database accepts either — so the person is only pushed back to the sign-in
// screen when both have gone.
export function hasToken() {
  return getSessionToken() !== null || getJwt() !== null
}
