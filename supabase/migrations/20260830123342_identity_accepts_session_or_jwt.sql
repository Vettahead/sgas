-- ─────────────────────────────────────────────────────────────────────────────
-- SESSION TOKENS, PART 3 — one answer to "who is this", two ways to prove it.
--
-- Everything that used to ask the JWT now asks "session token OR JWT claim".
-- Both paths are live at once, which is what lets the changeover happen without
-- a moment where somebody is locked out.
--
-- This changes NOTHING about who can reach what: the policies still only admit
-- the `authenticated` role, and until the pre-request hook in part 4 a request
-- carrying a session token still arrives as `anon` with no grants.
--
-- NOTE: app_role() is redefined as SECURITY DEFINER in
-- 20260830123935_app_role_must_be_security_definer.sql — it has to read
-- app_user, which is granted to nobody. It is left as written here so the
-- history shows what went wrong and why.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.app_user_id()
returns bigint language sql stable set search_path = public
as $$ select coalesce(public.app_session_user_id(), public.app_jwt_user_id()); $$;

create or replace function public.app_role()
returns text language sql stable set search_path = public
as $$
  select coalesce(
    (select u.role from public.app_user u where u.user_id = public.app_session_user_id()),
    public.app_jwt_role()
  );
$$;

grant execute on function public.app_user_id() to anon, authenticated;
grant execute on function public.app_role()    to anon, authenticated;

-- The function all eighteen table policies call. Its meaning is unchanged —
-- "this request proved who it is" — only the ways of proving it have grown.
create or replace function public.app_is_signed_in()
returns boolean language sql stable set search_path = public
as $$ select public.app_user_id() is not null; $$;

create or replace function public.app_is_admin(p_user text, p_pw text)
returns boolean language sql security definer set search_path = public, extensions
as $$
  select
    exists (
      select 1 from app_user u
      where u.user_id = public.app_user_id()
        and u.is_active and u.role = 'ADMIN'
    )
    or
    -- the password path: the Edge Function has no token, and a signed-out
    -- caller must still be able to prove itself
    exists (
      select 1 from app_user
      where lower(username) = lower(p_user)
        and is_active and role = 'ADMIN'
        and password_hash = crypt(p_pw, password_hash)
    );
$$;
