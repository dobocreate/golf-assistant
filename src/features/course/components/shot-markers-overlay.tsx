'use client';

import type { AerialImageMetadata } from '@/lib/geo';
import { latLngToPixel } from '@/lib/geo';
import type { Shot } from '@/features/score/types';

interface Props {
  shots: Shot[];
  metadata: AerialImageMetadata;
}

/**
 * 衛星画像上に過去のショット位置を SVG マーカーで表示する読み取り専用コンポーネント
 *
 * Sprint 5 PR4 (S-3b) — `getShotsWithGpsByHoleForCourse` で取得したショット群を
 * `latLngToPixel` で画像座標に変換して描画。
 *
 * - latitude/longitude が NULL のショットは表示しない（呼び出し元でフィルタ済み前提）
 * - gps_source ごとに見た目を変える: gps=実線、manual_edit=実線+マーク、manual_pin=破線
 * - 同じラウンドのショットは線で接続（時系列の打順）
 * - PR4 では編集機能なし（ドラッグ等は PR5/PR6）
 */
export function ShotMarkersOverlay({ shots, metadata }: Props) {
  const finalWidth = metadata.final_width ?? metadata.rotated_width;
  const finalHeight = metadata.final_height ?? metadata.rotated_height;

  if (finalWidth <= 0 || finalHeight <= 0) return null;
  if (shots.length === 0) return null;

  // round_id ごとにショットをグループ化（軌跡として線で結ぶため）
  const byRound = new Map<string, Shot[]>();
  for (const s of shots) {
    if (!byRound.has(s.round_id)) byRound.set(s.round_id, []);
    byRound.get(s.round_id)!.push(s);
  }

  return (
    <svg
      viewBox={`0 0 ${finalWidth} ${finalHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-label="ショット位置"
    >
      {/*
        TODO(PR5+): 同一座標（or 数 px 以内）に複数ラウンドのショットが重なるケース
        （ティーグラウンドなど）でクラスタ表示する。現状は最後に描画されたものが
        手前に出るだけで、下層のショット番号が読めなくなる。
      */}
      {Array.from(byRound.entries()).map(([roundId, roundShots]) => {
        const points = roundShots
          .map((s) => {
            if (s.latitude == null || s.longitude == null) return null;
            const px = latLngToPixel(s.latitude, s.longitude, metadata);
            if (!px || !isFinite(px.px) || !isFinite(px.py)) return null;
            return { ...px, shot: s };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null);

        if (points.length === 0) return null;

        // ラウンド内のショット順を結ぶ折れ線（軌跡）
        const polylinePoints = points.map((p) => `${p.px},${p.py}`).join(' ');

        return (
          <g key={roundId}>
            {points.length > 1 && (
              <polyline
                points={polylinePoints}
                stroke="#10b981"
                strokeWidth={1.5}
                fill="none"
                strokeOpacity={0.6}
                strokeDasharray="4 2"
              />
            )}
            {points.map((p) => {
              const isManualPin = p.shot.gps_source === 'manual_pin';
              const isEdited = p.shot.gps_source === 'manual_edit';
              // 編集済みショット (Sprint 5 PR9 / S-6d): 元 GPS 位置をゴーストマーカーで表示
              // original_lat/lng が現在位置と異なれば破線で結ぶ
              // 距離が小さすぎる場合 (≤ 6px) は重なって視覚情報がノイズになるため非表示
              const originalPixel =
                p.shot.original_latitude != null && p.shot.original_longitude != null
                  ? latLngToPixel(p.shot.original_latitude, p.shot.original_longitude, metadata)
                  : null;
              const ghostDistancePx = originalPixel
                ? Math.hypot(originalPixel.px - p.px, originalPixel.py - p.py)
                : 0;
              const hasOriginalGhost =
                originalPixel &&
                isFinite(originalPixel.px) &&
                isFinite(originalPixel.py) &&
                ghostDistancePx >= 6;
              return (
                <g key={p.shot.id}>
                  {/*
                    精度円: 視覚目安（実スケールではない）。半径は accuracy[m] * 0.5 を
                    上限 30px でクランプしているだけで、画像の m/px スケールを反映していない。
                    厳密な実スケール表示は PR5+ で metadata から px/m を導出して対応する。
                  */}
                  {p.shot.gps_source === 'gps' && p.shot.gps_accuracy_m != null && (
                    <circle
                      cx={p.px}
                      cy={p.py}
                      r={Math.min(p.shot.gps_accuracy_m * 0.5, 30)}
                      fill="rgba(16,185,129,0.1)"
                      stroke="rgba(16,185,129,0.3)"
                      strokeWidth={0.5}
                    />
                  )}
                  {/* 元 GPS 位置のゴーストマーカー（編集済ショットのみ） */}
                  {hasOriginalGhost && (
                    <g>
                      <title>{`ショット ${p.shot.shot_number} の編集前位置`}</title>
                      <line
                        x1={originalPixel.px}
                        y1={originalPixel.py}
                        x2={p.px}
                        y2={p.py}
                        stroke="rgba(251,191,36,0.5)"
                        strokeWidth={1}
                        strokeDasharray="2 2"
                      />
                      <circle
                        cx={originalPixel.px}
                        cy={originalPixel.py}
                        r={4}
                        fill="rgba(251,191,36,0.3)"
                        stroke="rgba(251,191,36,0.7)"
                        strokeWidth={1}
                        strokeDasharray="2 1"
                      />
                    </g>
                  )}
                  {/* マーカー本体 */}
                  <circle
                    cx={p.px}
                    cy={p.py}
                    r={5}
                    fill="#10b981"
                    stroke={isManualPin ? '#10b981' : '#ffffff'}
                    strokeWidth={1.5}
                    strokeDasharray={isManualPin ? '2 1' : undefined}
                  />
                  {/* ショット番号 */}
                  <text
                    x={p.px}
                    y={p.py + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="7"
                    fontWeight="bold"
                    fill="#ffffff"
                  >
                    {p.shot.shot_number}
                  </text>
                  {/* 編集済みアイコン（鉛筆を簡略化した小ドット） */}
                  {isEdited && (
                    <circle
                      cx={p.px + 4}
                      cy={p.py - 4}
                      r={1.5}
                      fill="#fbbf24"
                    />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
