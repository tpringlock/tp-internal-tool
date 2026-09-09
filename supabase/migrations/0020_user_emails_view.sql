-- Emails live in auth.users, which the data API doesn't expose. This view lets
-- the service-role client bulk-fetch emails by id for the admin users page
-- (the GoTrue admin API has no get-by-ids endpoint, and listing every user
-- just to join emails doesn't scale). Security-definer semantics (invoker off)
-- let the view read auth.users; grants are stripped from anon/authenticated so
-- only trusted server code using the service role can select from it.
create or replace view public.user_emails as
  select id, email from auth.users;

alter view public.user_emails set (security_invoker = off);
revoke all on public.user_emails from anon, authenticated;
