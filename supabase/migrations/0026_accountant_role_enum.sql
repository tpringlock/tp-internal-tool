-- Add the 'accountant' role to the user_role enum (billing app access).
--
-- This supersedes the note in 0024_misa_master_data.sql ("accountants use the
-- 'manager' role"): accountants now get their own role, which opens the
-- "Tính hóa đơn tự động" app (/billing) but NOT the Admin Panel. Admins keep
-- access to everything.
--
-- IMPORTANT: this MUST live in its own migration file. Postgres forbids using a
-- newly added enum value in the same transaction that added it ("unsafe use of
-- new value"), and the Supabase CLI runs each migration file in its own
-- transaction. 0027_billing.sql is the first migration that references
-- 'accountant' (in private.is_billing_user()), so it has to run afterwards, as
-- a separate transaction. Do NOT merge these two files.

alter type public.user_role add value if not exists 'accountant';
