/**
 * Performance mode detection.
 *
 * Goal: keep the terminal UI at effectively zero perceptible latency even on
 * devices WITHOUT GPU acceleration (old laptops, budget phones, smartboards,
 * VMs without graphics passthrough).
 *
 * Strategy:
 *  1. Static heuristics — low core count / low device memory / reduced-motion
 *     preference immediately enable `perf-lite`.
 *  2. Runtime FPS probe — after the CRT warm-up finishes (~1.6s), sample real
 *     frames. Sustained < 45fps means paint-heavy effects cost more than they
 *     add, so drop them.
 *
 * `perf-lite` disables ONLY paint-expensive layers (scanlines, vignette,
 * inner glass shadows, flicker/warm-up filter animations). Layout, colors and
 * all interaction remain identical.
 *
 * Manual override (survives reloads):
 *   localStorage.setItem('axon_perf', 'lite' | 'full' | 'auto')
 */

const OVERRIDE_KEY = 'axon_perf';

function applyLite() {
  document.documentElement.classList.add('perf-lite');
}

export function initPerfMode(): void {
  const override = localStorage.getItem(OVERRIDE_KEY);
  if (override === 'lite') {
    applyLite();
    return;
  }
  if (override === 'full') {
    return; // user explicitly wants every effect
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const weakCores = (nav.hardwareConcurrency ?? 8) <= 2;
  const lowMemory = (nav.deviceMemory ?? 8) <= 2;

  // No rAF support at all → static render is the only option.
  if (typeof requestAnimationFrame !== 'function') {
    applyLite();
    return;
  }

  if (reducedMotion || weakCores || lowMemory) {
    applyLite();
    return;
  }

  // Runtime probe: wait for the CRT warm-up (1.4s) to finish so we don't
  // measure its intentional filter work, then sample 60 real frames.
  window.setTimeout(() => {
    let frames = 0;
    const start = performance.now();
    const tick = (now: number) => {
      frames++;
      if (frames >= 60) {
        const fps = frames / ((now - start) / 1000);
        // Sustained jank → strip paint-heavy effects permanently.
        if (fps < 45) applyLite();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, 1600);
}
