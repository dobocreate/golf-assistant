/**
 * Sprint 7 PR1 (S-7a): 自動軌跡生成ロジック
 *
 * 設計参照: `_bmad-output/planning-artifacts/sprint7-auto-trajectory.md`
 *   Section 4.2 (アルゴリズム), Section 2.4 (周南 CC 整備状況)
 *
 * **責務**:
 * - Par + 打数 + パット数 + センターライン (or ref_start/end fallback) から、
 *   ホール内の各ショット・パットの初期位置を計算する pure 関数群
 * - DB / React state には触らない (呼び出し側 `useDisplayedShots` が state 管理)
 *
 * **入力 fallback 階層**:
 *   段 1: HoleMapData.centerlineA/B (整備済み 15/18 ホール、≥ 2 点)
 *   段 2: HoleMapData.refStart / refEnd (未整備 3 ホール、2 点直線同等、全 18 で整備済み)
 *
 * 段 1 が利用可能なら採用、不可なら段 2、両方不在なら計算不能で空配列を返す。
 */

import type { CenterlinePoint } from '@/actions/hole-map';

/** 緯度 1 度あたりの距離 (m)。WGS84 平均、短距離ホール内では誤差 < 0.5% */
const M_PER_DEG_LAT = 111111;
const DEFAULT_PUTTS = 2;

/** 自動軌跡の各スロット位置 */
export interface AutoTrajectorySlot {
  lat: number;
  lng: number;
  /** パットスロット (true) かショットスロット (false) */
  isPutt: boolean;
}

/** computeInitialPositions の入力 */
export interface ComputeInitialPositionsArgs {
  /** ユーザー入力の打数 (null なら par を使う) */
  strokes: number | null;
  /** ユーザー入力のパット数 (null なら DEFAULT_PUTTS=2 を使う) */
  putts: number | null;
  /** ホールの規定打数 (デフォルト推定用) */
  par: number;
  /** 採用する centerline (段 1 / 段 2 で構築済み、2 点以上) */
  centerline: CenterlinePoint[];
  /** パット配置用のグリーン中心 (centerline の最後の点で代用してもよい) */
  greenCenter: { lat: number; lng: number };
}

/**
 * mapper の `centerlineA / centerlineB` と `refStart / refEnd` から、
 * 自動軌跡に使う centerline を選定する fallback ロジック。
 *
 * 段 1: 整備済み (centerline が 2 点以上) ならそれを返す
 * 段 2: 未整備でも refStart/refEnd があれば 2 点直線で代用
 * 段 3: 全部 null なら null を返す (呼び出し側で軌跡非表示)
 */
export function pickCenterline(args: {
  centerlineA: CenterlinePoint[] | null;
  centerlineB: CenterlinePoint[] | null;
  refStart: CenterlinePoint | null;
  refEnd: CenterlinePoint | null;
  activeGreen: 'A' | 'B' | null;
}): CenterlinePoint[] | null {
  const preferred = args.activeGreen === 'B' ? args.centerlineB : args.centerlineA;
  const fallback = args.activeGreen === 'B' ? args.centerlineA : args.centerlineB;

  if (preferred && preferred.length >= 2) return preferred;
  if (fallback && fallback.length >= 2) return fallback;

  if (args.refStart && args.refEnd) {
    return [args.refStart, args.refEnd];
  }
  return null;
}

/**
 * グリーンエリアの頂点の単純平均を「擬似重心」として返す helper。
 *
 * 厳密な面積加重重心 (shoelace formula) ではないが、ゴルフのグリーンは頂点が
 * 概ね均等配置されている前提のため、パット初期位置の用途では実用上問題ない。
 * 不均等配置の場合は頂点密集側にバイアスする可能性あり (許容範囲)。
 */
export function computeGreenCenter(points: { lat: number; lng: number }[]): { lat: number; lng: number } | null {
  if (points.length === 0) return null;
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

/**
 * 各点までの累積距離 (m) を計算。最初の点は 0。
 * Haversine ではなく簡易の equirectangular 近似 (短距離ホール内では誤差 < 0.5%)。
 */
function computeCumulativeDistances(points: CenterlinePoint[]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const meanLat = (prev.lat + curr.lat) / 2;
    const mPerDegLng = M_PER_DEG_LAT * Math.cos((meanLat * Math.PI) / 180);
    const dx = (curr.lng - prev.lng) * mPerDegLng;
    const dy = (curr.lat - prev.lat) * M_PER_DEG_LAT;
    const segDist = Math.sqrt(dx * dx + dy * dy);
    result.push(result[result.length - 1] + segDist);
  }
  return result;
}

