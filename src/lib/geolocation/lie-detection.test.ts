import { describe, it, expect } from 'vitest';
import { detectLie, lieToJapanese, metersToYards } from './lie-detection';
import type { HoleArea } from '@/lib/geo';

/**
 * 周南CC #1 の実 hole_areas データを fixture とする
 * （Sprint 5 PR3 の geo.test.ts と同じ実データソース）
 */
const SHUNAN_HOLE1_GREEN_A_COORDS = [
  { lat: 34.0435502481965, lng: 131.96107821280327 },
  { lat: 34.0435997674545, lng: 131.96114221105708 },
  { lat: 34.0436931839316, lng: 131.96109768886726 },
  { lat: 34.04368977806342, lng: 131.96095369712978 },
  { lat: 34.04362016765569, lng: 131.9608978112454 },
  { lat: 34.0435561323086, lng: 131.9609537966758 },
];

const SHUNAN_HOLE1_BUNKER_COORDS = [
  // テスト用に矩形に簡略化（pointInPolygon の挙動が convex 形状で安定するように）
  // 実 hole_areas データは凸でない可能性があるが、本テストは判定優先順位の検証が目的
  { lat: 34.04365, lng: 131.96255 },
  { lat: 34.04365, lng: 131.96270 },
  { lat: 34.04370, lng: 131.96270 },
  { lat: 34.04370, lng: 131.96255 },
];

const SHUNAN_HOLE1_FAIRWAY_COORDS = [
  // 大きい矩形でフェアウェイを近似（テスト用）
  { lat: 34.0432, lng: 131.96080 },
  { lat: 34.0432, lng: 131.96280 },
  { lat: 34.0438, lng: 131.96280 },
  { lat: 34.0438, lng: 131.96080 },
];

const SHUNAN_HOLE1_WATER_COORDS = [
  // テスト用の架空池ポリゴン
  { lat: 34.0445, lng: 131.96100 },
  { lat: 34.0445, lng: 131.96120 },
  { lat: 34.0446, lng: 131.96120 },
  { lat: 34.0446, lng: 131.96100 },
];

function makeArea(area_type: HoleArea['area_type'], coords: { lat: number; lng: number }[], sort_order = 0): HoleArea {
  return {
    id: `${area_type}-${sort_order}`,
    hole_id: 'test-hole',
    area_type,
    coordinates: coords,
    name: null,
    sort_order,
    created_at: '',
    updated_at: '',
  };
}

const greenA = makeArea('green_a', SHUNAN_HOLE1_GREEN_A_COORDS, 0);
const bunker = makeArea('bunker', SHUNAN_HOLE1_BUNKER_COORDS, 1);
const fairway = makeArea('fairway', SHUNAN_HOLE1_FAIRWAY_COORDS, 2);
const water = makeArea('water_pond', SHUNAN_HOLE1_WATER_COORDS, 3);

describe('detectLie — judgment priority', () => {
  it('returns green when point is inside green_a polygon', () => {
    // green_a の内部点
    const result = detectLie({
      point: { lat: 34.04365, lng: 131.96105 },
      accuracyM: 5,
      areas: [greenA, fairway],
      activeGreen: 'A',
    });
    expect(result.autoLie).toBe('green');
  });

  it('returns bunker when point is inside bunker polygon (priority over fairway)', () => {
    const result = detectLie({
      point: { lat: 34.04366, lng: 131.96263 },
      accuracyM: 5,
      areas: [fairway, bunker],
      activeGreen: 'A',
    });
    expect(result.autoLie).toBe('bunker');
  });

  it('returns water with highest priority (water > bunker > fairway)', () => {
    const result = detectLie({
      point: { lat: 34.0445, lng: 131.96110 },
      accuracyM: 5,
      areas: [fairway, bunker, water],
      activeGreen: 'A',
    });
    expect(result.autoLie).toBe('water');
  });

  it('treats legacy hazard area_type as water (backward compat)', () => {
    // 旧 'hazard' 値（water_pond/water_river 導入前の汎用ハザード）も water 扱い
    const hazard = makeArea('hazard', SHUNAN_HOLE1_WATER_COORDS, 0);
    const result = detectLie({
      point: { lat: 34.0445, lng: 131.96110 },
      accuracyM: 5,
      areas: [fairway, hazard],
      activeGreen: 'A',
    });
    expect(result.autoLie).toBe('water');
  });

  it('returns fairway when point is inside fairway only', () => {
    const result = detectLie({
      point: { lat: 34.0435, lng: 131.96200 },
      accuracyM: 5,
      areas: [greenA, fairway],
      activeGreen: 'A',
    });
    expect(result.autoLie).toBe('fairway');
  });

  it('returns unknown when point is outside all polygons (no rough fallback)', () => {
    const result = detectLie({
      point: { lat: 34.05, lng: 131.97 }, // 完全に範囲外
      areas: [greenA, fairway, bunker],
      activeGreen: 'A',
      accuracyM: 5,
    });
    expect(result.autoLie).toBe('unknown');
  });

  it('uses green_b when activeGreen is B', () => {
    const greenB = makeArea('green_b', [
      { lat: 34.0440, lng: 131.96150 },
      { lat: 34.0440, lng: 131.96170 },
      { lat: 34.0442, lng: 131.96170 },
      { lat: 34.0442, lng: 131.96150 },
    ], 0);
    const result = detectLie({
      point: { lat: 34.0441, lng: 131.96160 },
      accuracyM: 5,
      areas: [greenA, greenB],
      activeGreen: 'B',
    });
    expect(result.autoLie).toBe('green');
  });
});

