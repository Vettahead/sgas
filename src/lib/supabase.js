import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// When both env vars are present we run against the live Supabase project.
// Otherwise the app falls back to bundled demo data (see lib/demo.js).
export const LIVE = Boolean(url && anon)

export const supabase = LIVE ? createClient(url, anon) : null
