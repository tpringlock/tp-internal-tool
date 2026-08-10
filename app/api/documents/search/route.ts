import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Row {
  id: string;
  canonical_name: string;
  projects: { clients: { id: string; name: string } | null } | null;
}

/**
 * Authenticated filename typeahead for the documents folder view. RLS scopes the
 * result to documents the caller may see, so employees only get their own files.
 * Returns up to 8 suggestions, each carrying its client folder for navigation.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data } = await supabase
    .from("documents")
    .select("id, canonical_name, projects!inner ( clients!inner ( id, name ) )")
    .ilike("canonical_name", `%${q}%`)
    .order("created_at", { ascending: false })
    .limit(8);

  const rows = (data ?? []) as unknown as Row[];
  const results = rows
    .filter((r) => r.projects?.clients)
    .map((r) => ({
      id: r.id,
      canonicalName: r.canonical_name,
      clientId: r.projects!.clients!.id,
      clientName: r.projects!.clients!.name,
    }));

  return NextResponse.json(results);
}
