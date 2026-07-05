/**
 * ProjectorView — fullscreen drawing surface for the Airwall projector.
 *
 * Connects to the WebSocket as a passive listener and renders incoming
 * drawing events on a fullscreen HTML5 canvas:
 *
 *   • DRAW  → laser-style continuous line (white core + neon glow)
 *   • ERASE → "chalkboard eraser" via destination-out compositing
 *   • IDLE  → breaks the current stroke / eraser path
 *
 * All rendering is done via refs — React renders exactly once.
 */

import { useEffect, useRef } from "react";
import type { GestureState } from "../lib/gestures";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WS_URL =
  (import.meta.env.VITE_WS_URL as string) || "ws://localhost:8000/ws/draw";

/** Laser core width (px). */
const LASER_WIDTH = 3;

/** Neon glow colour (cyan). */
const LASER_GLOW = "#00e5ff";

/** Shadow blur radius for the outer glow pass. */
const GLOW_RADIUS = 18;

/** Eraser circle radius (px). */
const ERASER_RADIUS = 32;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DrawPayload {
  x: number;
  y: number;
  state: GestureState;
}

interface PrevPoint {
  x: number;
  y: number;
  state: GestureState;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProjectorView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevRef = useRef<PrevPoint | null>(null);
  const wsStatusRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    // ------------------------------------------------------------------
    // Canvas sizing
    // ------------------------------------------------------------------
    function sizeCanvas() {
      // Preserve existing drawing across resize.
      const prev = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.putImageData(prev, 0, 0);
    }

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    window.addEventListener("resize", sizeCanvas);

    // ------------------------------------------------------------------
    // Drawing helpers
    // ------------------------------------------------------------------

    /**
     * Draw a laser segment between two points.
     * Three passes: outer glow → mid glow → white core.
     */
    function drawLaser(
      x0: number,
      y0: number,
      x1: number,
      y1: number,
    ): void {
      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);

      // Pass 1 — wide outer glow
      ctx.shadowColor = LASER_GLOW;
      ctx.shadowBlur = GLOW_RADIUS;
      ctx.strokeStyle = LASER_GLOW + "33"; // 20 % opacity
      ctx.lineWidth = LASER_WIDTH + 8;
      ctx.stroke();

      // Pass 2 — tighter mid glow
      ctx.shadowBlur = GLOW_RADIUS / 2;
      ctx.strokeStyle = LASER_GLOW + "88"; // 53 % opacity
      ctx.lineWidth = LASER_WIDTH + 3;
      ctx.stroke();

      // Pass 3 — solid white core
      ctx.shadowBlur = 4;
      ctx.shadowColor = "#ffffff";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = LASER_WIDTH;
      ctx.stroke();

      // Reset shadow state so it doesn't bleed into subsequent draws.
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    }

    /**
     * Erase a circular area (and optionally the path between two points
     * to avoid gaps when the hand moves fast).
     */
    function eraseAt(
      px: number,
      py: number,
      prevX?: number,
      prevY?: number,
    ): void {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";

      // Connect to previous position so fast movement doesn't leave gaps.
      if (prevX !== undefined && prevY !== undefined) {
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(px, py);
        ctx.lineWidth = ERASER_RADIUS * 2;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // Circle at current position.
      ctx.beginPath();
      ctx.arc(px, py, ERASER_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore(); // restores globalCompositeOperation
    }

    // ------------------------------------------------------------------
    // Message handler
    // ------------------------------------------------------------------
    function handleMessage(data: DrawPayload): void {
      const px = data.x * canvas.width;
      const py = data.y * canvas.height;
      const prev = prevRef.current;

      switch (data.state) {
        case "DRAW":
          if (prev?.state === "DRAW") {
            drawLaser(prev.x, prev.y, px, py);
          }
          prevRef.current = { x: px, y: py, state: "DRAW" };
          break;

        case "ERASE":
          if (prev?.state === "ERASE") {
            eraseAt(px, py, prev.x, prev.y);
          } else {
            eraseAt(px, py);
          }
          prevRef.current = { x: px, y: py, state: "ERASE" };
          break;

        default:
          // IDLE — break the current path so the next DRAW/ERASE starts fresh.
          prevRef.current = null;
          break;
      }
    }

    // ------------------------------------------------------------------
    // WebSocket (auto-reconnect)
    // ------------------------------------------------------------------
    function connect(): void {
      if (disposed) return;

      try {
        const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          if (wsStatusRef.current) {
            wsStatusRef.current.dataset.status = "connected";
          }
        };

        ws.onmessage = (event: MessageEvent) => {
          try {
            handleMessage(JSON.parse(event.data) as DrawPayload);
          } catch {
            // Malformed message — ignore.
          }
        };

        ws.onclose = () => {
          if (wsStatusRef.current) {
            wsStatusRef.current.dataset.status = "disconnected";
          }
          if (!disposed) {
            reconnectTimer = setTimeout(connect, 2000);
          }
        };

        ws.onerror = () => ws.close();
      } catch {
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      }
    }

    connect();

    // ------------------------------------------------------------------
    // Cleanup
    // ------------------------------------------------------------------
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      window.removeEventListener("resize", sizeCanvas);
    };
  }, []);

  // ------------------------------------------------------------------
  // Render (runs exactly once)
  // ------------------------------------------------------------------
  return (
    <div className="projector-container">
      <canvas ref={canvasRef} className="projector-canvas" />
      <span
        ref={wsStatusRef}
        className="projector-status"
        data-status="disconnected"
      />
    </div>
  );
}
