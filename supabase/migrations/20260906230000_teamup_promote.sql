-- ─────────────────────────────────────────────────────────────────────────────
-- Bringing the captured Teamup events onto the calendar.
--
-- Capture (20260906160000) took a copy of every event before the subscription
-- lapses. Classification (20260906220000) worked out what each one is. This is
-- the step that makes them real: courses become sessions, time off becomes
-- holidays, everything else becomes an engagement.
--
-- Every target row carries the Teamup event id it came from, with a unique
-- index on it, so the whole thing can be run again after a re-pull or a
-- re-classify without producing a second copy of anything.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.holiday    add column if not exists teamup_event_id text;
alter table public.engagement add column if not exists teamup_event_id text;
alter table public.session    add column if not exists teamup_event_id text;
alter table public.session    add column if not exists from_teamup boolean not null default false;

create unique index if not exists session_teamup_idx
  on public.session (teamup_event_id) where teamup_event_id is not null;
create unique index if not exists holiday_teamup_idx
  on public.holiday (teamup_event_id) where teamup_event_id is not null;
create unique index if not exists engagement_teamup_idx
  on public.engagement (teamup_event_id) where teamup_event_id is not null;

-- The admin door. The work itself is service_role only, the same shape as the
-- pull and the classify: no door on the worker, one door in front of it.
create or replace function public.app_teamup_promote(p_admin text, p_admin_pw text)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  return app_teamup_promote_run();
end;
$$;

revoke all on function public.app_teamup_promote(text, text) from public, anon;
grant execute on function public.app_teamup_promote(text, text) to authenticated;
