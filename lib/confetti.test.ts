import { describe, expect, it } from "vitest";
import { CONFETTI_COLORS, createConfetti, isConfettiGone, stepConfetti } from "./confetti";

/** Deterministic pseudo-random sequence for repeatable tests. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe("createConfetti", () => {
  it("shoots from both bottom corners, upwards and towards the middle", () => {
    const pieces = createConfetti(1000, 800, 10, seeded());
    expect(pieces).toHaveLength(10);
    for (const [i, p] of pieces.entries()) {
      expect(p.y).toBe(800);
      expect(p.vy).toBeLessThan(0);
      if (i % 2 === 0) {
        expect(p.x).toBe(0);
        expect(p.vx).toBeGreaterThan(0);
      } else {
        expect(p.x).toBe(1000);
        expect(p.vx).toBeLessThan(0);
      }
      expect(CONFETTI_COLORS).toContain(p.color);
    }
  });
});

describe("stepConfetti", () => {
  it("rises, slows down, then falls out of view", () => {
    let piece = createConfetti(400, 600, 1, seeded(7))[0];
    const startY = piece.y;
    piece = stepConfetti(piece);
    expect(piece.y).toBeLessThan(startY);

    let frames = 0;
    while (!isConfettiGone(piece, 600) && frames < 2000) {
      piece = stepConfetti(piece);
      frames++;
    }
    expect(isConfettiGone(piece, 600)).toBe(true);
    // Roughly 2 to 5 seconds at 60 fps.
    expect(frames).toBeGreaterThan(60);
    expect(frames).toBeLessThan(400);
  });

  it("does not count a piece still on its way up as gone", () => {
    const piece = { ...createConfetti(400, 600, 1, seeded())[0], y: 900, vy: -5 };
    expect(isConfettiGone(piece, 600)).toBe(false);
  });
});
