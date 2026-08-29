import { createClient } from '@supabase/supabase-js'
import { getToken } from './session.js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// When both env vars are present we run against the live Supabase project.
// Otherwise the app falls back to bundled seed data (see lib/core.js).
export const LIVE = Boolean(url && anon)

// `accessToken` is called before every request. Returning the signed-in user's
// JWT makes Postgres run that request as `authenticated`; returning null makes
// it `anon`, which is what the whole app did until now — so a signed-out
// browser, an expired token and an old build all still work.
//
// Supplying this option turns off supabase-js's own auth handling, which is
// correct: this app has never used Supabase Auth.
export const supabase = LIVE
  ? createClient(url, anon, { accessToken: async () => getToken() })
  : null
