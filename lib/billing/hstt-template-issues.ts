/**
 * Display helpers for template check reports (client-safe: type imports only).
 * Messages: HsttTemplates.issue.<code> in messages/*.json.
 */
import type { TemplateIssue } from "./hstt-template";

/**
 * ICU values of an issue message. `ph` is the placeholder written with its
 * braces ("{{a.ten}}"), which ICU messages cannot contain literally.
 */
export function issueValues(issue: TemplateIssue): Record<string, string> {
  const values = { ...(issue.values ?? {}) };
  return { ...values, ph: values.key ? `{{${values.key}}}` : "" };
}

/** Errors first, then warnings; within each, by sheet in file order then cell. */
export function sortIssues(issues: TemplateIssue[], sheetOrder: string[]): TemplateIssue[] {
  const pos = (s?: string) => (s === undefined ? -1 : sheetOrder.indexOf(s));
  const row = (c?: string) => Number(/\d+/.exec(c ?? "")?.[0] ?? 0);
  return [...issues].sort(
    (a, b) =>
      (a.level === b.level ? 0 : a.level === "error" ? -1 : 1) || pos(a.sheet) - pos(b.sheet) || row(a.cell) - row(b.cell),
  );
}
