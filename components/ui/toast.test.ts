import { describe, it, expect } from "vitest";
import { addToast, removeToast, type ToastItem } from "./toast";

const item = (id: string): ToastItem => ({ id, message: id, tone: "info" });

describe("addToast", () => {
  it("appends to the end", () => {
    expect(addToast([item("a")], item("b")).map((t) => t.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("drops the oldest past the cap", () => {
    const five = ["a", "b", "c", "d", "e"].map(item);
    expect(addToast(five, item("f"), 5).map((t) => t.id)).toEqual([
      "b",
      "c",
      "d",
      "e",
      "f",
    ]);
  });
});

describe("removeToast", () => {
  it("removes by id", () => {
    expect(removeToast([item("a"), item("b")], "a").map((t) => t.id)).toEqual([
      "b",
    ]);
  });

  it("is a no-op for a missing id", () => {
    const list = [item("a")];
    expect(removeToast(list, "zzz")).toEqual(list);
  });
});
