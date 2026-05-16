import type { MapConfig } from "./types";
import { worldToPixel } from "./coords";

/**
 * Renders a density heatmap onto a canvas. Uses additive radial gradients,
 * then re-color-ramps the alpha channel for that classic "heatmap" look.
 *
 * Implementation note: drawing additive gradients into an off-screen single-
 * channel buffer is fastest, but Canvas2D doesn't expose channel-isolated
 * compositing without ImageData. So we paint into an offscreen canvas with
 * white-on-black and then color-ramp via ImageData.
 */
export function renderHeatmap(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>, // [x, z]
  cfg: MapConfig,
  renderSize: number,
  opts: { radius?: number; intensity?: number; colorScale?: ColorRamp } = {},
): void {
  if (points.length === 0) return;
  const radius = opts.radius ?? Math.max(14, renderSize / 60);
  const intensity = opts.intensity ?? 0.65;
  const ramp = opts.colorScale ?? RAMP_HEAT;

  // Off-screen white blob accumulator.
  const off =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(renderSize, renderSize)
      : (() => {
          const c = document.createElement("canvas");
          c.width = renderSize;
          c.height = renderSize;
          return c;
        })();
  const octx = off.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  if (!octx) return;

  octx.globalCompositeOperation = "lighter";
  for (const [x, z] of points) {
    const { px, py } = worldToPixel(x, z, cfg, renderSize);
    const g = octx.createRadialGradient(px, py, 0, px, py, radius);
    g.addColorStop(0, `rgba(255,255,255,${intensity})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    octx.fillStyle = g;
    octx.beginPath();
    octx.arc(px, py, radius, 0, Math.PI * 2);
    octx.fill();
  }

  const img = octx.getImageData(0, 0, renderSize, renderSize);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    // R == G == B (white blobs). Use whichever, treat as density.
    const d = data[i];
    if (d === 0) {
      data[i + 3] = 0;
      continue;
    }
    const t = Math.min(1, d / 255);
    const [r, g, b, a] = ramp(t);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  // Blit back into the main context.
  // putImageData on OffscreenCanvas's ctx and then drawImage(off, ...)
  octx.putImageData(img, 0, 0);
  ctx.drawImage(off as unknown as CanvasImageSource, 0, 0);
}

export type ColorRamp = (t: number) => [number, number, number, number];

// classic heatmap (blue → green → yellow → red)
export const RAMP_HEAT: ColorRamp = (t) => {
  // piecewise lerp through stops
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [10, 20, 90]],
    [0.25, [30, 180, 220]],
    [0.5, [80, 220, 80]],
    [0.75, [255, 200, 60]],
    [1.0, [255, 60, 60]],
  ];
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
        Math.round(170 + 70 * t),
      ];
    }
  }
  return [255, 60, 60, 240];
};

export const RAMP_KILL: ColorRamp = (t) => [
  Math.round(255 * (0.6 + 0.4 * t)),
  Math.round(30 + 60 * (1 - t)),
  Math.round(40 + 30 * (1 - t)),
  Math.round(150 + 90 * t),
];

export const RAMP_LOOT: ColorRamp = (t) => [
  Math.round(20 + 60 * (1 - t)),
  Math.round(180 + 60 * t),
  Math.round(200 + 50 * t),
  Math.round(140 + 100 * t),
];

export const RAMP_STORM: ColorRamp = (t) => [
  Math.round(200 + 55 * t),
  Math.round(60 + 30 * (1 - t)),
  Math.round(170 + 60 * t),
  Math.round(160 + 90 * t),
];
