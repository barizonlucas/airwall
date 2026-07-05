/**
 * Gesture recognition engine.
 *
 * Uses distance-from-wrist heuristics to classify the current hand pose
 * as DRAW (index only), ERASE (open hand), or IDLE.
 */

export type GestureState = "DRAW" | "ERASE" | "IDLE";

export interface GestureResult {
  state: GestureState;
  /** Normalized X (0 = left, 1 = right — already mirrored for selfie view). */
  x: number;
  /** Normalized Y (0 = top, 1 = bottom). */
  y: number;
}

interface Point {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Average position of the palm (wrist + 4 MCP joints).
 */
function palmCenter(lm: Point[]): { x: number; y: number } {
  const MCP_IDS = [0, 5, 9, 13, 17];
  let sx = 0;
  let sy = 0;
  for (const i of MCP_IDS) {
    sx += lm[i].x;
    sy += lm[i].y;
  }
  return { x: sx / MCP_IDS.length, y: sy / MCP_IDS.length };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a set of 21 hand landmarks into a gesture.
 *
 * Heuristic:
 *   – A finger is "extended" when its tip is farther from the wrist (lm 0)
 *     than 1.6× the wrist→middle-MCP distance (adaptive to hand size).
 *   – DRAW  = only the index finger is extended.
 *   – ERASE = all four fingers are extended (open hand).
 *   – IDLE  = everything else.
 *
 * Coordinates are already mirror-flipped (1 − x) so they match the selfie
 * view the user sees on screen.
 */
export function recognizeGesture(lm: Point[]): GestureResult {
  const wrist = lm[0];
  const scale = dist(wrist, lm[9]); // wrist → middle MCP
  const thresh = scale * 1.6;

  const indexExt = dist(lm[8], wrist) > thresh;
  const middleExt = dist(lm[12], wrist) > thresh;
  const ringExt = dist(lm[16], wrist) > thresh;
  const pinkyExt = dist(lm[20], wrist) > thresh;

  // --- ERASE: all fingers open (check first — it's the superset) ----------
  if (indexExt && middleExt && ringExt && pinkyExt) {
    const c = palmCenter(lm);
    return { state: "ERASE", x: 1 - c.x, y: c.y };
  }

  // --- DRAW: only index extended ------------------------------------------
  if (indexExt && !middleExt && !ringExt && !pinkyExt) {
    return { state: "DRAW", x: 1 - lm[8].x, y: lm[8].y };
  }

  // --- IDLE: anything else ------------------------------------------------
  return { state: "IDLE", x: 1 - lm[8].x, y: lm[8].y };
}
