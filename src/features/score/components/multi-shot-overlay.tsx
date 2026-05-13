'use client';

import type { AerialImageMetadata } from '@/lib/geo';
import { latLngToPixel } from '@/lib/geo';
import type { Shot } from '@/features/score/types';
import { shotKey, type DraftPosition } from '@/features/score/hooks/use-multi-shot-edit';

interface Props {
  shots: Shot[];
  metadata: AerialImageMetadata;
  /** Sprint 6 PR1: 編集モード切替
   *  - 'readonly': pointer-events-none、マーカータップ無効
   *  - 'list': 全マーカー pointer-events-auto、タップで選択可能
   *  - 'selected': 選択中マーカーのみハイライト + ドラッグ用 hit area、非選択は dim + 無効
   */
  mode: 'readonly' | 'list' | 'selected';
  /** 編集中の draft 位置 Map (shotId → DraftPosition)。draft があれば描画位置・線をそちらに置換 */
  drafts?: Map<string, DraftPosition>;
  /** 選択中の shotId。mode='selected' のときに使う */
  selectedShotId?: string | null;
  /** マーカータップ。mode='list'/'selected' で発火。shotId は shotKey(shot) (未保存ショットは合成キー) */
  onShotPointerDown?: (shotId: string, e: React.PointerEvent<SVGElement>) => void;
}

/**
 * 軌跡描画 + マルチショット位置編集対応 Overlay
 *
 * Sprint 6 PR1 (S-6e/F-1) — 既存 ShotMarkersOverlay (read-only / 複数ラウンド対応) とは別系統で
 * 単一ラウンド + 編集モード対応の Overlay を新設。
 *
 * 設計参照: `_bmad-output/planning-artifacts/sprint6-multi-shot-position-editor.md`
 *   Section 1.3 / 2.2 / 3.3
 *
 * **視覚契約 (Codex C1 対応)**:
 * - 確定区間 (drafts に含まれない区間) → emerald 破線 (1.5px)
 * - draft 区間 (前後マーカーが draft 起点) → **amber 実線 (2.5px)** で「未確定」を強調
 * - ヒントバー文言は親で出す (このコンポーネントは描画のみ)
 *
 * **マーカー仕様**:
 * - 視覚: r=12 (mode='list'/'selected') / r=5 (mode='readonly')
 * - hit area: mode='list'/'selected' のみ r=20 の透明 circle を重ねて pointer events を拾う
 *   (Codex m5 対応 / readonly では拡張なし、視覚マーカーと同寸)
 * - 選択中 (mode='selected' && shotId === selectedShotId): amber-500 + glow
 * - 非選択ディム (mode='selected' && shotId !== selectedShotId): opacity 0.5 + pointer-events-none
 * - draft あり: 「未確定」表示として小さい amber dot を上に重ねる
 */
