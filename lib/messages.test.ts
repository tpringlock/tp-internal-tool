import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import vi from "@/messages/vi.json";
import en from "@/messages/en.json";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [prefix + k] : leaves(v, `${prefix}${k}.`),
  );
}

describe("messages", () => {
  it("vi and en have the same keys", () => {
    expect(leaves(en as Tree).sort()).toEqual(leaves(vi as Tree).sort());
  });

  // Formats every billing message so an ICU syntax slip (unbalanced braces,
  // stray "<" parsed as a tag) fails here instead of on a page.
  it.each([
    ["vi", vi],
    ["en", en],
  ])("billing messages parse (%s)", (locale, messages) => {
    const errors: string[] = [];
    const t = createTranslator({
      locale,
      messages: messages as Tree,
      onError: (e) => errors.push(e.message),
    });
    const values = { count: 2, name: "x", codes: "x", kho: "x", month: "x", from: "x", to: "x", total: "x", no: "x", price: "x", unit: "x", days: 1, layout: "x", size: "x", warehouses: 1, start: 26, end: 25, date: "x", message: "x", errors: 0, fileFrom: "x", fileTo: "x" };
    for (const ns of ["Billing", "BillingNav"] as const) {
      for (const key of leaves((messages as Tree)[ns] as Tree)) {
        if (key === "scopeNotice") t.rich(`${ns}.${key}` as never, { b: (c: unknown) => c } as never);
        else t(`${ns}.${key}` as never, values as never);
      }
    }
    expect(errors).toEqual([]);
  });
});
