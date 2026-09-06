-- ─────────────────────────────────────────────────────────────────────────────
-- The files attached to Teamup events.
--
-- 207 of them across 106 events, 148 MB, and they are not incidental. They are
-- the certificates candidates bring to prove what they already hold, plus ID
-- documents. The filenames alone carry a name, the qualifications and an expiry
-- date — "Brian Critchley REGT1 & MET4 exp 13.12.2026.pdf", "Andrew Etchells
-- CMA1 MET1 EXP 07.10.2026.pdf", "Steve Sodden Driving Licence.pdf".
--
-- They exist ONLY in Teamup, and that subscription lapses in October. Each has
-- a download link with a hash on it, so they can be fetched — but they have to
-- be fetched before the account goes. stored_path is filled in when they are.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.teamup_attachment (
  attachment_id text primary key,
  event_id      text not null references public.teamup_event(event_id) on delete cascade,
  name          text not null,
  mimetype      text,
  bytes         bigint,
  link          text,
  uploaded_at   timestamptz,
  stored_path   text,
  stored_at     timestamptz,
  noted_name    text,
  noted_expiry  date,
  client_id     bigint references public.client(client_id) on delete set null,
  first_seen    timestamptz not null default now()
);
alter table public.teamup_attachment enable row level security;
revoke all on public.teamup_attachment from anon, authenticated;
create index if not exists teamup_attachment_event_idx on public.teamup_attachment (event_id);
create index if not exists teamup_attachment_unfetched_idx on public.teamup_attachment (stored_at) where stored_at is null;

create or replace function public.app_teamup_read_attachments()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_out jsonb;
begin
  insert into teamup_attachment (attachment_id, event_id, name, mimetype, bytes, link, uploaded_at,
                                 noted_name, noted_expiry)
  select a->>'id', e.event_id, a->>'name', a->>'mimetype',
         nullif(a->>'size','')::bigint, a->>'link', nullif(a->>'upload_dt','')::timestamptz,
         (regexp_match(a->>'name', '^\s*([A-Z][a-zA-Z''-]{1,20}(?:\s+[A-Z][a-zA-Z''-]{1,20}){1,2})'))[1],
         case
           when (a->>'name') ~* 'exp[a-z]*\.?\s*([0-3]?[0-9])[./-]([01]?[0-9])[./-](20[0-9]{2})'
             then to_date(
               (regexp_match(a->>'name','exp[a-z]*\.?\s*([0-3]?[0-9])[./-]([01]?[0-9])[./-](20[0-9]{2})','i'))[1] || '/' ||
               (regexp_match(a->>'name','exp[a-z]*\.?\s*([0-3]?[0-9])[./-]([01]?[0-9])[./-](20[0-9]{2})','i'))[2] || '/' ||
               (regexp_match(a->>'name','exp[a-z]*\.?\s*([0-3]?[0-9])[./-]([01]?[0-9])[./-](20[0-9]{2})','i'))[3],
               'DD/MM/YYYY')
           end
    from teamup_event e, lateral jsonb_array_elements(e.raw->'attachments') a
   where not e.gone_from_teamup and a ? 'id'
  on conflict (attachment_id) do update
    set link = excluded.link, name = excluded.name, bytes = excluded.bytes;

  select jsonb_build_object(
    'files', count(*), 'events', count(distinct event_id),
    'total_size_mb', round((sum(bytes)/1048576.0)::numeric, 1),
    'a_name_in_the_filename', count(*) filter (where noted_name is not null),
    'an_expiry_in_the_filename', count(*) filter (where noted_expiry is not null),
    'not_yet_fetched', count(*) filter (where stored_at is null)
  ) into v_out from teamup_attachment;
  return v_out;
end;
$$;
