-- app_role() has to look the role up in app_user, and app_user is granted to
-- nobody — deliberately, since the anon lockdown. As a SECURITY INVOKER function
-- it therefore threw "permission denied for table app_user" and took app_whoami
-- down with it, which is the one screen people go to when things look broken.
--
-- Caught within minutes by curling app_whoami on both paths rather than assuming
-- the migration that defined it had worked. Worth remembering: after the
-- lockdown, ANY new function that reads a locked table must be SECURITY DEFINER,
-- and the compiler will not tell you — only calling it will.
--
-- SECURITY DEFINER, and narrow: it returns the role of the caller's OWN account
-- and takes no arguments, so there is nothing to point at anybody else.
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select u.role from public.app_user u where u.user_id = public.app_session_user_id()),
    public.app_jwt_role()
  );
$$;
grant execute on function public.app_role() to anon, authenticated;
