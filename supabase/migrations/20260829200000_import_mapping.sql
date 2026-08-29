-- ── the import worklist ─────────────────────────────────────────────────────
-- The Access file names its qualifications and its staff in free text, with
-- twenty years of typos in it. "S GASDSDON", "S GADSDON", "S GASDSON" and "S G"
-- are all Simon. Nothing can be imported until a person says what each of those
-- strings means, so this table is the list of those decisions and the Progress
-- page is where they get made.
--
-- One row per distinct value found in the file. `proposed` is Claude's guess;
-- `decision` is the human answer, and nothing is imported on a guess.
create table if not exists public.import_mapping (
  kind         text not null check (kind in ('qualification','staff','employer')),
  source_value text not null,                 -- exactly as it appears in Access
  occurrences  integer not null default 0,    -- how much it matters
  proposed     text,                          -- the suggestion, or null
  confidence   text not null default 'none'   -- exact | likely | none | not_qual
               check (confidence in ('exact','likely','none','not_qual')),
  decision     text                           -- map | create | ignore  (null = undecided)
               check (decision is null or decision in ('map','create','ignore')),
  target_code  text,                          -- category code, or staff/company name
  target_id    bigint,                        -- assessor_id / category_id / company_id
  note         text,
  decided_by   text,
  decided_at   timestamptz,
  primary key (kind, source_value)
);

alter table public.import_mapping enable row level security;   -- and NO policies
revoke all on table public.import_mapping from anon, authenticated;

create or replace function public.app_import_mappings(p_admin text, p_admin_pw text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_out jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.kind, m.occurrences desc, m.source_value), '[]'::jsonb)
    into v_out from import_mapping m;
  return v_out;
end;
$$;

-- One decision. target_code is what it maps to; for 'create' it is the code or
-- name to create, which is why it is still required.
create or replace function public.app_import_map_save(
  p_admin text, p_admin_pw text, p_kind text, p_source text,
  p_decision text, p_target_code text default null, p_target_id bigint default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  if p_decision is not null and p_decision not in ('map','create','ignore') then
    raise exception 'Unknown decision';
  end if;
  if p_decision in ('map','create') and coalesce(trim(p_target_code), '') = '' then
    raise exception 'Choose what it maps to first';
  end if;

  update import_mapping
     set decision = p_decision,
         target_code = case when p_decision = 'ignore' then null else nullif(trim(p_target_code), '') end,
         target_id = case when p_decision = 'ignore' then null else p_target_id end,
         note = nullif(trim(coalesce(p_note, '')), ''),
         decided_by = p_admin,
         decided_at = case when p_decision is null then null else now() end
   where kind = p_kind and source_value = p_source;
  if not found then raise exception 'No such row in the worklist'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- "Accept everything I proposed" — only where a proposal exists and nobody has
-- decided yet, so it can never overwrite a human answer.
create or replace function public.app_import_accept_proposals(p_admin text, p_admin_pw text, p_kind text)
returns integer
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare n integer;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  update import_mapping
     set decision = 'map', target_code = proposed, decided_by = p_admin, decided_at = now()
   where kind = p_kind and decision is null and proposed is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.app_import_mappings(text, text) from public, anon, authenticated;
revoke all on function public.app_import_map_save(text, text, text, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.app_import_accept_proposals(text, text, text) from public, anon, authenticated;
grant execute on function public.app_import_mappings(text, text) to anon, authenticated;
grant execute on function public.app_import_map_save(text, text, text, text, text, text, bigint, text) to anon, authenticated;
grant execute on function public.app_import_accept_proposals(text, text, text) to anon, authenticated;

-- The 162 rows themselves (122 qualification columns, 40 staff spellings) were
-- generated from the Access file and inserted in the same session. They are not
-- repeated here: they are data read out of a file that is not in this repo, and
-- re-running this migration on a fresh database should not invent them.
