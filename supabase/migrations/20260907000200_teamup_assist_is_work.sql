-- "SG Assist" sits on Hols / Not Available, so it was being read as time off.
-- Assisting is somebody helping on another assessor's course — it is work, and
-- the same class of mistake as "LCL Audit Prep" being filed under holidays.
-- The word in the title beats the calendar it happens to sit on.
insert into public.teamup_title_hint (pattern, means, where_kind) values
  ('assist',    'whereabouts', 'other'),
  ('assisting', 'whereabouts', 'other'),
  ('liaise',    'whereabouts', 'other')
on conflict (pattern) do nothing;
