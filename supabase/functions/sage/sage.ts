// ─────────────────────────────────────────────────────────────────────────────
// Talking to Sage Business Cloud Accounting v3.1 — the READ half, and only the
// read half.
//
// There is one exported way to make a Sage request in this file and it is
// called `get`. There is no post, no put, no delete, and adding one would be a
// change to what SGAS promised Jen, not a refactor. See the migration
// 20260902100000 for the three places that promise is kept.
//
// TOKEN MECHANICS, which are unusual enough to be worth stating:
//   * access tokens last about five minutes;
//   * refresh tokens are SINGLE USE — refreshing invalidates the old one and
//     returns a new one, which must be stored immediately or the connection is
//     dead and a human has to sign in to Sage again;
//   * a refresh token also dies after ~31 days unused, so the scheduled sync is
//     what keeps the connection alive, not just what keeps the data fresh.
//
// ⚠ ENDPOINTS AND FIELD NAMES: taken from Sage's v3.1 documentation and two
// independent client libraries, but NOT yet exercised against a live business —
// there is no developer account at the time of writing. The first successful
// call is the moment to check `mapInvoice` below against a real response body
// and delete this warning.
// ─────────────────────────────────────────────────────────────────────────────

export const SAGE_AUTH_URL = 'https://www.sageone.com/oauth2/auth/central'
export const SAGE_TOKEN_URL = 'https://oauth.accounting.sage.com/token'
export const SAGE_API_BASE = 'https://api.accounting.sage.com/v3.1'

// Phase 1 is read only, and we ask Sage to enforce it rather than trusting
// ourselves to. With this scope a write is refused by Sage, not by us.
export const SAGE_SCOPE = 'readonly'

export type Dispatch = {
  client_id: string
  client_secret: string
  access_token: string | null
  refresh_token: string
  access_expires_at: string | null
  business_id: string | null
  scope: string
}

export type Tokens = {
  access_token: string
  refresh_token: string
  expires_in: number
  refresh_token_expires_in?: number
}

// ── The sign-in URL ──────────────────────────────────────────────────────────
export function authoriseUrl(clientId: string, redirectUri: string, state: string) {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SAGE_SCOPE,
    state,
    // Sage's central sign-in wants to know which region's Accounting to send
    // the user to. SGAS is UK.
    country: 'GB',
  })
  return `${SAGE_AUTH_URL}?${q}`
}

// ── Swapping the code for tokens, and refreshing ─────────────────────────────
async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(SAGE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const text = await res.text()
  if (!res.ok) {
    // Sage puts something useful in here; the caller shows it on the Admin
    // screen, so keep it rather than flattening it to "failed".
    throw new Error(`Sage token request refused (${res.status}): ${text.slice(0, 400)}`)
  }
  return JSON.parse(text) as Tokens
}

export function exchangeCode(d: { clientId: string; clientSecret: string; code: string; redirectUri: string }) {
  return tokenRequest({
    grant_type: 'authorization_code',
    client_id: d.clientId,
    client_secret: d.clientSecret,
    code: d.code,
    redirect_uri: d.redirectUri,
  })
}

export function refresh(d: { clientId: string; clientSecret: string; refreshToken: string }) {
  return tokenRequest({
    grant_type: 'refresh_token',
    client_id: d.clientId,
    client_secret: d.clientSecret,
    refresh_token: d.refreshToken,
  })
}

// ── Reading ──────────────────────────────────────────────────────────────────
// The ONLY request maker in the Sage surface. Deliberately GET-only.
export async function get(path: string, accessToken: string, businessId?: string | null) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  }
  // Mandatory once a business is known: it says which business the request is
  // about. Omitted only on the very first /businesses call, which is what tells
  // us the id in the first place.
  if (businessId) headers['X-Business'] = businessId

  const url = path.startsWith('http') ? path : `${SAGE_API_BASE}${path}`
  const res = await fetch(url, { method: 'GET', headers })
  const text = await res.text()
  if (!res.ok) throw new Error(`Sage GET ${path} failed (${res.status}): ${text.slice(0, 400)}`)
  return JSON.parse(text)
}

// Sage pages with a `$next` URL in the response rather than page numbers.
// A cap is passed in because an unbounded loop against somebody's live
// accounts is how you find the rate limit the hard way.
export async function getAllPages(path: string, accessToken: string, businessId: string, maxPages = 20) {
  const out: unknown[] = []
  let next: string | null = path
  for (let i = 0; i < maxPages && next; i++) {
    const page = await get(next, accessToken, businessId)
    if (Array.isArray(page?.$items)) out.push(...page.$items)
    else if (Array.isArray(page)) out.push(...page)
    next = typeof page?.$next === 'string' ? page.$next : null
  }
  return out
}

// ── Turning a Sage invoice into a row we cache ───────────────────────────────
// Written defensively on purpose: v3.1 nests some of these and flattens others
// depending on the `attributes` requested, and getting a null here is much
// better than a sync that dies on invoice 47 of 100.
export function mapInvoice(inv: any) {
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))
  return {
    sage_id: String(inv?.id ?? ''),
    invoice_number: inv?.invoice_number ?? inv?.displayed_as ?? null,
    reference: inv?.reference ?? null,
    contact_sage_id: inv?.contact?.id ?? inv?.contact_id ?? null,
    contact_name: inv?.contact?.displayed_as ?? inv?.contact_name ?? null,
    invoice_date: inv?.date ?? null,
    due_date: inv?.due_date ?? null,
    total_amount: num(inv?.total_amount),
    outstanding_amount: num(inv?.outstanding_amount),
    currency: inv?.currency?.displayed_as ?? inv?.currency?.id ?? null,
    // Sage's own words for the state. Kept verbatim so nobody has to guess what
    // it meant six months later; SGAS derives paid/part-paid from the NUMBER,
    // never from this string.
    sage_status: inv?.status?.displayed_as ?? inv?.status?.id ?? null,
  }
}
