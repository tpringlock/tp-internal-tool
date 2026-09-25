import { describe, expect, it } from "vitest";
import { amountForDb, hasFractionalQuantities, toAmount } from "./amounts";
import { formatNumber } from "@/lib/format";

describe("amountForDb", () => {
  it("keeps whole and fractional totals, dropping float noise", () => {
    expect(amountForDb(1_055_061_425)).toBe("1055061425.0000");
    expect(amountForDb(-665_017.5)).toBe("-665017.5000");
    expect(amountForDb(0.1 + 0.2)).toBe("0.3000");
    expect(amountForDb(-0.00001)).toBe("0.0000");
  });
});

describe("toAmount", () => {
  it("accepts PostgREST numeric as string or number", () => {
    expect(toAmount("1055061425.0000")).toBe(1_055_061_425);
    expect(toAmount("-665017.5000")).toBe(-665_017.5);
    expect(toAmount(12)).toBe(12);
  });
});

describe("formatNumber", () => {
  it("shows decimals only when there are any, Vietnamese style", () => {
    expect(formatNumber(1_055_061_425)).toBe("1.055.061.425");
    expect(formatNumber(-665_017.5)).toBe("-665.017,5");
    expect(formatNumber(-0.2)).toBe("-0,2");
    expect(formatNumber(toAmount("12.3456"))).toBe("12,3456");
  });
});

describe("hasFractionalQuantities", () => {
  const line = (qty: number) => ({ qty }) as never;
  it("flags any fractional quantity", () => {
    expect(hasFractionalQuantities({ items: [{ lines: [line(10), line(-5)] } as never] })).toBe(false);
    expect(hasFractionalQuantities({ items: [{ lines: [line(10), line(-0.2)] } as never] })).toBe(true);
  });
});
