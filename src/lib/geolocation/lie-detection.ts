import type { HoleArea, HoleAreaType } from '@/lib/geo';
import { pointInPolygon, polygonCentroid, haversineDistance } from '@/lib/geo';

export type AutoLie = 'fairway' | 'rough' | 'bunker' | 'green' | 'ob' | 'water' | 'tee' | 'unknown';
export type AutoLieConfidence = 'high' | 'medium' | 'low';

export interface LieDetectionInput {
  point: { lat: number; lng: number };
  /** GPS 精度 (m) — 信頼度算出に使用 */
  accuracyM: number;
  areas: HoleArea[];
  /** ラウンドの active_green。null/未指定なら green_a を優先 */
  activeGreen: 'A' | 'B' | null;
}

export interface LieDetectionResult {
  autoLie: AutoLie;
  confidence: AutoLieConfidence;
  /** active_green ポリゴンの重心までの距離 (m)。グリーン未定義なら null */
  remainingToGreenM: number | null;
}

/**
 * GPS 座標と hole_areas から lie / confidence / 残距離を判定する pure 関数
 *
 * 設計書 Section 5.1 の判定優先順位（高→低）:
 *   1. water (water_pond / water_river / 旧 hazard — 後方互換)
 *   2. bunker
 *   3. green (active_green に対応するポリゴン)
 *   4. OB definite (※ Sprint 5 PR5 では未実装。fairway 反対側判定が必要)
 *   5. fairway
 *   6. unknown （rough は補集合扱いせず、林・隣ホール誤判定を防ぐ）
 *
 * 注: `hazard` は CHECK 制約に残る legacy 値で、context-builder.ts でも
 *     「ハザード（池・川等）」として水域同等に扱われている。lie 判定でも
 *     water 優先層に含めて整合性を保つ。
 *
 * confidence:
 *   - high: 精度円が完全に1ポリゴン内に収まる（accuracyM ≦ 8m or unknown 判定）
 *   - medium: 中間
 *   - low: 精度が荒い（accuracyM ≧ 20m）または unknown 判定
 *
 * 距離: active_green に対応する green_a/green_b ポリゴンの重心 (polygonCentroid) との
 * haversine 距離 [m]。Y/M 変換は呼び出し側で。
 */
export function detectLie(input: LieDetectionInput): LieDetectionResult {
  const { point, accuracyM, areas, activeGreen } = input;

  const greenType: HoleAreaType = activeGreen === 'B' ? 'green_b' : 'green_a';
  const greenArea = areas.find((a) => a.area_type === greenType);
  const remainingToGreenM = greenArea
    ? Math.round(haversineDistance(point, polygonCentroid(greenArea.coordinates)))
    : null;

  // 判定優先順位順に検査
  const isInside = (type: HoleAreaType): boolean =>
    areas.some(
      (a) => a.area_type === type && pointInPolygon(point, a.coordinates),
    );

  let autoLie: AutoLie = 'unknown';
  if (isInside('water_pond') || isInside('water_river') || isInside('hazard')) {
    autoLie = 'water';
  } else if (isInside('bunker')) {
    autoLie = 'bunker';
  } else if (greenArea && pointInPolygon(point, greenArea.coordinates)) {
    autoLie = 'green';
  } else if (isInside('fairway')) {
    autoLie = 'fairway';
  }
  // 'rough'/'ob'/'tee' は本実装では返さない:
  // - rough: 補集合扱いをやめ unknown に倒す（設計書 Section 5.1）
  // - ob: ob_line の幾何意味判定は PR6 以降（設計書 Section 5.1.1）
  // - tee: ティー位置は別管理のため自動判定対象外

  // confidence（accuracyM とポリゴン判定結果から）
  let confidence: AutoLieConfidence;
  if (autoLie === 'unknown') {
    confidence = 'low';
  } else if (accuracyM <= 8) {
    confidence = 'high';
  } else if (accuracyM <= 20) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { autoLie, confidence, remainingToGreenM };
}

/**
 * lie コード → 日本語ラベル
 */
export function lieToJapanese(lie: AutoLie | null | undefined): string {
  switch (lie) {
    case 'fairway': return 'フェアウェイ';
    case 'rough': return 'ラフ';
    case 'bunker': return 'バンカー';
    case 'green': return 'グリーン';
    case 'ob': return 'OB';
    case 'water': return '水域';
    case 'tee': return 'ティー';
    case 'unknown':
    case null:
    case undefined:
      return '位置不明';
  }
}

/**
 * メートル → ヤード変換（整数ヤードで返却・四捨五入）
 * 1m = 1.0936 yd
 */
export function metersToYards(m: number): number {
  return Math.round(m * 1.0936);
}
