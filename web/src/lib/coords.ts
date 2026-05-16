import type { MapConfig } from "./types";

/** World (x, z) → pixel (px, py) inside the 1024x1024 minimap.
 *  Implements the formula from the dataset README:
 *    u = (x - originX) / scale
 *    v = (z - originZ) / scale
 *    px = u * size
 *    py = (1 - v) * size      // y is flipped — image origin is top-left
 *
 *  We then rescale to the rendered canvas size.
 */
export function worldToPixel(
  x: number,
  z: number,
  cfg: MapConfig,
  renderSize: number,
): { px: number; py: number } {
  const u = (x - cfg.originX) / cfg.scale;
  const v = (z - cfg.originZ) / cfg.scale;
  return {
    px: u * renderSize,
    py: (1 - v) * renderSize,
  };
}

/** Reverse: pixel → world. Handy for tooltips / debugging. */
export function pixelToWorld(
  px: number,
  py: number,
  cfg: MapConfig,
  renderSize: number,
): { x: number; z: number } {
  const u = px / renderSize;
  const v = 1 - py / renderSize;
  return {
    x: u * cfg.scale + cfg.originX,
    z: v * cfg.scale + cfg.originZ,
  };
}
