-- Security fix: handle_new_user (0001) read the initial role from
-- raw_user_meta_data, which a self-signup caller fully controls — with public
-- sign-ups enabled, POST /auth/v1/signup with {"data":{"role":"admin"}} would
-- provision an active admin profile. Read the role from raw_app_meta_data
-- instead: app_metadata can only be set by the service role / admin API
-- (app/actions/users.ts createUser), never by the signup endpoint, so a
-- self-registered user always lands as 'employee'. full_name stays in
-- user_metadata (display-only, harmless).
--
-- Public sign-ups should stay disabled in the dashboard regardless
-- (Authentication -> Sign In / Providers); this is defense-in-depth.

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
    coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'employee'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
