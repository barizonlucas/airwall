/**
 * TrackerView — core component of the Airwall Tracker.
 *
 * Renders the webcam feed, overlays hand landmarks via MediaPipe Hands,
 * recognises gestures and streams smoothed coordinates over WebSocket.
 *
 * Performance:  All per-frame work (canvas drawing, DOM status updates,
 * WebSocket sends) is done via refs — React never re-renders after mount.
 *
 * Smoothing:  An EMA (Exponential Moving Average) filter removes jitter
 * from the raw MediaPipe coordinates before sending.
 *
 * Delta-send:  Only transmits a WS message when the gesture state changes
 * or the smoothed position moves beyond a configurable threshold.
 */

import { useEffect, useRef } from "react";

import { recognizeGesture, type GestureState } from "../lib/gestures";
import { drawHand } from "../lib/drawHand";
import { EmaFilter, type CoordinateFilter } from "../lib/smoothing";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** WebSocket URL — override via VITE_WS_URL env var. */
const WS_URL = import.meta.env.VITE_WS_URL as string || "ws://localhost:8000/ws/draw";

/**
 * Minimum position delta (in normalised 0–1 coords) before a new
 * WebSocket message is sent.  0.005 ≈ 6px on a 1280-wide frame —
 * small enough for responsive drawing, large enough to absorb jitter.
 */
const MOVE_THRESHOLD = 0.005;

/** EMA smoothing factor (0 < α ≤ 1). Lower = smoother, higher = faster. */
const SMOOTH_ALPHA = 0.35;

/** Requested webcam resolution (16:9). */
const CAM_W = 1280;
const CAM_H = 720;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TrackerView() {
  // DOM refs — no React state, no re-renders.
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const coordsRef = useRef<HTMLSpanElement>(null);
  const wsLabelRef = useRef<HTMLSpanElement>(null);

  // Instance refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Smoothing & delta-send refs
  const smootherRef = useRef<CoordinateFilter>(new EmaFilter(SMOOTH_ALPHA));
  const lastSentRef = useRef({ x: -1, y: -1, state: "" as GestureState | "" });
  const prevStateRef = useRef<GestureState | "">(""  );

  useEffect(() => {
    let camera: Camera | null = null;
    let hands: Hands | null = null;
    let disposed = false;

    // ------------------------------------------------------------------
    // WebSocket (auto-reconnect)
    // ------------------------------------------------------------------
    function connectWs() {
      if (disposed) return;

      try {
        const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          if (wsLabelRef.current) {
            wsLabelRef.current.textContent = "Connected";
            wsLabelRef.current.dataset.status = "connected";
          }
        };

        ws.onclose = () => {
          if (wsLabelRef.current) {
            wsLabelRef.current.textContent = "Reconnecting…";
            wsLabelRef.current.dataset.status = "disconnected";
          }
          if (!disposed) {
            reconnectTimerRef.current = setTimeout(connectWs, 2000);
          }
        };

        ws.onerror = () => ws.close();
        wsRef.current = ws;
      } catch {
        // Server not running — retry silently.
        if (!disposed) {
          reconnectTimerRef.current = setTimeout(connectWs, 2000);
        }
      }
    }

    // ------------------------------------------------------------------
    // MediaPipe results callback (runs every frame)
    // ------------------------------------------------------------------
    function onResults(results: HandsResults) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      // Size the canvas to match the video feed.
      canvas.width = CAM_W;
      canvas.height = CAM_H;

      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CAM_W, CAM_H);

      // Mirror horizontally so it feels like a mirror.
      ctx.translate(CAM_W, 0);
      ctx.scale(-1, 1);

      let state: GestureState = "IDLE";
      let rawX = 0;
      let rawY = 0;

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const lm = results.multiHandLandmarks[0];
        const gesture = recognizeGesture(lm);
        state = gesture.state;
        rawX = gesture.x;
        rawY = gesture.y;

        // Active point in raw (un-mirrored) coords for drawing on the
        // already-mirrored canvas.
        const rawActiveX = state === "ERASE" ? 1 - rawX : lm[8].x;
        const rawActiveY = state === "ERASE" ? rawY : lm[8].y;

        drawHand(ctx, lm, CAM_W, CAM_H, state, rawActiveX, rawActiveY);
      } else {
        // Hand lost — reset smoother so next detection starts fresh.
        smootherRef.current.reset();
      }

      ctx.restore();

      // --- Smoothing ------------------------------------------------------
      // Reset the filter on state transitions because the reference point
      // changes (index tip for DRAW vs. palm center for ERASE).
      if (state !== prevStateRef.current) {
        smootherRef.current.reset();
        prevStateRef.current = state;
      }

      const smoothed = smootherRef.current.update(rawX, rawY);

      // --- Direct DOM updates (zero React re-renders) -------------------
      if (dotRef.current) dotRef.current.dataset.state = state.toLowerCase();
      if (labelRef.current) labelRef.current.textContent = state;
      if (coordsRef.current) {
        coordsRef.current.textContent = `(${smoothed.x.toFixed(3)}, ${smoothed.y.toFixed(3)})`;
      }

      // --- Delta-based WebSocket send ------------------------------------
      // Only send when: (a) gesture state changed, or
      //                 (b) position moved beyond threshold (DRAW/ERASE).
      const last = lastSentRef.current;
      const stateChanged = state !== last.state;
      const dx = Math.abs(smoothed.x - last.x);
      const dy = Math.abs(smoothed.y - last.y);
      const movedEnough = dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD;
      const shouldSend = stateChanged || (state !== "IDLE" && movedEnough);

      if (shouldSend && wsRef.current?.readyState === WebSocket.OPEN) {
        const sx = +smoothed.x.toFixed(4);
        const sy = +smoothed.y.toFixed(4);
        wsRef.current.send(JSON.stringify({ x: sx, y: sy, state }));
        lastSentRef.current = { x: sx, y: sy, state };
      }
    }

    // ------------------------------------------------------------------
    // Initialisation
    // ------------------------------------------------------------------
    async function init() {
      hands = new Hands({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5,
      });

      hands.onResults(onResults);

      if (videoRef.current) {
        camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && hands) {
              await hands.send({ image: videoRef.current });
            }
          },
          width: CAM_W,
          height: CAM_H,
        });
        await camera.start();
      }
    }

    init();
    connectWs();

    return () => {
      disposed = true;
      camera?.stop();
      hands?.close();
      wsRef.current?.close();
      clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  // ------------------------------------------------------------------
  // Render (runs exactly once)
  // ------------------------------------------------------------------
  return (
    <div className="tracker-container">
      <div className="video-wrapper">
        <video ref={videoRef} className="tracker-video" playsInline />
        <canvas ref={canvasRef} className="tracker-canvas" />

        {/* Loading overlay — hidden after model loads */}
        <div className="video-loading">
          <span className="loading-spinner" />
          <span>Loading MediaPipe model…</span>
        </div>
      </div>

      <div className="status-bar">
        <div className="status-group">
          <span ref={dotRef} className="status-dot" data-state="idle" />
          <span ref={labelRef} className="status-label">
            IDLE
          </span>
        </div>
        <span ref={coordsRef} className="status-coords">
          (0.000, 0.000)
        </span>
        <span ref={wsLabelRef} className="ws-badge" data-status="disconnected">
          Disconnected
        </span>
      </div>
    </div>
  );
}
