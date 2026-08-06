import type { DocType } from "@/lib/db/types";

/** Human-readable labels for document types, in display order. */
export const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: "contract", label: "Contract" },
  { value: "addendum", label: "Contract addendum" },
  { value: "payment_record", label: "Payment record" },
  { value: "invoice", label: "Invoice" },
  { value: "debt_reconciliation", label: "Debt reconciliation statement" },
  { value: "handover_minutes", label: "Handover minutes" },
  { value: "correspondence", label: "Official correspondence" },
  { value: "meeting_minutes", label: "Meeting minutes" },
];

export const DOC_TYPE_LABEL: Record<DocType, string> = Object.fromEntries(
  DOC_TYPES.map((t) => [t.value, t.label]),
) as Record<DocType, string>;

/** Max upload size (25 MB) and the only accepted MIME type. */
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const ACCEPTED_MIME = "application/pdf";
