-- Foundation schema for the internal portal + document management tool.
-- Tables: profiles, clients, projects, project_members, documents,
--         share_links, activity_log.
-- RLS policies live in 0002_rls.sql; storage bucket in 0003_storage.sql.

-- pgcrypto (for gen_random_bytes) lives in the `extensions` schema on Supabase.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'employee');

create type public.doc_type as enum (
  'contract',
  'addendum',
  'payment_record',
  'invoice',
  'debt_reconciliation',
  'handover_minutes',
  'correspondence',
  'meeting_minutes'
);

-- ---------------------------------------------------------------------------
-- Utility: keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth.users, holds role + active status
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       public.user_role not null default 'employee',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helpers (bypass RLS to avoid recursive policy checks)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin' and p.is_active
  );
$$;

create or replace function public.is_active_user(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.is_active
  );
$$;

-- NOTE: is_project_member is defined after the project_members table below,
-- since a `language sql` body is validated against referenced tables at
-- creation time.

-- ---------------------------------------------------------------------------
-- Provision a profile whenever an auth user is created.
-- full_name / role come from the admin-supplied user metadata.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'employee'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prevent employees from escalating their own role or reactivating themselves.
-- Service-role callers (admin server actions) are allowed through.
create or replace function public.prevent_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if (new.role is distinct from old.role)
     or (new.is_active is distinct from old.is_active) then
    if not public.is_admin(auth.uid()) then
      raise exception 'Only admins may change role or active status';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_privilege_change
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_change();

-- ---------------------------------------------------------------------------
-- clients repository
-- ---------------------------------------------------------------------------
create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null unique,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- projects repository (each belongs to a client)
-- ---------------------------------------------------------------------------
create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null unique,
  client_id  uuid not null references public.clients (id) on delete restrict,
  status     text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_client_id_idx on public.projects (client_id);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- project_members: the per-project access grant
-- ---------------------------------------------------------------------------
create table public.project_members (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id),
  assigned_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index project_members_user_id_idx on public.project_members (user_id);

-- Defined here (not with the other helpers) because its SQL body references
-- project_members, which must exist first.
create or replace function public.is_project_member(pid uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = pid and m.user_id = uid
  );
$$;

-- ---------------------------------------------------------------------------
-- documents: PDF files, always tied to a project + uploader.
-- Client is derived through project_id (no redundant client_id column).
-- ---------------------------------------------------------------------------
create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete restrict,
  doc_type       public.doc_type not null,
  canonical_name text not null,
  storage_path   text not null unique,
  mime_type      text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  file_size      bigint not null check (file_size > 0),
  -- Only signed documents may be stored: attestation must be true.
  signed_attested boolean not null default false check (signed_attested = true),
  uploaded_by    uuid not null references public.profiles (id),
  created_at     timestamptz not null default now()
);

create index documents_project_id_idx on public.documents (project_id);
create index documents_uploaded_by_idx on public.documents (uploaded_by);

-- ---------------------------------------------------------------------------
-- share_links: time-limited public links to a single document
-- ---------------------------------------------------------------------------
create table public.share_links (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  -- pgcrypto lives in the `extensions` schema on Supabase, so qualify it.
  token       text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now()
);

create index share_links_document_id_idx on public.share_links (document_id);

-- ---------------------------------------------------------------------------
-- activity_log: append-only audit trail.
-- actor_user_id is null for anonymous share-link opens.
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id            bigint generated always as identity primary key,
  -- Defaults to the caller for authenticated inserts (satisfies the RLS
  -- insert check); the service role overrides it explicitly, or passes null
  -- for anonymous share-link opens.
  actor_user_id uuid references public.profiles (id) default auth.uid(),
  action        text not null,
  entity_type   text,
  entity_id     text,
  metadata      jsonb not null default '{}'::jsonb,
  ip            text,
  created_at    timestamptz not null default now()
);

create index activity_log_actor_idx on public.activity_log (actor_user_id);
create index activity_log_created_at_idx on public.activity_log (created_at desc);
