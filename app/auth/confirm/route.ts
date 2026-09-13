import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/utils";

/**
 * Handles Supabase email links (e.g. password recovery) and establishes a
 * session before forwarding to `next` (defaults to home).
 *
 * Supports both link styles:
 *   - `?code=...`                 (default PKCE flow) -> exchangeCodeForSession
 *   - `?token_hash=...&type=...`  (token-hash templates) -> verifyOtp
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  // Relative paths only — an absolute URL here would win over `origin` in
  // new URL(next, origin) and turn the handler into an open redirect.
  const next = safeInternalPath(searchParams.get("next"));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/login?error=link", origin));
}
