/**
 * Records frame rate, frame time and (where the browser reports it) memory while the Performance
 * panel is open (§16.7).
 *
 * Nothing runs until {@link startPerformance}: one `requestAnimationFrame` callback that only adds
 * a number, and a summary every {@link BUCKET_MS} ms that listeners use to redraw. The panel draws
 * at that rate, not every frame, so watching costs the game almost nothing.
 */

export const BUCKET_MS = 250;
/** One minute of history at four samples a second. */
export const HISTORY = 240;

export interface PerformanceSample {
  time: number;
  /** Frames per second over the bucket. */
  fps: number;
  /** The slowest frame in the bucket, in milliseconds. */
  worstFrame: number;
  /** Used JS heap in MB, where the browser reports it (Chromium). */
  memory?: number;
}

const samples: PerformanceSample[] = [];
const listeners = new Set<() => void>();
let frame = 0;
let running = false;
let last = 0;
let bucketStart = 0;
let frames = 0;
let worst = 0;
let startedAt = 0;

function tick(now: number) {
  if (!running) return;
  if (last) {
    const delta = now - last;
    frames++;
    if (delta > worst) worst = delta;
  }
  last = now;
  if (now - bucketStart >= BUCKET_MS) {
    const span = now - bucketStart;
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    samples.push({
      time: Date.now(),
      fps: span > 0 ? (frames * 1000) / span : 0,
      worstFrame: worst,
      memory: memory ? memory.usedJSHeapSize / 1048576 : undefined,
    });
    if (samples.length > HISTORY) samples.shift();
    bucketStart = now; frames = 0; worst = 0;
    for (const listener of listeners) listener();
  }
  frame = requestAnimationFrame(tick);
}

export function startPerformance() {
  if (running || typeof requestAnimationFrame === 'undefined') return;
  running = true; last = 0; frames = 0; worst = 0; samples.length = 0;
  bucketStart = startedAt = performance.now();
  frame = requestAnimationFrame(tick);
}

export function stopPerformance() {
  running = false;
  cancelAnimationFrame(frame);
}

export function performanceSamples(): readonly PerformanceSample[] { return samples; }

export function onPerformanceSample(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** A plain-text summary of the recording, for Copy and comments. */
export function performanceSummary(): string {
  if (!samples.length) return 'No performance recorded yet.';
  const fps = samples.map(sample => sample.fps).sort((a, b) => a - b);
  const average = fps.reduce((sum, value) => sum + value, 0) / fps.length;
  const low = fps[Math.floor(fps.length * 0.01)] ?? fps[0];
  const worst = Math.max(...samples.map(sample => sample.worstFrame));
  const memory = samples.map(sample => sample.memory).filter((value): value is number => value !== undefined);
  const seconds = Math.round((performance.now() - startedAt) / 1000);
  const lines = [
    `[performance] ${seconds}s recorded, ${typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : ''}`,
    `[performance] average ${average.toFixed(1)} fps, lowest 1% ${low.toFixed(1)} fps, slowest frame ${worst.toFixed(1)} ms`,
  ];
  if (memory.length) lines.push(`[performance] JS memory ${Math.min(...memory).toFixed(0)}-${Math.max(...memory).toFixed(0)} MB`);
  return lines.join('\n');
}
