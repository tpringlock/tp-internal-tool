/**
 * Confetti physics, pure so it can be unit-tested. The canvas drawing lives in
 * components/ui/confetti.ts.
 */

export interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Rotation in radians and its speed per frame. */
  angle: number;
  spin: number;
  /** Phase of the paper "flip" (drawn as a squashed width). */
  tilt: number;
  width: number;
  height: number;
  color: string;
}

/** Brand blue first, then cheerful accents. */
export const CONFETTI_COLORS = [
  "#0b76ba",
  "#38bdf8",
  "#22c55e",
  "#facc15",
  "#f97316",
  "#ec4899",
];

const GRAVITY = 0.25;
const DRAG = 0.985;

/**
 * Two bursts from the lower left and lower right corners of a `width` x
 * `height` viewport, shooting up and towards the middle.
 */
export function createConfetti(
  width: number,
  height: number,
  count: number,
  random: () => number = Math.random,
): ConfettiPiece[] {
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < count; i++) {
    const fromLeft = i % 2 === 0;
    // Aim between 50 and 75 degrees above the horizontal, towards the centre.
    const aim = ((50 + random() * 25) * Math.PI) / 180;
    const speed = 12 + random() * 10;
    pieces.push({
      x: fromLeft ? 0 : width,
      y: height,
      vx: Math.cos(aim) * speed * (fromLeft ? 1 : -1),
      vy: -Math.sin(aim) * speed,
      angle: random() * Math.PI * 2,
      spin: (random() - 0.5) * 0.3,
      tilt: random() * Math.PI * 2,
      width: 6 + random() * 6,
      height: 8 + random() * 8,
      color: CONFETTI_COLORS[Math.floor(random() * CONFETTI_COLORS.length)],
    });
  }
  return pieces;
}

/** Advance one piece by one frame (about 16 ms). */
export function stepConfetti(piece: ConfettiPiece): ConfettiPiece {
  const vx = piece.vx * DRAG;
  const vy = piece.vy * DRAG + GRAVITY;
  return {
    ...piece,
    x: piece.x + vx,
    y: piece.y + vy,
    vx,
    vy,
    angle: piece.angle + piece.spin,
    tilt: piece.tilt + 0.1,
  };
}

/** A piece that fell below the viewport no longer needs drawing. */
export function isConfettiGone(piece: ConfettiPiece, height: number): boolean {
  return piece.vy > 0 && piece.y > height + piece.height;
}
