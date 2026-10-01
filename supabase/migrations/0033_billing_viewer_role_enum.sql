-- Add the 'billing_viewer' role ("Chỉ xem") to the user_role enum.
--
-- A billing viewer can open /billing and read everything there (contracts,
-- price table, uploads, calculations), download source files and export
-- Excel, but cannot change anything. Outside /billing it behaves like an
-- employee. RLS for the role is in 0034.
--
-- IMPORTANT: this MUST live in its own migration file (same reason as 0026):
-- Postgres forbids using a newly added enum value in the transaction that
-- added it, and 0034 references 'billing_viewer' in
-- private.is_billing_viewer(). Do NOT merge these two files.
--
-- Rollback: an enum value cannot be dropped. Leaving it unused is harmless;
-- see supabase/revert/0034_billing_viewer_rls.revert.sql.

alter type public.user_role add value if not exists 'billing_viewer';
