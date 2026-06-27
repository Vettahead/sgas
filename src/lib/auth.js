// Password hashing for app-managed accounts. PBKDF2-HMAC-SHA256, 100k iters,
// 32-byte key — must match the seed in ../../sgas_app_users.sql and the seed
// hashes in core.js (all generated with the same parameters).

const ITERATIONS = 100000
const KEYLEN = 32

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}
function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomSaltHex() {
  const s = new Uint8Array(16)
  crypto.getRandomValues(s)
  return bytesToHex(s)
}

export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: ITERATIONS, hash: 'SHA-256' },
    key, KEYLEN * 8
  )
  return bytesToHex(bits)
}

export async function verifyPassword(password, saltHex, expectedHashHex) {
  const got = await hashPassword(password, saltHex)
  return got === expectedHashHex
}
