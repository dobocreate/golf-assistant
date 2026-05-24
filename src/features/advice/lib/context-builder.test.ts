import { describe, it, expect } from 'vitest';
import { buildAreaContext } from './context-builder';
import type { HoleArea } from '@/lib/geo';

const TEE: { lat: number; lng: number } = { lat: 34.0437698649341, lng: 131.964884042019 };

const baseArea = (overrides: Partial<HoleArea>): HoleArea => ({
  id: 'a1',
  hole_id: 'h1',
  area_type: 'fairway',
  coordinates: [],
  name: null,
  sort_order: 0,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...overrides,
});

// 周南CC #1 グリーンA 付近を借用 (ティーから ~390m)
const GREEN_A_COORDS = [
  { lat: 34.0435502481965, lng: 131.96107821280327 },
  { lat: 34.0435997674545, lng: 131.96114221105708 },
  { lat: 34.0436931839316, lng: 131.96109768886726 },
  { lat: 34.04368977806342, lng: 131.96095369712978 },
  { lat: 34.04362016765569, lng: 131.9608978112454 },
  { lat: 34.0435561323086, lng: 131.9609537966758 },
];

// fairway 用の仮想凸ポリゴン (ティーから 150〜250m 程度のエリア)
const FAIRWAY_CONVEX = [
  { lat: 34.04372, lng: 131.96300 },
  { lat: 34.04372, lng: 131.96200 },
  { lat: 34.04382, lng: 131.96200 },
  { lat: 34.04382, lng: 131.96300 },
];

