"use client";

// Renderiza as SVGs do pipeline híbrido (Arrow 1.1) como camadas atrás do
// scene principal. Não interfere com walls/rooms/furniture — apenas mostra
// a vetorização exata como background.
//
// Coordenadas: o SVG do Arrow vem com viewBox em pixels. Encaixamos esse
// retângulo no mundo (em metros) usando um <g transform="translate(...) scale(...)">
// para que ele fique centralizado na origem com as dimensões definidas em
// HybridLayers.worldFit (default 20m × 12m).

import { useMemo } from "react";
import { useHybridStore } from "@/lib/scene/hybrid-store";
import type { HybridLayers } from "@/lib/types";

interface ParsedViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Extrai viewBox + inner content do SVG. Se não conseguir parsear, retorna fallback. */
function parseSvg(svg: string): { viewBox: ParsedViewBox; inner: string } {
  // Match the outermost <svg ...> tag and capture its attributes + content.
  const match = svg.match(/<svg([^>]*)>([\s\S]*)<\/svg>/i);
  if (!match) return { viewBox: { x: 0, y: 0, width: 1024, height: 1024 }, inner: svg };

  const attrs = match[1];
  const inner = match[2];

  // Look for viewBox="x y w h"
  const vbMatch = attrs.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return {
        viewBox: { x: parts[0], y: parts[1], width: parts[2], height: parts[3] },
        inner,
      };
    }
  }

  // Fallback: try width/height attrs.
  const wMatch = attrs.match(/width\s*=\s*"([\d.]+)"/i);
  const hMatch = attrs.match(/height\s*=\s*"([\d.]+)"/i);
  const w = wMatch ? Number(wMatch[1]) : 1024;
  const h = hMatch ? Number(hMatch[1]) : 1024;
  return { viewBox: { x: 0, y: 0, width: w, height: h }, inner };
}

interface Props {
  /** Override de fora — útil quando não está usando o store global. */
  layers?: HybridLayers | null;
}

export function HybridSvgLayer({ layers: layersProp }: Props) {
  const layersFromStore = useHybridStore((s) => s.layers);
  const layers = layersProp !== undefined ? layersProp : layersFromStore;

  const structuralParsed = useMemo(
    () => (layers?.structuralSvg ? parseSvg(layers.structuralSvg) : null),
    [layers?.structuralSvg],
  );
  const furnitureParsed = useMemo(
    () => (layers?.furnitureSvg ? parseSvg(layers.furnitureSvg) : null),
    [layers?.furnitureSvg],
  );

  if (!layers || (!structuralParsed && !furnitureParsed)) return null;

  const fitW = layers.worldFit?.widthMeters ?? 20;
  const fitH = layers.worldFit?.heightMeters ?? 12;

  // Use the structural viewBox as the reference for fitting (or furniture if no structural).
  const refVb = structuralParsed?.viewBox ?? furnitureParsed?.viewBox;
  if (!refVb) return null;

  // Compute uniform scale so refVb fits inside (fitW × fitH).
  const sx = fitW / refVb.width;
  const sy = fitH / refVb.height;
  const scale = Math.min(sx, sy);

  // Center the scaled SVG at the world origin.
  const renderedW = refVb.width * scale;
  const renderedH = refVb.height * scale;
  const tx = -renderedW / 2 - refVb.x * scale;
  const ty = -renderedH / 2 - refVb.y * scale;

  return (
    <g
      className="hybrid-svg-layer"
      transform={`translate(${tx}, ${ty}) scale(${scale})`}
      style={{ pointerEvents: "none" }}
    >
      {structuralParsed && (
        <g
          className="hybrid-structural"
          dangerouslySetInnerHTML={{ __html: structuralParsed.inner }}
        />
      )}
      {furnitureParsed && (
        <g
          className="hybrid-furniture"
          dangerouslySetInnerHTML={{ __html: furnitureParsed.inner }}
        />
      )}
    </g>
  );
}
