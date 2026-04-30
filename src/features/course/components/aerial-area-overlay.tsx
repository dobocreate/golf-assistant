'use client';

import type { HoleArea, HoleAreaType, AerialImageMetadata } from '@/lib/geo';
import { latLngToPixel } from '@/lib/geo';

const AREA_STYLES: Record<HoleAreaType, { stroke: string; fill: string; strokeWidth: number }> = {
  ob_line: { stroke: '#ef4444', fill: 'none', strokeWidth: 2 },
  bunker: { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.3)', strokeWidth: 1.5 },
  hazard: { stroke: '#f97316', fill: 'rgba(249,115,22,0.25)', strokeWidth: 1.5 },
  green_a: { stroke: '#22c55e', fill: 'rgba(34,197,94,0.25)', strokeWidth: 1.5 },
  green_b: { stroke: '#06b6d4', fill: 'rgba(6,182,212,0.25)', strokeWidth: 1.5 },
};

interface Props {
  areas: HoleArea[];
  metadata: AerialImageMetadata;
}

export function AerialAreaOverlay({ areas, metadata }: Props) {
  const finalWidth = metadata.final_width ?? metadata.rotated_width;
  const finalHeight = metadata.final_height ?? metadata.rotated_height;

  if (finalWidth <= 0 || finalHeight <= 0) return null;

  return (
    <svg
      viewBox={`0 0 ${finalWidth} ${finalHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    >
      {areas.map((area) => {
        const style = AREA_STYLES[area.area_type];
        const pixels = area.coordinates
          .map((c) => latLngToPixel(c.lat, c.lng, metadata))
          .filter((p): p is { px: number; py: number } => p !== null && isFinite(p.px) && isFinite(p.py));

        if (area.area_type === 'ob_line') {
          if (pixels.length < 2) return null;
          const points = pixels.map((p) => `${p.px},${p.py}`).join(' ');
          return (
            <polyline
              key={area.id}
              points={points}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              fill="none"
              strokeDasharray="4 3"
            />
          );
        }

        if (pixels.length < 3) return null;
        const points = pixels.map((p) => `${p.px},${p.py}`).join(' ');
        return (
          <polygon
            key={area.id}
            points={points}
            stroke={style.stroke}
            strokeWidth={style.strokeWidth}
            fill={style.fill}
          />
        );
      })}
    </svg>
  );
}
