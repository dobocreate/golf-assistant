import { describe, it, expect } from 'vitest';
import {
  computeInitialPositions,
  pickCenterline,
  computeGreenCenter,
} from './auto-trajectory';
import type { CenterlinePoint } from '@/actions/hole-map';

/**
 * Sprint 7 PR1 (S-7a): 自動軌跡生成ロジックの単体テスト
 *
 * 周南 CC で確認された典型パターン:
 * - Par 3 → centerline 2 点 (ティー + グリーン)
 * - Par 4 → centerline 3 点 (ティー + waypoint + グリーン)
 * - Par 5 → centerline 4 点 (ティー + waypoint × 2 + グリーン)
 */

const TEE: CenterlinePoint = { lat: 34.0, lng: 131.5 };
const W1: CenterlinePoint = { lat: 34.001, lng: 131.501 };
const W2: CenterlinePoint = { lat: 34.002, lng: 131.502 };
const GREEN: CenterlinePoint = { lat: 34.003, lng: 131.503 };

const GREEN_CENTER = { lat: GREEN.lat, lng: GREEN.lng };

describe('pickCenterline', () => {
  it('段1: centerlineA を優先 (activeGreen=A)', () => {
    const result = pickCenterline({
      centerlineA: [TEE, W1, GREEN],
      centerlineB: [TEE, W2, GREEN],
      refStart: null,
      refEnd: null,
      activeGreen: 'A',
    });
    expect(result).toEqual([TEE, W1, GREEN]);
  });

  it('段1: centerlineB を優先 (activeGreen=B)', () => {
    const result = pickCenterline({
      centerlineA: [TEE, W1, GREEN],
      centerlineB: [TEE, W2, GREEN],
      refStart: null,
      refEnd: null,
      activeGreen: 'B',
    });
    expect(result).toEqual([TEE, W2, GREEN]);
  });

  it('段1: 優先側が null なら fallback グリーンを採用', () => {
    const result = pickCenterline({
      centerlineA: null,
      centerlineB: [TEE, W2, GREEN],
      refStart: null,
      refEnd: null,
      activeGreen: 'A',
    });
    expect(result).toEqual([TEE, W2, GREEN]);
  });

  it('段2: centerline が両方 null でも refStart/refEnd があれば 2 点 fallback', () => {
    const result = pickCenterline({
      centerlineA: null,
      centerlineB: null,
      refStart: TEE,
      refEnd: GREEN,
      activeGreen: 'A',
    });
    expect(result).toEqual([TEE, GREEN]);
  });

  it('段3: 全部 null なら null (軌跡計算不能)', () => {
    const result = pickCenterline({
      centerlineA: null,
      centerlineB: null,
      refStart: null,
      refEnd: null,
      activeGreen: 'A',
    });
    expect(result).toBeNull();
  });

  it('centerline が 1 点のみ (異常データ) は fallback へフォールスルー', () => {
    const result = pickCenterline({
      centerlineA: [TEE],
      centerlineB: null,
      refStart: TEE,
      refEnd: GREEN,
      activeGreen: 'A',
    });
    expect(result).toEqual([TEE, GREEN]);
  });
});

describe('computeGreenCenter', () => {
  it('多角形の単純平均で重心を返す', () => {
    const points = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
    ];
    expect(computeGreenCenter(points)).toEqual({ lat: 1, lng: 1 });
  });

  it('空配列は null', () => {
    expect(computeGreenCenter([])).toBeNull();
  });
});

