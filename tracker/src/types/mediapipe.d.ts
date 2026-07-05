/**
 * Type declarations for MediaPipe globals.
 *
 * These packages are loaded via <script> tags in index.html and register
 * their classes on `window`. We declare them here for TypeScript.
 */

// ---- Hands --------------------------------------------------------------

interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

interface HandsResults {
  multiHandLandmarks: NormalizedLandmark[][];
  multiHandWorldLandmarks: NormalizedLandmark[][];
  multiHandedness: { label: string; score: number }[];
  image: HTMLCanvasElement;
}

interface HandsConfig {
  locateFile?: (file: string) => string;
}

interface HandsOptions {
  selfieMode?: boolean;
  maxNumHands?: number;
  modelComplexity?: 0 | 1;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

declare class Hands {
  constructor(config?: HandsConfig);
  setOptions(options: HandsOptions): void;
  onResults(callback: (results: HandsResults) => void): void;
  send(inputs: { image: HTMLVideoElement | HTMLCanvasElement }): Promise<void>;
  close(): Promise<void>;
  reset(): void;
  initialize(): Promise<void>;
}

declare const HAND_CONNECTIONS: [number, number][];

// ---- Camera -------------------------------------------------------------

interface CameraOptions {
  onFrame: () => Promise<void>;
  width?: number;
  height?: number;
  facingMode?: string;
}

declare class Camera {
  constructor(videoElement: HTMLVideoElement, options: CameraOptions);
  start(): Promise<void>;
  stop(): void;
}