/**
 * polyline 上の指定累積距離地点 (targetDist) を線形補間で求める。
 * targetDist は 0 ~ totalDist の範囲を想定。範囲外は最近端にクランプ。
 */
function interpolateOnPolyline(
  points: CenterlinePoint[],
  cumulative: number[],
  targetDist: number,
): { lat: number; lng: number } {
  // 空配列は caller が事前にガードする想定。誤って (0, 0) (赤道沖) を返すと
  // debug 時に「これはどこから?」と混乱するため明示的に throw。
  if (points.length === 0) {
    throw new Error('interpolateOnPolyline: empty points (caller must guarantee length >= 1)');
  }
  if (points.length === 1) return points[0];

  const totalDist = cumulative[cumulative.length - 1];
  if (targetDist <= 0) return points[0];
  if (targetDist >= totalDist) return points[points.length - 1];

  // セグメント探索
  for (let i = 1; i < cumulative.length; i++) {
    if (targetDist <= cumulative[i]) {
      const segStart = cumulative[i - 1];
      const segDist = cumulative[i] - segStart;
      if (segDist < 1e-9) return points[i - 1];
      const t = (targetDist - segStart) / segDist;
      const a = points[i - 1];
      const b = points[i];
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      };
    }
  }
  return points[points.length - 1];
}

/**
 * 自動軌跡の各スロット (ショット + パット) の初期位置を計算する。
 *
 * clamp 仕様 (Codex Critical C3):
 *   - strokes = max(1, strokes ?? par)
 *   - putts = max(0, min(strokes, putts ?? DEFAULT_PUTTS))
 *   - shotCount = strokes - putts (0 以上)
 *
 * ショット配置 (Codex Major M3): centerline 全体の polyline 累積距離上で N 等分
 *   例 shotCount=3, centerline 4 点 [tee, w1, w2, green]:
 *     1 打目 = 0/3 × totalDist (= tee)
 *     2 打目 = 1/3 × totalDist (補間点)
 *     3 打目 = 2/3 × totalDist (補間点)
 *   最後の点 (green) はショット位置に含めない (パットが続くため)
 *
 * **限界**: 累積距離の単純 N 等分のため、ドッグレッグ等で
 * waypoint 間の距離比が極端な場合 (例: w1-w2 が 200m、w2-green が 100m)、
 * shotCount=3 の 2/3 地点が w2 そのものになり、実際の「3 打目残り 100m から打つ」
 * 想定とずれる可能性あり。PR2 でユーザーがドラッグ修正できるため致命的ではない。
 * 番手別飛距離 (ドライバー 230m / ウェッジ 100m 等) を加味した不均等分割は
 * 将来 PR (B-1 過去ラウンド統計学習との統合) で検討。
 *
 * パット配置: greenCenter から 1.5m ずつ南北にオフセット (重なり回避)
 *
 * @returns ショット (打順) → パット (打順) の順で並ぶ AutoTrajectorySlot[]
 */
export function computeInitialPositions(args: ComputeInitialPositionsArgs): AutoTrajectorySlot[] {
  // clamp
  const strokes = Math.max(1, args.strokes ?? args.par);
  const putts = Math.max(0, Math.min(strokes, args.putts ?? DEFAULT_PUTTS));
  const shotCount = strokes - putts;

  const cl = args.centerline;
  if (cl.length < 2) {
    // 想定外 (呼び出し側で 2 点以上を保証する設計)、フォールバックとして greenCenter に集約
    const fallback = cl[0] ?? args.greenCenter;
    return [
      ...Array.from({ length: shotCount }, () => ({ lat: fallback.lat, lng: fallback.lng, isPutt: false })),
      ...buildPuttSlots(args.greenCenter, putts),
    ];
  }

  // ショット位置: polyline 累積距離上で N 等分
  const cumulative = computeCumulativeDistances(cl);
  const totalDist = cumulative[cumulative.length - 1];
  const shotPositions: AutoTrajectorySlot[] = [];
  if (shotCount > 0) {
    for (let i = 0; i < shotCount; i++) {
      const t = (i / shotCount) * totalDist; // 0/N, 1/N, ..., (N-1)/N
      const p = interpolateOnPolyline(cl, cumulative, t);
      shotPositions.push({ lat: p.lat, lng: p.lng, isPutt: false });
    }
  }

  return [...shotPositions, ...buildPuttSlots(args.greenCenter, putts)];
}

/**
 * パットスロット生成: greenCenter から 1.5m ずつ南北にオフセット (重なり回避)
 */
function buildPuttSlots(
  greenCenter: { lat: number; lng: number },
  count: number,
): AutoTrajectorySlot[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: greenCenter.lat + (i * 1.5) / M_PER_DEG_LAT,
    lng: greenCenter.lng,
    isPutt: true,
  }));
}