describe('buildAreaContext', () => {
  describe('water_pond / water_river', () => {
    it('water_pond のみ → 「水ハザード（池）」行が出力される', () => {
      const areas: HoleArea[] = [
        baseArea({ area_type: 'water_pond', coordinates: GREEN_A_COORDS }),
      ];
      const out = buildAreaContext(areas, TEE, null);
      expect(out).toMatch(/水ハザード（池）: 1箇所（最近接 約\d+y）/);
      expect(out).not.toContain('水ハザード（川）');
    });

    it('water_river のみ → 「水ハザード（川）」行が出力される', () => {
      const areas: HoleArea[] = [
        baseArea({ area_type: 'water_river', coordinates: GREEN_A_COORDS }),
      ];
      const out = buildAreaContext(areas, TEE, null);
      expect(out).toMatch(/水ハザード（川）: 1箇所（最近接 約\d+y）/);
      expect(out).not.toContain('水ハザード（池）');
    });

    it('両方 → 別々の行で出力される', () => {
      const areas: HoleArea[] = [
        baseArea({ id: 'p', area_type: 'water_pond', coordinates: GREEN_A_COORDS }),
        baseArea({ id: 'r', area_type: 'water_river', coordinates: GREEN_A_COORDS }),
      ];
      const out = buildAreaContext(areas, TEE, null);
      expect(out).toContain('水ハザード（池）');
      expect(out).toContain('水ハザード（川）');
    });

    it('teePoint なし → 距離なしフォールバック', () => {
      const areas: HoleArea[] = [
        baseArea({ area_type: 'water_pond', coordinates: GREEN_A_COORDS }),
      ];
      const out = buildAreaContext(areas, null, null);
      expect(out).toBe('水ハザード（池）: 1箇所');
    });

    it('複数箇所 → 件数を集計し最近接距離を含める', () => {
      const areas: HoleArea[] = [
        baseArea({ id: 'p1', area_type: 'water_pond', coordinates: GREEN_A_COORDS }),
        baseArea({ id: 'p2', area_type: 'water_pond', coordinates: GREEN_A_COORDS }),
      ];
      const out = buildAreaContext(areas, TEE, null);
      expect(out).toMatch(/水ハザード（池）: 2箇所（最近接 約\d+y）/);
    });
  });

  describe('fairway', () => {
    it('fairway ポリゴン → 距離レンジと中央距離が出力される', () => {
      const areas: HoleArea[] = [
        baseArea({ area_type: 'fairway', coordinates: FAIRWAY_CONVEX }),
      ];
      const out = buildAreaContext(areas, TEE, null);
      expect(out).toMatch(/フェアウェイ: \d+y〜\d+y（中央 約\d+y）/);
    });

    it('fairway 複数 → 個別出力 (#1, #2)', () => {
      const areas: HoleArea[] = [
        baseArea({ id: 'f1', area_type: 'fairway', coordinates: FAIRWAY_CONVEX }),
        baseArea({ id: 'f2', area_type: 'fairway', coordinates: FAIRWAY_CONVEX }),
      ];
      const out = buildAreaContext(areas, TEE, null);
      expect(out).toContain('フェアウェイ #1');
      expect(out).toContain('フェアウェイ #2');
    });

    it('teePoint なし → ラベルのみ', () => {
      const areas: HoleArea[] = [
        baseArea({ area_type: 'fairway', coordinates: FAIRWAY_CONVEX }),
      ];
      const out = buildAreaContext(areas, null, null);
      expect(out).toBe('フェアウェイ');
    });

    it('空 coordinates → ラベルのみ', () => {
      const areas: HoleArea[] = [baseArea({ area_type: 'fairway', coordinates: [] })];
      const out = buildAreaContext(areas, TEE, null);
      expect(out).toBe('フェアウェイ');
    });

    it('重心がポリゴン外の凹型 (C字) → 距離レンジのみ、中央なし', () => {
      // C字型 (右に開いた凹型) ポリゴン: 重心が中央の空洞 (= ポリゴン外) になる
      //  ■■■   上の横棒 (lat=0.002〜0.003)
      //  ■     縦棒    (lng=0〜0.001)
      //  ■■■   下の横棒 (lat=0〜0.001)
      const concave: { lat: number; lng: number }[] = [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.003 },
        { lat: 0.001, lng: 0.003 },
        { lat: 0.001, lng: 0.001 },
        { lat: 0.002, lng: 0.001 },
        { lat: 0.002, lng: 0.003 },
        { lat: 0.003, lng: 0.003 },
        { lat: 0.003, lng: 0 },
      ];
      const areas: HoleArea[] = [baseArea({ area_type: 'fairway', coordinates: concave })];
      const tee = { lat: -0.001, lng: -0.001 };
      const out = buildAreaContext(areas, tee, null);
      expect(out).toMatch(/フェアウェイ: \d+y〜\d+y$/);
      expect(out).not.toContain('中央');
    });
  });

  describe('出力順序', () => {
    it('全 area_type 入力 → グリーン → fairway → OB → 水ハザード → バンカー → hazard の順', () => {
      const areas: HoleArea[] = [
        baseArea({ id: 'bk', area_type: 'bunker', coordinates: GREEN_A_COORDS }),
        baseArea({ id: 'hz', area_type: 'hazard', coordinates: GREEN_A_COORDS }),
        baseArea({ id: 'gA', area_type: 'green_a', coordinates: GREEN_A_COORDS }),
        baseArea({ id: 'fw', area_type: 'fairway', coordinates: FAIRWAY_CONVEX }),
        baseArea({ id: 'ob', area_type: 'ob_line', coordinates: GREEN_A_COORDS, name: '右OB' }),
        baseArea({ id: 'wp', area_type: 'water_pond', coordinates: GREEN_A_COORDS }),
      ];
      const out = buildAreaContext(areas, TEE, 'A');
      const lines = out.split('\n');
      const idxGreen = lines.findIndex((l) => l.startsWith('使用グリーン'));
      const idxFw = lines.findIndex((l) => l.startsWith('フェアウェイ'));
      const idxOb = lines.findIndex((l) => l.includes('右OB'));
      const idxWp = lines.findIndex((l) => l.startsWith('水ハザード（池）'));
      const idxBk = lines.findIndex((l) => l.startsWith('バンカー'));
      const idxHz = lines.findIndex((l) => l.startsWith('ハザード（池・川等）'));

      expect(idxGreen).toBeGreaterThanOrEqual(0);
      expect(idxFw).toBeGreaterThan(idxGreen);
      expect(idxOb).toBeGreaterThan(idxFw);
      expect(idxWp).toBeGreaterThan(idxOb);
      expect(idxBk).toBeGreaterThan(idxWp);
      expect(idxHz).toBeGreaterThan(idxBk);
    });
  });

  describe('hazard legacy', () => {
    it('hazard ラベルは従来通り「ハザード（池・川等）」で出力される', () => {
      const areas: HoleArea[] = [
        baseArea({ area_type: 'hazard', coordinates: GREEN_A_COORDS }),
      ];
      const out = buildAreaContext(areas, TEE, null);
      expect(out).toMatch(/ハザード（池・川等）: 1箇所（最近接 約\d+y）/);
    });

    it('hazard と water_pond が混在しても両方独立で出力される', () => {
      const areas: HoleArea[] = [
        baseArea({ id: 'h', area_type: 'hazard', coordinates: GREEN_A_COORDS }),
        baseArea({ id: 'p', area_type: 'water_pond', coordinates: GREEN_A_COORDS }),
      ];
      const out = buildAreaContext(areas, TEE, null);
      expect(out).toContain('水ハザード（池）');
      expect(out).toContain('ハザード（池・川等）');
    });
  });

  describe('empty', () => {
    it('areas が空 → 空文字列', () => {
      expect(buildAreaContext([], TEE, null)).toBe('');
    });
  });
});
