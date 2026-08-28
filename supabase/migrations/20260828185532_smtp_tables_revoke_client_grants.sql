-- Belt and braces. RLS-with-no-policies already yields nothing to a client, but
-- that is one line of defence and it is invisible in the schema. Removing the
-- table privileges as well means a future "add a permissive policy" mistake
-- still cannot expose these. The service role (Edge Functions) is unaffected.
revoke all on public.smtp_setting from anon, authenticated;
revoke all on public.smtp_mailbox from anon, authenticated;
revoke all on public.email_log    from anon, authenticated;
revoke all on sequence public.email_log_id_seq from anon, authenticated;
