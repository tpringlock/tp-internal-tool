import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canUseBilling } from "@/lib/auth/roles";
import type { Profile } from "@/lib/db/types";

export interface SessionUser {
  id: string;
  email: string | null;
  profile: Profile;
}

/**
 * Resolve the current signed-in user and their profile, or null.
 * Memoised per request with React cache so repeated calls in one render pass
 * hit Supabase once. Deactivated accounts are treated as signed-out (they are
 * also banned at the auth layer, so a live session should not exist).
 *
 * The session JWT is verified locally with getClaims() (signature + expiry via
 * the cached JWKS) instead of a getUser() round-trip to Supabase Auth; the
 * profile lookup below still re-checks is_active and the role on every request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", claims.sub)
    .single();

  if (!profile || !profile.is_active) return null;

  return { id: claims.sub, email: claims.email ?? null, profile };
});

/** Require a signed-in user or redirect to the login page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Require an admin or redirect (to login if signed-out, home if not admin). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.profile.role !== "admin") redirect("/");
  return user;
}

/**
 * Require a content manager (admin or manager) or redirect home. Managers may
 * create/edit clients, projects and academy content; deleting those top-level
 * entities and all user/activity administration stays admin-only.
 */
export async function requireContentManager(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.profile.role !== "admin" && user.profile.role !== "manager") {
    redirect("/");
  }
  return user;
}

/**
 * Require a billing user (admin or accountant) or redirect home. Guards the
 * whole /billing app and every billing action / route handler.
 */
export async function requireBillingUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canUseBilling(user.profile.role)) redirect("/");
  return user;
}
