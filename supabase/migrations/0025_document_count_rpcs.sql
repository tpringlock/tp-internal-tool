-- Document-count aggregates as RPCs so the Documents workspace no longer loads
-- every matching row into JS just to count them. PostgREST caps a response at
-- 1000 rows by default; past 1000 documents the customer sidebar counts, the
-- per-project badges and the total-files / total-storage cards silently
-- under-reported. Aggregating inside SQL returns one row per client/project, so
-- the count/sum is over ALL rows the caller may see, unaffected by the cap.
--
-- Both functions are SECURITY INVOKER (the default): called via PostgREST .rpc()
-- under the user's JWT they run as `authenticated` with the caller's auth.uid(),
-- so RLS on documents/projects is enforced inside the body. An employee's counts
-- cover only their assigned projects; managers/admins see everything -- exactly
-- matching the RLS-filtered queries these replace. (DEFINER would bypass RLS and
-- leak other users' counts, and would force re-implementing the visibility
-- predicate by hand -- unlike the private.is_* helpers which are DEFINER on
-- purpose because they must read profiles/project_members regardless of caller.)
--
-- Style follows 0004/0017: language sql, stable, pinned search_path, execute
-- revoked from public+anon and granted to authenticated.

-- Per-client visible document count (with client name so callers don't need a
-- second clients query). Only clients with >= 1 visible document appear; the
-- caller (documents/layout.tsx) seeds zero-count clients for content managers
-- from a separate clients query.
create or replace function public.document_counts_by_client()
returns table (client_id uuid, client_name text, doc_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select p.client_id, c.name as client_name, count(*)::bigint as doc_count
  from public.documents d
  join public.projects p on p.id = d.project_id
  join public.clients  c on c.id = p.client_id
  group by p.client_id, c.name;
$$;

revoke execute on function public.document_counts_by_client() from public, anon;
grant  execute on function public.document_counts_by_client() to authenticated;

-- Per-project visible document count + byte sum for a single client. Projects
-- with zero visible documents are absent (the caller defaults them to 0).
create or replace function public.document_stats_by_project(p_client_id uuid)
returns table (project_id uuid, doc_count bigint, byte_sum bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d.project_id,
    count(*)::bigint as doc_count,
    coalesce(sum(d.file_size), 0)::bigint as byte_sum
  from public.documents d
  join public.projects p on p.id = d.project_id
  where p.client_id = p_client_id
  group by d.project_id;
$$;

revoke execute on function public.document_stats_by_project(uuid) from public, anon;
grant  execute on function public.document_stats_by_project(uuid) to authenticated;
