# Supabase setup

The app needs a Supabase project for Postgres, Auth and Storage.

## 1. Create the project

1. Create a project at https://supabase.com.
2. In **Project Settings → API**, copy the Project URL, the `anon` key, and the
   `service_role` key.
3. Copy `.env.example` to `.env.local` and fill those in. Set
   `NEXT_PUBLIC_SITE_URL` to `http://localhost:3000` for local dev.

## 2. Run the migrations

Apply the SQL in `supabase/migrations` in order. Either:

- **Supabase Studio → SQL Editor**: paste and run `0001_init.sql`,
  `0002_rls.sql`, `0003_storage.sql`, `0004_security_hardening.sql` in that
  order; or
- **Supabase CLI**: `supabase link` then `supabase db push`.

This creates the schema, RLS policies, the `handle_new_user` trigger, and the
private `documents` storage bucket. `0004_security_hardening.sql` then locks down
the `SECURITY DEFINER` functions (per the security advisor): the RLS helpers
(`is_admin`, `is_active_user`, `is_project_member`) move to a `private` schema
that PostgREST does not expose, and the trigger-only functions have their
`EXECUTE` revoked from client roles.

## 3. Configure Auth

- **Authentication → Providers → Email**: enabled. Public sign-ups are not used
  (accounts are created by admins), so you may disable "Allow new users to sign
  up" once your first admin exists.
- **Authentication → Sign In / Providers → Password**: enable **Leaked password
  protection** (checks passwords against HaveIBeenPwned). This clears the
  `auth_leaked_password_protection` security-advisor warning, which cannot be
  fixed in SQL.
- **Authentication → URL Configuration**: set **Site URL** to
  `http://localhost:3000` and add `http://localhost:3000/**` (and your deployed
  equivalent) to the redirect allow-list, so password-reset links work.
- **Password reset links (robust option)**: the default reset email uses the
  PKCE `code` flow, which only works in the same browser that requested the
  reset. For links that also work cross-browser / on mobile, edit
  **Authentication → Email Templates → Reset Password** to use a token hash:

  ```html
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Reset Password</a>
  ```

  The `/auth/confirm` handler accepts both styles, so no code change is needed.

## 4. Bootstrap the first admin

There is no public signup, so create the first admin manually once:

1. **Authentication → Users → Add user** in Studio. Enter an email + password
   and tick "Auto confirm user". The `handle_new_user` trigger creates a
   matching `profiles` row with role `employee`.
2. Promote it to admin in the **SQL Editor**. The `profiles_prevent_privilege_change`
   trigger blocks role changes from non-admins, and the SQL Editor runs without
   an auth context, so disable the trigger just for this one-time bootstrap:

   ```sql
   alter table public.profiles disable trigger profiles_prevent_privilege_change;

   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'you@company.com');

   alter table public.profiles enable trigger profiles_prevent_privilege_change;
   ```

After that, sign in and create all other users from **Admin → Users** in the
app. Those actions use the service-role key, which the trigger permits, so no
disabling is ever needed again.

## Regenerating types (optional)

`lib/db/types.ts` is hand-written to match these migrations. To regenerate from
the live database instead:

```bash
supabase gen types typescript --linked > lib/db/types.generated.ts
```
