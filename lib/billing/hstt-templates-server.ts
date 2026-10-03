import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { HsttInput } from "./hstt-export";
import sample from "./__fixtures__/hstt-t09-2026-vietpanel.json";

/** Private bucket of the customer templates (0041). */
export const HSTT_TEMPLATE_BUCKET = "billing-templates";

/**
 * The standard TP template. Shipped with the server bundle via
 * outputFileTracingIncludes (next.config.ts) for every route that reads it.
 */
const STANDARD_TEMPLATE = join(process.cwd(), "docs", "hstt", "hstt-template.xlsx");

/**
 * Data of the trial HSTT generated when a template is checked: period
 * 09/2026 of Việt Panel (800.796.900 after tax), the same snapshot the tests
 * use (scripts/hstt-snapshot.mts).
 */
export const HSTT_SAMPLE_INPUT = sample as unknown as HsttInput;

export const sha256Of = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

export async function readStandardTemplate(): Promise<{ buffer: Buffer; sha256: string }> {
  const buffer = await readFile(STANDARD_TEMPLATE);
  return { buffer, sha256: sha256Of(buffer) };
}

type Supabase = SupabaseClient<Database>;

/** The template assigned to a contract and its current (highest) version; null = standard. */
export interface ContractTemplate {
  templateId: string;
  name: string;
  status: "active" | "retired";
  versionId: string;
  version: number;
  storagePath: string;
  sha256: string;
}

/** Read through RLS (callers are guarded). */
export async function contractTemplate(supabase: Supabase, contractId: string): Promise<ContractTemplate | null> {
  const { data: link } = await supabase
    .from("billing_contract_hstt_templates")
    .select("template_id")
    .eq("contract_id", contractId)
    .maybeSingle();
  if (!link) return null;
  const [{ data: tpl }, { data: ver }] = await Promise.all([
    supabase.from("billing_hstt_templates").select("id, name, status").eq("id", link.template_id).maybeSingle(),
    supabase
      .from("billing_hstt_template_versions")
      .select("id, version, storage_path, sha256")
      .eq("template_id", link.template_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!tpl || !ver) return null;
  return {
    templateId: tpl.id,
    name: tpl.name,
    status: tpl.status,
    versionId: ver.id,
    version: ver.version,
    storagePath: ver.storage_path,
    sha256: ver.sha256,
  };
}

export async function downloadTemplateFile(storagePath: string): Promise<Buffer | null> {
  const { data, error } = await createAdminClient().storage.from(HSTT_TEMPLATE_BUCKET).download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** The template file to fill for a contract: its assigned template, else the standard one. */
export async function resolveHsttTemplate(
  supabase: Supabase,
  contractId: string,
): Promise<{ buffer: Buffer; sha256: string; template: ContractTemplate | null } | { error: "fileMissing"; template: ContractTemplate }> {
  const template = await contractTemplate(supabase, contractId);
  if (!template) return { ...(await readStandardTemplate()), template: null };
  const buffer = await downloadTemplateFile(template.storagePath);
  if (!buffer) return { error: "fileMissing", template };
  return { buffer, sha256: template.sha256, template };
}
