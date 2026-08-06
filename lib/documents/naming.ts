import type { DocType } from "../db/types";

/** Single-token labels used inside generated filenames (no spaces). */
const DOC_TYPE_FILENAME_LABEL: Record<DocType, string> = {
  contract: "Contract",
  addendum: "Addendum",
  payment_record: "PaymentRecord",
  invoice: "Invoice",
  debt_reconciliation: "DebtReconciliation",
  handover_minutes: "HandoverMinutes",
  correspondence: "Correspondence",
  meeting_minutes: "MeetingMinutes",
};

// Characters not allowed in file names across common filesystems.
const ILLEGAL_CHARS = /[/\\:*?"<>|]/g;

/** Make a name safe for one underscore-delimited filename segment. */
function sanitizeSegment(value: string): string {
  return value
    .replace(ILLEGAL_CHARS, "")
    .replace(/_/g, "-") // reserve underscore as the segment delimiter
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export interface CanonicalNameInput {
  clientName: string;
  projectName: string;
  docType: DocType;
  date: Date;
  /** Short unique suffix so same-day, same-type uploads stay distinct. */
  disambiguator: string;
}

/** Build the canonical display/download name: Client_Type_Project_YYYYMMDD_id.pdf */
export function buildCanonicalName(input: CanonicalNameInput): string {
  const client = sanitizeSegment(input.clientName);
  const project = sanitizeSegment(input.projectName);
  const type = DOC_TYPE_FILENAME_LABEL[input.docType];
  const stamp = formatDate(input.date);
  return `${client}_${type}_${project}_${stamp}_${input.disambiguator}.pdf`;
}

/** Storage object key: namespaced under the project with a stable file id. */
export function buildStoragePath(projectId: string, fileId: string): string {
  return `${projectId}/${fileId}.pdf`;
}
