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
  // If no action is being taken, keep the canvas clean.
  if (state === "IDLE") return;

  // ERASE represents a larger area (chalkboard eraser) -> 1.5x larger than draw (12 * 1.5 = 18).
  const radius = state === "ERASE" ? 18 : 12;
  const cx = activeX * w;
  const cy = activeY * h;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  
  if (state === "ERASE") {
    // Translucent black fill with a solid stroke for the eraser to not block light
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // Solid black fill for drawing
    ctx.fillStyle = "#000000";
    ctx.fill();
  }
}
