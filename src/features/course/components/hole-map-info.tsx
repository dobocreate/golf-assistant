import type { HoleMapPoint } from '@/lib/geo';
import { haversineDistance, effectiveDistance, POINT_KIND_LABELS } from '@/lib/geo';
import { HoleMapCopyButton } from './hole-map-copy-button';

interface HoleMapInfoProps {
  holeId: string;
  holeNumber: number;
  mapPoints: HoleMapPoint[];
}

interface PointDistance {
  point: HoleMapPoint;
  horizontal: number;
  elevDiff: number | null;
  felt: number | null;
}

function buildDistances(refTee: HoleMapPoint, otherPoints: HoleMapPoint[]): PointDistance[] {
  return otherPoints.map((point) => {
    const horizontal = Math.round(haversineDistance(refTee, point));

    let elevDiff: number | null = null;
    let felt: number | null = null;

    if (refTee.elevation_m !== null && point.elevation_m !== null) {
      elevDiff = Math.round(point.elevation_m - refTee.elevation_m);
      felt = Math.round(effectiveDistance(horizontal, elevDiff));
    }

    return { point, horizontal, elevDiff, felt };
  });
}

function formatRow(d: PointDistance): string {
  const kindLabel = POINT_KIND_LABELS[d.point.point_kind] ?? d.point.point_kind;
  const label = d.point.name ? `${kindLabel}（${d.point.name}）` : kindLabel;
  const base = `T→${label}: ${d.horizontal}m`;

  if (d.elevDiff !== null && d.felt !== null && d.elevDiff !== 0) {
    const direction = d.elevDiff > 0 ? '打上' : '打下';
    const sign = d.elevDiff > 0 ? '+' : '';
    return `${base}（${direction} ${sign}${d.elevDiff}m → 体感 ${d.felt}m）`;
  }

  return base;
}

/**
 * Build a compact summary text suitable for pasting into a game plan.
 * Example: "打ち上げ +12m のため体感 362m。左バンカー（160m/185m）を避けて右狙い。右 OB まで 230m。"
 */
function buildSummaryText(distances: PointDistance[]): string {
  const parts: string[] = [];

  const green = distances.find((d) => d.point.point_kind === 'green');
  if (green) {
    if (green.elevDiff !== null && green.felt !== null && green.elevDiff !== 0) {
      const dir = green.elevDiff > 0 ? '打ち上げ' : '打ち下ろし';
      const sign = green.elevDiff > 0 ? '+' : '';
      parts.push(
        `${dir} ${sign}${green.elevDiff}m のため体感 ${green.felt}m`,
      );
    } else {
      parts.push(`グリーンまで ${green.horizontal}m`);
    }
  }

  const bunkers = distances.filter((d) => d.point.point_kind === 'bunker');
  if (bunkers.length > 0) {
    const bunkerDesc = bunkers
      .map((b) => {
        const nameLabel = b.point.name || 'バンカー';
        return `${nameLabel}（${b.horizontal}m${b.felt !== null && b.felt !== b.horizontal ? `/${b.felt}m` : ''}）`;
      })
      .join('・');
    parts.push(`${bunkerDesc}を注意`);
  }

  const obs = distances.filter((d) => d.point.point_kind === 'ob');
  if (obs.length > 0) {
    const obDesc = obs
      .map((o) => {
        const nameLabel = o.point.name || 'OB';
        return `${nameLabel} まで ${o.horizontal}m`;
      })
      .join('・');
    parts.push(obDesc);
  }

  const waters = distances.filter((d) => d.point.point_kind === 'water');
  if (waters.length > 0) {
    const waterDesc = waters
      .map((w) => {
        const nameLabel = w.point.name || '池';
        return `${nameLabel}（${w.horizontal}m）`;
      })
      .join('・');
    parts.push(`${waterDesc}に注意`);
  }

  return parts.join('。') + (parts.length > 0 ? '。' : '');
}

export function HoleMapInfo({ holeId: _holeId, holeNumber: _holeNumber, mapPoints }: HoleMapInfoProps) {
  const refTee = mapPoints.find((p) => p.is_tee_reference);

  if (!refTee || mapPoints.length === 0) return null;

  const otherPoints = mapPoints.filter((p) => p.id !== refTee.id);
  if (otherPoints.length === 0) return null;

  const distances = buildDistances(refTee, otherPoints);
  const summaryText = buildSummaryText(distances);

  return (
    <div className="ml-12 mt-2 space-y-0.5">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">GPS距離</p>
      {distances.map((d) => (
        <p key={d.point.id} className="text-xs text-gray-600 dark:text-gray-300">
          {formatRow(d)}
        </p>
      ))}
      {summaryText && (
        <div className="pt-1">
          <HoleMapCopyButton text={summaryText} />
        </div>
      )}
    </div>
  );
}
