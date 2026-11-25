"use client";

import { createConfetti, isConfettiGone, stepConfetti } from "@/lib/confetti";

/**
 * Fire a short confetti burst over the whole page, on a temporary canvas that
 * ignores the pointer and removes itself when the last piece has fallen.
 * Does nothing for users who prefer reduced motion. Returns a function that
 * stops the burst early (e.g. when the component unmounts).
 */
export function fireConfetti(count = 160): () => void {
  if (typeof window === "undefined") return () => {};
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: "none",
    zIndex: "60",
  });
  document.body.appendChild(canvas);
  ctx.scale(dpr, dpr);

  let pieces = createConfetti(width, height, count);
  let frame = 0;

  const stop = () => {
    cancelAnimationFrame(frame);
    canvas.remove();
  };

  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    pieces = pieces.map(stepConfetti).filter((p) => !isConfettiGone(p, height));
    for (const p of pieces) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      // Squash the width with the tilt so the paper looks like it flips.
      ctx.scale(Math.cos(p.tilt), 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
      ctx.restore();
    }
    if (pieces.length === 0) stop();
    else frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);

  return stop;
}
