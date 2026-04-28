// Editorial palette + texture helpers for the canvas renderer.

import * as THREE from "three";

export const PALETTE = {
  paper: "#F4EFE6",
  bg: "#FAF7F0",
  ink: "#1F1B16",
  inkSoft: "#4A4338",
  muted: "#8C8478",
  line: "#E6DFD2",
  accent: "#B8552E",
  accentSoft: "#F2DDD0",
  wallFill: "#E6DFD2",
  wallEdge: "#1F1B16",
  floorWood: "#EFE8DB",
  floorWoodLine: "#1F1B16",
  floorTile: "#EEE6D6",
  floorCarpet: "#E8DDC8",
  floorPedra: "#D6CBB6",
  floorMarmore: "#F0EAE0",
  floorGrama: "#C7D6B5",
  floorDeck: "#C9B89C",
  selectionStroke: "#B8552E",
  hoverStroke: "#D78457",
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** Rough mapping from material id (lib/types FloorMaterial) → fill color. */
export function floorColor(material: string): string {
  switch (material) {
    case "madeira": return PALETTE.floorWood;
    case "porcelanato": case "ceramica": return PALETTE.floorTile;
    case "carpete": return PALETTE.floorCarpet;
    case "pedra": return PALETTE.floorPedra;
    case "marmore": return PALETTE.floorMarmore;
    case "grama": return PALETTE.floorGrama;
    case "deck": return PALETTE.floorDeck;
    case "cimento": return "#D6CFC1";
    default: return PALETTE.floorWood;
  }
}

/** Generate a small CanvasTexture for repeating floor patterns. */
function makePatternCanvas(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, s: number) => void
): HTMLCanvasElement {
  const c = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!c) {
    return null as unknown as HTMLCanvasElement; // SSR fallback (not rendered)
  }
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  return c;
}

const _textureCache = new Map<string, THREE.Texture>();

export function woodgrainTexture(): THREE.Texture {
  const key = "woodgrain";
  if (_textureCache.has(key)) return _textureCache.get(key)!;
  const canvas = makePatternCanvas(80, (ctx, s) => {
    ctx.fillStyle = PALETTE.floorWood;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = PALETTE.ink;
    ctx.globalAlpha = 0.06;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.stroke();
    ctx.globalAlpha = 0.04;
    ctx.beginPath();
    ctx.moveTo(0, s / 4);
    ctx.lineTo(s, s / 4);
    ctx.moveTo(0, (3 * s) / 4);
    ctx.lineTo(s, (3 * s) / 4);
    ctx.stroke();
  });
  if (!canvas) return new THREE.Texture();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  // Each tile = 0.8m of plank. Caller should set repeat.
  _textureCache.set(key, tex);
  return tex;
}

export function tileTexture(): THREE.Texture {
  const key = "tile";
  if (_textureCache.has(key)) return _textureCache.get(key)!;
  const canvas = makePatternCanvas(64, (ctx, s) => {
    ctx.fillStyle = PALETTE.floorTile;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = PALETTE.ink;
    ctx.globalAlpha = 0.07;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
  });
  if (!canvas) return new THREE.Texture();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _textureCache.set(key, tex);
  return tex;
}

export function carpetTexture(): THREE.Texture {
  const key = "carpet";
  if (_textureCache.has(key)) return _textureCache.get(key)!;
  const canvas = makePatternCanvas(48, (ctx, s) => {
    ctx.fillStyle = PALETTE.floorCarpet;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = PALETTE.ink;
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 16; i++) {
      const x = ((i * 7) % s) + 1.5;
      const y = ((i * 11) % s) + 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  if (!canvas) return new THREE.Texture();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  _textureCache.set(key, tex);
  return tex;
}

/** Grams-per-meter scale: each texture tile covers `tileM` meters of floor. */
export function floorTextureFor(material: string): { tex: THREE.Texture | null; tileM: number; color: string } {
  const color = floorColor(material);
  switch (material) {
    case "madeira":
      return { tex: woodgrainTexture(), tileM: 0.8, color };
    case "porcelanato":
    case "ceramica":
      return { tex: tileTexture(), tileM: 0.6, color };
    case "carpete":
      return { tex: carpetTexture(), tileM: 0.3, color };
    default:
      return { tex: null, tileM: 1, color };
  }
}
