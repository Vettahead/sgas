-- ─────────────────────────────────────────────────────────────────────────────
-- SESSION TOKENS, PART 1 — the store and the check. NOTHING ENFORCES IT YET.
--
-- Why this exists: sign-in tokens were JWTs signed with this project's LEGACY
-- JWT SECRET, and Supabase is retiring the legacy anon/service_role keys by the
-- end of 2026. A session token in a table has no signing secret at all, so
-- there is nothing left to retire. It also buys two things the JWT cannot:
-- sign-out-everywhere, and an answer to "who is signed in right now".
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.app_session (
  session_id   bigint generated always as identity primary key,
  -- The RAW TOKEN IS NEVER STORED. A database dump is therefore not a set of
  -- live sessions. sha256 rather than bcrypt on purpose: this is looked up on
  -- every single request, and a 256-bit random token has nothing to brute.
  token_hash   text        not null unique,
  user_id      bigint      not null references public.app_user(user_id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_seen_at timestamptz,
  user_agent   text
);

create index if not exists app_session_user_idx    on public.app_session(user_id);
create index if not exists app_session_expires_idx on public.app_session(expires_at);

-- No client ever touches this table directly — every path goes through the
-- SECURITY DEFINER functions below. RLS on with no policies is the belt to the
-- braces of granting nothing.
alter table public.app_session enable row level security;
revoke all on public.app_session from anon, authenticated;

-- The header the browser sends. PostgREST exposes request headers to SQL, which
-- is the whole mechanism; verified on this project 30 Aug 2026.
create or replace function public.app_session_token()
returns text language sql stable set search_path = public
as $$
  select nullif(current_setting('request.headers', true), '')::json ->> 'x-sgas-session';
$$;

-- Returns the app_user_id behind the current request's session token, or null.
--
-- Two ways in, and the order matters. The pre-request hook (part 4) resolves the
-- token once per request and leaves the answer in a transaction-local GUC, so
-- the eighteen policies that call this do one lookup between them rather than
-- one each. If the hook is not installed — or was dropped by a platform restore
-- — the GUC is empty and this falls back to reading the table itself, so the
-- check is correct either way and only slower.
--
-- The GUC cannot be forged: PostgREST sets `request.*` and the role, and gives a
-- client no way to set anything else. is_local = true, so it dies with the
-- transaction and cannot leak onto the next request on the pooled connection.
create or replace function public.app_session_user_id()
returns bigint language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  v_cached text := nullif(current_setting('app.session_user_id', true), '');
  v_token  text;
  v_id     bigint;
begin
  if v_cached is not null then
    return v_cached::bigint;
  end if;

  v_token := public.app_session_token();
  if v_token is null then return null; end if;

  select s.user_id into v_id
  from public.app_session s
  join public.app_user u on u.user_id = s.user_id
  where s.token_hash = encode(digest(v_token, 'sha256'), 'hex')
    and s.revoked_at is null
    and s.expires_at > now()
    and u.is_active;

  return v_id;
end $$;

create or replace function public.app_session_valid()
returns boolean language sql stable set search_path = public
as $$ select public.app_session_user_id() is not null; $$;

grant execute on function public.app_session_token()   to anon, authenticated;
grant execute on function public.app_session_user_id() to anon, authenticated;
grant execute on function public.app_session_valid()   to anon, authenticated;
