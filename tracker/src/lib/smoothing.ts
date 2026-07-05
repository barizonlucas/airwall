/**
 * Coordinate smoothing filters for hand-tracking jitter reduction.
 *
 * Two strategies are available:
 *
 *   • **EMA** (Exponential Moving Average) — low-latency, configurable via
 *     `alpha`. Closer to 1.0 = more responsive, closer to 0.0 = smoother.
 *
 *   • **SMA** (Simple Moving Average) — fixed-window average over the last
 *     N samples. Better at absorbing spikes, slightly higher latency.
 *
 * Both implement the same `CoordinateFilter` interface so they can be
 * swapped freely.
 */

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SmoothedPoint {
  x: number;
  y: number;
}

export interface CoordinateFilter {
  /** Feed a new raw sample and get the smoothed result. */
  update(rawX: number, rawY: number): SmoothedPoint;
  /** Clear internal state (call on hand lost or gesture change). */
  reset(): void;
}

// ---------------------------------------------------------------------------
// EMA — Exponential Moving Average (a.k.a. LERP filter)
// ---------------------------------------------------------------------------

/**
 * Single-pole low-pass filter:  `out = out + α × (raw − out)`
 *
 * @param alpha  Smoothing factor (0 < α ≤ 1).
 *               0.35 is a good default for hand tracking at 30 fps.
 */
export class EmaFilter implements CoordinateFilter {
  private sx = 0;
  private sy = 0;
  private warm = false;

  constructor(private readonly alpha: number = 0.35) {}

  update(rawX: number, rawY: number): SmoothedPoint {
    if (!this.warm) {
      this.sx = rawX;
      this.sy = rawY;
      this.warm = true;
    } else {
      this.sx += this.alpha * (rawX - this.sx);
      this.sy += this.alpha * (rawY - this.sy);
    }
    return { x: this.sx, y: this.sy };
  }

  reset(): void {
    this.warm = false;
  }
}

// ---------------------------------------------------------------------------
// SMA — Simple Moving Average (circular buffer)
// ---------------------------------------------------------------------------

/**
 * Averages the last `windowSize` samples.  Uses a pre-allocated
 * `Float64Array` ring buffer — zero allocations per frame.
 *
 * @param windowSize  Number of samples to average (default 5).
 */
export class SmaFilter implements CoordinateFilter {
  private readonly bufX: Float64Array;
  private readonly bufY: Float64Array;
  private idx = 0;
  private count = 0;

  constructor(private readonly windowSize: number = 5) {
    this.bufX = new Float64Array(windowSize);
    this.bufY = new Float64Array(windowSize);
  }

  update(rawX: number, rawY: number): SmoothedPoint {
    this.bufX[this.idx] = rawX;
    this.bufY[this.idx] = rawY;
    this.idx = (this.idx + 1) % this.windowSize;
    this.count = Math.min(this.count + 1, this.windowSize);

    let sx = 0;
    let sy = 0;
    for (let i = 0; i < this.count; i++) {
      sx += this.bufX[i];
      sy += this.bufY[i];
    }

    return { x: sx / this.count, y: sy / this.count };
  }

  reset(): void {
    this.bufX.fill(0);
    this.bufY.fill(0);
    this.idx = 0;
    this.count = 0;
  }
}
