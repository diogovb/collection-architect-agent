// Toon gradient ramp generator for MeshToonMaterial.
//
// MeshToonMaterial replaces the smooth Lambert/Phong dot(N, L) lighting curve
// with a *quantised* lookup. The lookup is provided as a 1D texture: the
// horizontal axis is the dot product (0 = facing away, 1 = facing the light)
// and the colour at each position is what the surface paints. Two or three
// stops gives the cel-shaded "flat" look; four+ stops looks like a painted
// gradient.
//
// We supply a tiny CanvasTexture with N pixel stops, one per band. Caller
// usually pairs each material's base colour with the gradient — the colour
// modulates the ramp.

import * as THREE from "three";

const cache = new Map<string, THREE.Texture>();

/** Build (or return cached) gradient ramp texture from `colors`. The first
 *  colour is "shadow", the last is "highlight". Pixel size = colors.length × 1.
 *  Used as `gradientMap` on MeshToonMaterial. */
export function makeToonGradient(colors: string[]): THREE.Texture {
  const key = colors.join("|");
  const cached = cache.get(key);
  if (cached) return cached;

  if (typeof document === "undefined") {
    // SSR safety: return a stub Texture so type contracts hold.
    const tex = new THREE.Texture();
    cache.set(key, tex);
    return tex;
  }

  const canvas = document.createElement("canvas");
  canvas.width = colors.length;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const tex = new THREE.Texture();
    cache.set(key, tex);
    return tex;
  }
  for (let i = 0; i < colors.length; i++) {
    ctx.fillStyle = colors[i];
    ctx.fillRect(i, 0, 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  // Crucial for the "stepped" look — disable filtering so the bands are
  // hard, not blended.
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** Standard 3-stop ramp suitable for our editorial palette: shadow / mid /
 *  highlight. Colours are dim enough not to wash out the base material. */
export const TOON_RAMP_3 = ["#7B7569", "#BFB6A4", "#F4EFE6"];
/** 2-stop ramp = pure cel (one shadow band, one highlight band). */
export const TOON_RAMP_2 = ["#9F968A", "#F4EFE6"];
