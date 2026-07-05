/**
 * Hand landmark drawing utilities.
 *
 * Custom renderer — avoids depending on @mediapipe/drawing_utils and gives
 * full control over aesthetics (glow effects, color-coded active points).
 */

import type { GestureState } from "./gestures";

// ---------------------------------------------------------------------------
// MediaPipe 21-landmark hand topology
// ---------------------------------------------------------------------------
const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Index
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  // Middle
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  // Ring
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  // Pinky
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  // Palm base
  [0, 17],
];

interface Landmark {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const COLORS: Record<GestureState, string> = {
  DRAW: "#00ff88",
  ERASE: "#ff3b30",
  IDLE: "#71717a",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Draw the hand skeleton, landmarks and an active-point indicator onto a
 * **mirrored** canvas context. The caller must have already applied
 * `ctx.translate(w, 0); ctx.scale(-1, 1)` so the drawing matches the
 * selfie-view video beneath it.
 */
export function drawHand(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number,
  state: GestureState,
  activeX: number, // un-mirrored (raw MediaPipe) X for the active point
  activeY: number,
): void {
  // --- Connections --------------------------------------------------------
  ctx.strokeStyle = "rgba(0, 255, 136, 0.45)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
    ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
    ctx.stroke();
  }

  // --- Landmark dots ------------------------------------------------------
  for (const lm of landmarks) {
    ctx.beginPath();
    ctx.arc(lm.x * w, lm.y * h, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fill();
  }

  // --- Active point glow --------------------------------------------------
  const color = COLORS[state];
  const radius = state === "ERASE" ? 24 : 12;
  const cx = activeX * w;
  const cy = activeY * h;

  // Outer glow
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2);
  grad.addColorStop(0, color + "55");
  grad.addColorStop(1, color + "00");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 2, 0, Math.PI * 2);
  ctx.fill();

  // Inner dot
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color + "88";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