describe('detectLie — confidence levels', () => {
  it('returns high confidence for accurate GPS (≦8m) inside polygon', () => {
    const result = detectLie({
      point: { lat: 34.04365, lng: 131.96105 },
      accuracyM: 5,
      areas: [greenA],
      activeGreen: 'A',
    });
    expect(result.confidence).toBe('high');
  });

  it('returns medium confidence for moderate GPS (8-20m)', () => {
    const result = detectLie({
      point: { lat: 34.04365, lng: 131.96105 },
      accuracyM: 15,
      areas: [greenA],
      activeGreen: 'A',
    });
    expect(result.confidence).toBe('medium');
  });

  it('returns low confidence for poor GPS (≧20m)', () => {
    const result = detectLie({
      point: { lat: 34.04365, lng: 131.96105 },
      accuracyM: 30,
      areas: [greenA],
      activeGreen: 'A',
    });
    expect(result.confidence).toBe('low');
  });

  it('returns low confidence when lie is unknown regardless of accuracy', () => {
    const result = detectLie({
      point: { lat: 34.05, lng: 131.97 },
      accuracyM: 3,
      areas: [greenA],
      activeGreen: 'A',
    });
    expect(result.autoLie).toBe('unknown');
    expect(result.confidence).toBe('low');
  });
});

describe('detectLie — distance to green', () => {
  it('returns positive distance when green polygon exists', () => {
    const result = detectLie({
      point: { lat: 34.0435, lng: 131.96200 }, // green から少し離れた点
      accuracyM: 5,
      areas: [greenA],
      activeGreen: 'A',
    });
    expect(result.remainingToGreenM).not.toBeNull();
    expect(result.remainingToGreenM!).toBeGreaterThan(50);
    expect(result.remainingToGreenM!).toBeLessThan(200);
  });

  it('returns null when no green polygon exists', () => {
    const result = detectLie({
      point: { lat: 34.04365, lng: 131.96105 },
      accuracyM: 5,
      areas: [fairway], // green_a/b なし
      activeGreen: 'A',
    });
    expect(result.remainingToGreenM).toBeNull();
  });

  it('returns ~0 when standing on the green', () => {
    const result = detectLie({
      point: { lat: 34.04365, lng: 131.96105 }, // green_a 内部
      accuracyM: 5,
      areas: [greenA],
      activeGreen: 'A',
    });
    expect(result.remainingToGreenM).not.toBeNull();
    expect(result.remainingToGreenM!).toBeLessThan(15);
  });
});

describe('lieToJapanese', () => {
  it('translates known lie codes', () => {
    expect(lieToJapanese('fairway')).toBe('フェアウェイ');
    expect(lieToJapanese('bunker')).toBe('バンカー');
    expect(lieToJapanese('green')).toBe('グリーン');
    expect(lieToJapanese('water')).toBe('水域');
    expect(lieToJapanese('ob')).toBe('OB');
    expect(lieToJapanese('rough')).toBe('ラフ');
    expect(lieToJapanese('tee')).toBe('ティー');
  });

  it('returns 位置不明 for unknown / null / undefined', () => {
    expect(lieToJapanese('unknown')).toBe('位置不明');
    expect(lieToJapanese(null)).toBe('位置不明');
    expect(lieToJapanese(undefined)).toBe('位置不明');
  });
});

describe('metersToYards', () => {
  it('converts meters to yards (1m = 1.0936yd)', () => {
    expect(metersToYards(100)).toBe(109);
    expect(metersToYards(132)).toBe(144);
    expect(metersToYards(0)).toBe(0);
  });
});