describe('computeInitialPositions', () => {
  describe('clamp 仕様 (Codex C3)', () => {
    it('strokes が null なら par が採用される (Par 4 → shotCount=2 + putts=2 = 4 スロット)', () => {
      const result = computeInitialPositions({
        strokes: null,
        putts: null,
        par: 4,
        centerline: [TEE, W1, GREEN],
        greenCenter: GREEN_CENTER,
      });
      expect(result).toHaveLength(4);
      expect(result.filter((r) => !r.isPutt)).toHaveLength(2);
      expect(result.filter((r) => r.isPutt)).toHaveLength(2);
    });

    it('strokes が 0 や負値 → max(1, ...) で clamp', () => {
      const result = computeInitialPositions({
        strokes: 0,
        putts: 0,
        par: 4,
        centerline: [TEE, W1, GREEN],
        greenCenter: GREEN_CENTER,
      });
      // strokes = 1, putts = 0, shotCount = 1
      expect(result).toHaveLength(1);
      expect(result[0].isPutt).toBe(false);
    });

    it('putts > strokes → strokes に clamp (Par 3 で putts=5 指定 → putts=strokes)', () => {
      const result = computeInitialPositions({
        strokes: 3,
        putts: 5,
        par: 3,
        centerline: [TEE, GREEN],
        greenCenter: GREEN_CENTER,
      });
      // strokes=3, putts=min(3, 5)=3, shotCount=0
      expect(result).toHaveLength(3);
      expect(result.every((r) => r.isPutt)).toBe(true);
    });
  });

  describe('Par 別の典型パターン', () => {
    it('Par 3: 2 点 centerline + 一律 2 パット (Par 3 → strokes=3, putts=2, shotCount=1)', () => {
      const result = computeInitialPositions({
        strokes: null,
        putts: null,
        par: 3,
        centerline: [TEE, GREEN],
        greenCenter: GREEN_CENTER,
      });
      expect(result).toHaveLength(3);
      // 1 打目: tee 位置 (累積距離 0)
      expect(result[0].isPutt).toBe(false);
      expect(result[0].lat).toBeCloseTo(TEE.lat, 5);
      expect(result[0].lng).toBeCloseTo(TEE.lng, 5);
      // パット 1, 2
      expect(result[1].isPutt).toBe(true);
      expect(result[2].isPutt).toBe(true);
    });

    it('Par 4: 3 点 centerline (ティー + waypoint + グリーン)、shotCount=2', () => {
      const result = computeInitialPositions({
        strokes: null,
        putts: null,
        par: 4,
        centerline: [TEE, W1, GREEN],
        greenCenter: GREEN_CENTER,
      });
      expect(result).toHaveLength(4);
      // 1 打目: 累積距離 0/2 = 0 → tee
      expect(result[0].lat).toBeCloseTo(TEE.lat, 5);
      expect(result[0].lng).toBeCloseTo(TEE.lng, 5);
      // 2 打目: 累積距離 1/2 地点
      // セグメント比 (TEE-W1) vs (W1-GREEN) = 1:2 なので 1/2 地点は W1 と GREEN の間
      expect(result[1].lat).toBeGreaterThanOrEqual(W1.lat);
      expect(result[1].lat).toBeLessThanOrEqual(GREEN.lat);
      expect(result[1].isPutt).toBe(false);
    });

    it('Par 5: 4 点 centerline (ティー + waypoint × 2 + グリーン)、shotCount=3 → 全 waypoint 活用', () => {
      const result = computeInitialPositions({
        strokes: null,
        putts: null,
        par: 5,
        centerline: [TEE, W1, W2, GREEN],
        greenCenter: GREEN_CENTER,
      });
      expect(result).toHaveLength(5);
      // 1 打目: tee
      expect(result[0].lat).toBeCloseTo(TEE.lat, 5);
      // 2 打目: 累積距離 1/3 → W1 付近
      // 3 打目: 累積距離 2/3 → W2 付近
      // (4 点 polyline で 3 等分 → 各 waypoint 近辺になる)
      expect(result[1].isPutt).toBe(false);
      expect(result[2].isPutt).toBe(false);
      expect(result[3].isPutt).toBe(true);
      expect(result[4].isPutt).toBe(true);
    });
  });

  describe('打数を変えるとスロット数増減', () => {
    it('Par 4 + strokes=5 (1 打追加) → shotCount=3', () => {
      const result = computeInitialPositions({
        strokes: 5,
        putts: 2,
        par: 4,
        centerline: [TEE, W1, GREEN],
        greenCenter: GREEN_CENTER,
      });
      expect(result).toHaveLength(5);
      expect(result.filter((r) => !r.isPutt)).toHaveLength(3);
    });

    it('Par 4 + strokes=3 (1 打減) → shotCount=1', () => {
      const result = computeInitialPositions({
        strokes: 3,
        putts: 2,
        par: 4,
        centerline: [TEE, W1, GREEN],
        greenCenter: GREEN_CENTER,
      });
      expect(result).toHaveLength(3);
      expect(result.filter((r) => !r.isPutt)).toHaveLength(1);
      expect(result.filter((r) => r.isPutt)).toHaveLength(2);
    });
  });

  describe('パット位置', () => {
    it('パットは greenCenter から南北に 1.5m ずつオフセット', () => {
      const result = computeInitialPositions({
        strokes: 4,
        putts: 2,
        par: 4,
        centerline: [TEE, GREEN],
        greenCenter: GREEN_CENTER,
      });
      const putts = result.filter((r) => r.isPutt);
      expect(putts).toHaveLength(2);
      // パット 0: greenCenter そのまま (i=0 * 1.5m = 0m)
      expect(putts[0].lat).toBeCloseTo(GREEN_CENTER.lat, 8);
      expect(putts[0].lng).toBeCloseTo(GREEN_CENTER.lng, 8);
      // パット 1: 1.5m 北 (緯度 1° ≈ 111111m なので +1.5/111111)
      const expectedOffset = 1.5 / 111111;
      expect(putts[1].lat).toBeCloseTo(GREEN_CENTER.lat + expectedOffset, 8);
      expect(putts[1].lng).toBeCloseTo(GREEN_CENTER.lng, 8);
    });

    it('1 パット (チップイン) も対応', () => {
      const result = computeInitialPositions({
        strokes: 3,
        putts: 1,
        par: 4,
        centerline: [TEE, W1, GREEN],
        greenCenter: GREEN_CENTER,
      });
      expect(result.filter((r) => r.isPutt)).toHaveLength(1);
    });

    it('0 パット (ノーパット = 沈め) も対応', () => {
      const result = computeInitialPositions({
        strokes: 2,
        putts: 0,
        par: 4,
        centerline: [TEE, W1, GREEN],
        greenCenter: GREEN_CENTER,
      });
      expect(result.filter((r) => r.isPutt)).toHaveLength(0);
      expect(result).toHaveLength(2);
    });
  });

  describe('shotCount 0 のエッジケース', () => {
    it('全部パット (putts=strokes、shotCount=0) → ショット位置なし', () => {
      const result = computeInitialPositions({
        strokes: 2,
        putts: 2,
        par: 3,
        centerline: [TEE, GREEN],
        greenCenter: GREEN_CENTER,
      });
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.isPutt)).toBe(true);
    });
  });

  describe('異常系フォールバック (centerline 1 点以下)', () => {
    it('centerline が 1 点のみ → 全 shot が centerline[0] に集約 (フォールバック)', () => {
      // 通常 pickCenterline で 2 点未満は段 2/段 3 にフォールバックされるため到達しないが、
      // 防御的フォールバックの動作を保証 (Codex n-4 指摘)
      const result = computeInitialPositions({
        strokes: 4,
        putts: 2,
        par: 4,
        centerline: [TEE],
        greenCenter: GREEN_CENTER,
      });
      expect(result).toHaveLength(4);
      // shotCount=2 は全部 TEE に集約
      expect(result[0].lat).toBeCloseTo(TEE.lat, 8);
      expect(result[0].lng).toBeCloseTo(TEE.lng, 8);
      expect(result[1].lat).toBeCloseTo(TEE.lat, 8);
      expect(result[1].lng).toBeCloseTo(TEE.lng, 8);
      // パットは greenCenter ベース
      expect(result[2].isPutt).toBe(true);
      expect(result[2].lat).toBeCloseTo(GREEN_CENTER.lat, 8);
    });

    it('centerline 空配列 → 全 shot が greenCenter に集約', () => {
      const result = computeInitialPositions({
        strokes: 3,
        putts: 1,
        par: 4,
        centerline: [],
        greenCenter: GREEN_CENTER,
      });
      expect(result).toHaveLength(3);
      // shotCount=2 は全部 greenCenter に集約 (cl[0] が undefined のため)
      expect(result[0].lat).toBeCloseTo(GREEN_CENTER.lat, 8);
      expect(result[1].lat).toBeCloseTo(GREEN_CENTER.lat, 8);
    });
  });

  describe('累積距離 polyline 補間 (Major M3)', () => {
    it('shotCount=2 + センターライン 2 点 (直線) → tee と中央', () => {
      const result = computeInitialPositions({
        strokes: 4,
        putts: 2,
        par: 4,
        centerline: [TEE, GREEN], // 直線
        greenCenter: GREEN_CENTER,
      });
      const shots = result.filter((r) => !r.isPutt);
      expect(shots).toHaveLength(2);
      // 1 打目 = tee
      expect(shots[0].lat).toBeCloseTo(TEE.lat, 5);
      // 2 打目 = (tee + green) / 2
      expect(shots[1].lat).toBeCloseTo((TEE.lat + GREEN.lat) / 2, 5);
      expect(shots[1].lng).toBeCloseTo((TEE.lng + GREEN.lng) / 2, 5);
    });
  });
});
