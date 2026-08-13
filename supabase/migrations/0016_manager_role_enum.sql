-- Add the 'manager' role to the user_role enum.
--
-- IMPORTANT: this MUST live in its own migration file. Postgres forbids using a
-- newly added enum value in the same transaction that added it ("unsafe use of
-- new value"), and the Supabase CLI runs each migration file in its own
-- transaction. 0017_manager_role_rls.sql is the first migration that references
-- 'manager' (in private.is_content_manager()), so it has to run afterwards, as a
-- separate transaction. Do NOT merge these two files.

alter type public.user_role add value if not exists 'manager';