export function MultiShotOverlay({
  shots,
  metadata,
  mode,
  drafts,
  selectedShotId,
  onShotPointerDown,
}: Props) {
  const finalWidth = metadata.final_width ?? metadata.rotated_width;
  const finalHeight = metadata.final_height ?? metadata.rotated_height;

  if (finalWidth <= 0 || finalHeight <= 0) return null;
  if (shots.length === 0) return null;

  // shot_number 順に並べる (打順) → polyline の繋ぎ順を保証
  const ordered = [...shots].sort((a, b) => a.shot_number - b.shot_number);

  // 描画用 points 配列。draft があれば draft 位置で置換 (lat/lng のみ)
  type Point = {
    px: number;
    py: number;
    shot: Shot;
    isDraft: boolean;
  };
  const points: Point[] = [];
  for (const s of ordered) {
    // 未保存ショット (id === '') の draft も正しく取得するため shotKey(s) で照合 (C2 対応)
    const draft = drafts?.get(shotKey(s));
    const lat = draft ? draft.lat : s.latitude;
    const lng = draft ? draft.lng : s.longitude;
    if (lat == null || lng == null) continue;
    const px = latLngToPixel(lat, lng, metadata);
    if (!px || !isFinite(px.px) || !isFinite(px.py)) continue;
    points.push({ px: px.px, py: px.py, shot: s, isDraft: !!draft });
  }
  if (points.length === 0) return null;

  // polyline 描画: 各セグメントを「draft を含むか」で色分け
  // segment[i] = points[i] → points[i+1]、両端 isDraft のいずれかが true なら draft 区間
  const segments: Array<{ from: Point; to: Point; isDraft: boolean }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    segments.push({ from, to, isDraft: from.isDraft || to.isDraft });
  }

  const markerVisualR = mode === 'readonly' ? 5 : 12;
  const markerHitR = mode === 'readonly' ? 5 : 20; // hit area 拡張 (Codex m5)
  const markerFontSize = mode === 'readonly' ? 7 : 11;

  const interactive = mode === 'list' || mode === 'selected';
  const showHitArea = interactive && !!onShotPointerDown;
  const ariaLabel = mode === 'readonly' ? 'ショット位置 (読み取り専用)' : 'ショット位置編集';

  return (
    <svg
      viewBox={`0 0 ${finalWidth} ${finalHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className={`absolute inset-0 w-full h-full ${interactive ? '' : 'pointer-events-none'}`}
      aria-label={ariaLabel}
    >
      {/* 接続ライン: 確定 emerald 破線、draft amber 実線太め */}
      {segments.map((seg, idx) => (
        <line
          key={`seg-${idx}`}
          x1={seg.from.px}
          y1={seg.from.py}
          x2={seg.to.px}
          y2={seg.to.py}
          stroke={seg.isDraft ? '#f59e0b' : '#10b981'}
          strokeWidth={seg.isDraft ? 2.5 : 1.5}
          strokeOpacity={seg.isDraft ? 0.9 : 0.6}
          strokeDasharray={seg.isDraft ? undefined : '4 2'}
          pointerEvents="none"
        />
      ))}

      {/* マーカー本体 + hit area */}
      {points.map((p) => {
        // 未保存ショットの id 衝突回避 (PR3 C1 対応): shotKey で一意キー生成
        const pKey = shotKey(p.shot);
        const isSelected = mode === 'selected' && selectedShotId === pKey;
        const isDimmed = mode === 'selected' && selectedShotId !== null && selectedShotId !== pKey;

        // 編集前位置 (ゴーストマーカー) - mode='readonly' でも表示
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

        // Sprint 7 PR2: 自動スロット (auto-trajectory で生成、DB 未保存) の視覚区別
        // - 自動: 白塗り + emerald-600 太破線リング (屋外視認性のため色だけでなく形状差)
        // - DB 保存済み / 手動未保存 (Sprint 6 PR3 form 経由): 既存スタイル
        // useDisplayedShots が付与する isAutoGenerated を優先参照 (Sprint 7 PR2 Gemini Medium 対応)
        // 「id=''」だけだと Sprint 6 PR3 で対応した「手動未保存」も巻き込んでしまうため
        const isAutoGenerated = (p.shot as { isAutoGenerated?: boolean }).isAutoGenerated ?? false;
        const fillColor = isSelected
          ? '#f59e0b'
          : isAutoGenerated
            ? '#ffffff'
            : '#10b981';
        const strokeColor = isSelected
          ? '#fbbf24'
          : isAutoGenerated
            ? '#059669'
            : '#ffffff';
        const strokeDasharray = isAutoGenerated
          ? '4 2' // 自動スロット: 太破線
          : p.shot.gps_source === 'manual_pin' || p.shot.gps_source === 'manual_edit'
            ? '3 2'
            : undefined;
        const strokeWidthFactor = isSelected ? 3 : isAutoGenerated ? 2.5 : 2;
        const numberFill = isAutoGenerated && !isSelected ? '#059669' : '#ffffff';
        const opacity = isDimmed ? 0.5 : 1;

        return (
          <g key={pKey} opacity={opacity}>
            {/* GPS 精度円 */}
            {p.shot.gps_source === 'gps' && p.shot.gps_accuracy_m != null && !p.isDraft && (
              <circle
                cx={p.px}
                cy={p.py}
                r={Math.min(p.shot.gps_accuracy_m * 0.5, 30)}
                fill="rgba(16,185,129,0.1)"
                stroke="rgba(16,185,129,0.3)"
                strokeWidth={0.5}
                pointerEvents="none"
              />
            )}
            {/* ゴーストマーカー (編集前位置) */}
            {hasOriginalGhost && (
              <g pointerEvents="none">
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
            {/* 選択中 glow */}
            {isSelected && (
              <circle
                cx={p.px}
                cy={p.py}
                r={markerVisualR + 6}
                fill="rgba(245,158,11,0.25)"
                pointerEvents="none"
              />
            )}
            {/* マーカー本体 (視覚) */}
            <circle
              cx={p.px}
              cy={p.py}
              r={markerVisualR}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidthFactor}
              strokeDasharray={strokeDasharray}
              pointerEvents="none"
            />
            {/* ショット番号 (自動スロットは白塗り上で番号が見えるよう emerald 文字に) */}
            <text
              x={p.px}
              y={p.py + (mode === 'readonly' ? 1 : 1.5)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={markerFontSize}
              fontWeight="bold"
              fill={numberFill}
              pointerEvents="none"
            >
              {p.shot.shot_number}
            </text>
            {/* draft マーク (右上 amber dot) */}
            {p.isDraft && (
              <circle
                cx={p.px + markerVisualR * 0.7}
                cy={p.py - markerVisualR * 0.7}
                r={3}
                fill="#fbbf24"
                stroke="#92400e"
                strokeWidth={0.5}
                pointerEvents="none"
              />
            )}
            {/* 透明 hit area (Codex m5: pointer events 拾い拡張) */}
            {showHitArea && !isDimmed && (
              <circle
                cx={p.px}
                cy={p.py}
                r={markerHitR}
                fill="transparent"
                style={{ cursor: mode === 'selected' && isSelected ? 'grab' : 'pointer', touchAction: 'none' }}
                onPointerDown={(e) => onShotPointerDown!(pKey, e)}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
