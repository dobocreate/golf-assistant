import { describe, it, expect } from 'vitest';
import {
  latLngToPixel,
  pixelToLatLng,
  pointInPolygon,
  polygonCentroid,
  haversineDistance,
  calcDistanceToPolygon,
  calcMaxDistanceToPolygon,
  type AerialImageMetadata,
} from './geo';

/**
 * Real-world fixture: 周南カントリー倶楽部 #1
 *
 * mapper 側 (golf-course-mapper) で生成された衛星画像のメタデータを使用。
 * このメタデータが本番 DB の hole_view_configs.metadata_json と完全一致することで、
 * mapper 側の latLngToPixel/pixelToLatLng と assistant 側の同関数が
 * 同じ pixel 座標を返すことを保証する parity test。
 */
const SHUNAN_HOLE1_METADATA: AerialImageMetadata = {
  bbox: {
    lat_min: 34.04261922391565,
    lat_max: 34.04462507720213,
    lng_min: 131.96033817407547,
    lng_max: 131.9656226507889,
  },
  pre_rotate_width: 987,
  pre_rotate_height: 452,
  rotated_width: 542,
  rotated_height: 1025,
  final_width: 364,
  final_height: 956,
  bearing_rad: -1.664170011851141,
  zoom: 17,
};

// 周南CC #1 の実 GPS 基準点（hole_view_configs.ref_start_*/ref_end_* から取得）
const SHUNAN_HOLE1_REF_START = { lat: 34.0437698649341, lng: 131.964884042019 };
const SHUNAN_HOLE1_REF_END = { lat: 34.0434409334664, lng: 131.960645025518 };

// 周南CC #1 のグリーン A ポリゴン（hole_areas.coordinates from area_type='green_a'）
const SHUNAN_HOLE1_GREEN_A: { lat: number; lng: number }[] = [
  { lat: 34.0435502481965, lng: 131.96107821280327 },
  { lat: 34.0435997674545, lng: 131.96114221105708 },
  { lat: 34.0436931839316, lng: 131.96109768886726 },
  { lat: 34.04368977806342, lng: 131.96095369712978 },
  { lat: 34.04362016765569, lng: 131.9608978112454 },
  { lat: 34.0435561323086, lng: 131.9609537966758 },
];

describe('latLngToPixel / pixelToLatLng', () => {
  it('round-trips a point near the bbox center', () => {
    const lat = (SHUNAN_HOLE1_METADATA.bbox.lat_min + SHUNAN_HOLE1_METADATA.bbox.lat_max) / 2;
    const lng = (SHUNAN_HOLE1_METADATA.bbox.lng_min + SHUNAN_HOLE1_METADATA.bbox.lng_max) / 2;
    const pixel = latLngToPixel(lat, lng, SHUNAN_HOLE1_METADATA);
    expect(pixel).not.toBeNull();
    const back = pixelToLatLng(pixel!.px, pixel!.py, SHUNAN_HOLE1_METADATA);
    expect(back).not.toBeNull();
    // 緯度経度の round-trip 誤差は十分小さい（GPS 精度より遥か小さい 1e-9 度 ≒ 0.1mm 程度）
    expect(back!.lat).toBeCloseTo(lat, 10);
    expect(back!.lng).toBeCloseTo(lng, 10);
  });

  it('round-trips ref_start point of 周南CC #1', () => {
    const pixel = latLngToPixel(
      SHUNAN_HOLE1_REF_START.lat,
      SHUNAN_HOLE1_REF_START.lng,
      SHUNAN_HOLE1_METADATA,
    );
    expect(pixel).not.toBeNull();
    const back = pixelToLatLng(pixel!.px, pixel!.py, SHUNAN_HOLE1_METADATA);
    expect(back).not.toBeNull();
    expect(back!.lat).toBeCloseTo(SHUNAN_HOLE1_REF_START.lat, 10);
    expect(back!.lng).toBeCloseTo(SHUNAN_HOLE1_REF_START.lng, 10);
  });

  it('round-trips ref_end point of 周南CC #1', () => {
    const pixel = latLngToPixel(
      SHUNAN_HOLE1_REF_END.lat,
      SHUNAN_HOLE1_REF_END.lng,
      SHUNAN_HOLE1_METADATA,
    );
    expect(pixel).not.toBeNull();
    const back = pixelToLatLng(pixel!.px, pixel!.py, SHUNAN_HOLE1_METADATA);
    expect(back).not.toBeNull();
    expect(back!.lat).toBeCloseTo(SHUNAN_HOLE1_REF_END.lat, 10);
    expect(back!.lng).toBeCloseTo(SHUNAN_HOLE1_REF_END.lng, 10);
  });

  it('round-trips a pixel near image center', () => {
    const px = (SHUNAN_HOLE1_METADATA.final_width ?? 0) / 2;
    const py = (SHUNAN_HOLE1_METADATA.final_height ?? 0) / 2;
    const latLng = pixelToLatLng(px, py, SHUNAN_HOLE1_METADATA);
    expect(latLng).not.toBeNull();
    const back = latLngToPixel(latLng!.lat, latLng!.lng, SHUNAN_HOLE1_METADATA);
    expect(back).not.toBeNull();
    expect(back!.px).toBeCloseTo(px, 6);
    expect(back!.py).toBeCloseTo(py, 6);
  });

  it('returns null for invalid metadata (zero pre_rotate_width)', () => {
    const invalid: AerialImageMetadata = { ...SHUNAN_HOLE1_METADATA, pre_rotate_width: 0 };
    expect(latLngToPixel(34, 131, invalid)).toBeNull();
    expect(pixelToLatLng(0, 0, invalid)).toBeNull();
  });

  it('returns null for invalid metadata (degenerate bbox)', () => {
    const invalid: AerialImageMetadata = {
      ...SHUNAN_HOLE1_METADATA,
      bbox: { ...SHUNAN_HOLE1_METADATA.bbox, lng_max: SHUNAN_HOLE1_METADATA.bbox.lng_min },
    };
    expect(latLngToPixel(34, 131, invalid)).toBeNull();
    expect(pixelToLatLng(0, 0, invalid)).toBeNull();
  });

  /**
   * Pinned-value parity test (drift detector).
   *
   * 期待 pixel 値は assistant 側 latLngToPixel をフィクスチャに対して走らせて求めた値。
   * 同じフィクスチャを mapper 側 (golf-course-mapper/src/lib/aerial-transform.ts)
   * に渡しても**同一の値**が返ることが parity の本質的要件。
   *
   * このテストが落ちた場合の対応:
   * 1. assistant 側の geo.ts の数式が変わった可能性 → 意図的なら値を更新、意図せざる drift なら revert
   * 2. mapper 側と一致するか手動で確認（mapper の test fixture と diff）
   *
   * ピン精度は 1e-6 px（floating-point ノイズより遥か上だが、SVG 描画解像度より十分高い）
   */
  it('latLngToPixel produces stable pixel values for ref_start (parity drift detector)', () => {
    const pixel = latLngToPixel(
      SHUNAN_HOLE1_REF_START.lat,
      SHUNAN_HOLE1_REF_START.lng,
      SHUNAN_HOLE1_METADATA,
    );
    expect(pixel).not.toBeNull();
    expect(pixel!.px).toBeCloseTo(181.9904748319155, 6);
    expect(pixel!.py).toBeCloseTo(835.1021892649514, 6);
  });

  it('latLngToPixel produces stable pixel values for ref_end (parity drift detector)', () => {
    const pixel = latLngToPixel(
      SHUNAN_HOLE1_REF_END.lat,
      SHUNAN_HOLE1_REF_END.lng,
      SHUNAN_HOLE1_METADATA,
    );
    expect(pixel).not.toBeNull();
    expect(pixel!.px).toBeCloseTo(182.01168554710705, 6);
    expect(pixel!.py).toBeCloseTo(39.90438223417698, 6);
  });

  it('ref_start and ref_end have nearly identical px (both lie on the hole axis)', () => {
    // ホール軸方向に沿って画像が回転されているため、ref_start と ref_end の
    // px は画像中央付近で僅差になるはず。final_width=364 → 中央は 182
    const start = latLngToPixel(
      SHUNAN_HOLE1_REF_START.lat,
      SHUNAN_HOLE1_REF_START.lng,
      SHUNAN_HOLE1_METADATA,
    )!;
    const end = latLngToPixel(
      SHUNAN_HOLE1_REF_END.lat,
      SHUNAN_HOLE1_REF_END.lng,
      SHUNAN_HOLE1_METADATA,
    )!;
    // px 差は 1 ピクセル以内
    expect(Math.abs(start.px - end.px)).toBeLessThan(1);
    // 画像中央 (final_width / 2 = 182) からも 1 ピクセル以内
    expect(Math.abs(start.px - 182)).toBeLessThan(1);
  });
});

describe('pointInPolygon', () => {
  it('detects a point inside a square polygon', () => {
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 0 },
    ];
    expect(pointInPolygon({ lat: 0.5, lng: 0.5 }, square)).toBe(true);
  });

  it('detects a point outside a square polygon', () => {
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 0 },
    ];
    expect(pointInPolygon({ lat: 2, lng: 2 }, square)).toBe(false);
  });

  it('returns false for polygon with fewer than 3 vertices', () => {
    expect(pointInPolygon({ lat: 0, lng: 0 }, [])).toBe(false);
    expect(pointInPolygon({ lat: 0, lng: 0 }, [{ lat: 0, lng: 0 }])).toBe(false);
    expect(
      pointInPolygon({ lat: 0, lng: 0 }, [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
      ]),
    ).toBe(false);
  });

  it('classifies the centroid of green_a as inside the green_a polygon', () => {
    const centroid = polygonCentroid(SHUNAN_HOLE1_GREEN_A);
    expect(pointInPolygon(centroid, SHUNAN_HOLE1_GREEN_A)).toBe(true);
  });

  it('classifies points far from green_a in all 4 directions as outside', () => {
    // green_a の中心は約 (34.04364, 131.96104) 付近。各方向に約 50m 離れた点。
    // 1 度 ≒ 111km なので 50m ≒ 0.00045 度
    const directions = [
      { name: 'north', point: { lat: 34.0445, lng: 131.96104 } },
      { name: 'south', point: { lat: 34.04275, lng: 131.96104 } },
      { name: 'east', point: { lat: 34.04364, lng: 131.9617 } },
      { name: 'west', point: { lat: 34.04364, lng: 131.96045 } },
    ];
    for (const { name, point } of directions) {
      expect(pointInPolygon(point, SHUNAN_HOLE1_GREEN_A), `${name} direction`).toBe(false);
    }
  });
});

describe('polygonCentroid', () => {
  it('returns origin for empty polygon', () => {
    expect(polygonCentroid([])).toEqual({ lat: 0, lng: 0 });
  });

  it('returns the single point for a 1-vertex "polygon"', () => {
    expect(polygonCentroid([{ lat: 5, lng: 10 }])).toEqual({ lat: 5, lng: 10 });
  });

  it('returns midpoint for a 2-vertex "polygon"', () => {
    expect(polygonCentroid([{ lat: 0, lng: 0 }, { lat: 2, lng: 4 }])).toEqual({ lat: 1, lng: 2 });
  });

  it('returns center of square for a 4-vertex square', () => {
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
    ];
    const c = polygonCentroid(square);
    expect(c.lat).toBeCloseTo(1, 10);
    expect(c.lng).toBeCloseTo(1, 10);
  });

  it('falls back to arithmetic mean for degenerate (collinear) polygon', () => {
    // 3 点が一直線上（面積 = 0）
    const collinear = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
    ];
    const c = polygonCentroid(collinear);
    expect(c.lat).toBeCloseTo(1, 10);
    expect(c.lng).toBeCloseTo(1, 10);
  });

  it('returns a centroid inside green_a (周南CC #1) polygon', () => {
    const centroid = polygonCentroid(SHUNAN_HOLE1_GREEN_A);
    expect(pointInPolygon(centroid, SHUNAN_HOLE1_GREEN_A)).toBe(true);
    // 重心はポリゴンの bbox 内にあるはず
    const lats = SHUNAN_HOLE1_GREEN_A.map((p) => p.lat);
    const lngs = SHUNAN_HOLE1_GREEN_A.map((p) => p.lng);
    expect(centroid.lat).toBeGreaterThan(Math.min(...lats));
    expect(centroid.lat).toBeLessThan(Math.max(...lats));
    expect(centroid.lng).toBeGreaterThan(Math.min(...lngs));
    expect(centroid.lng).toBeLessThan(Math.max(...lngs));
  });
});

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance({ lat: 34, lng: 131 }, { lat: 34, lng: 131 })).toBe(0);
  });

  it('returns a positive distance for distinct points', () => {
    const d = haversineDistance(SHUNAN_HOLE1_REF_START, SHUNAN_HOLE1_REF_END);
    // 周南CC #1 の ref_start 〜 ref_end は約 390m（パー4 の典型距離）
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(500);
  });
});

describe('calcMaxDistanceToPolygon', () => {
  it('returns 0 for empty polygon', () => {
    expect(calcMaxDistanceToPolygon({ lat: 34, lng: 131 }, [])).toBe(0);
  });

  it('returns the farthest vertex distance', () => {
    const point = { lat: 0, lng: 0 };
    const coords = [
      { lat: 0, lng: 0.0001 }, // 近い
      { lat: 0, lng: 0.001 }, // 遠い
      { lat: 0, lng: 0.0005 }, // 中間
    ];
    const max = calcMaxDistanceToPolygon(point, coords);
    const min = calcDistanceToPolygon(point, coords);
    expect(max).toBeGreaterThan(min);
    // 最遠の頂点 (0, 0.001) との haversine と一致
    expect(max).toBe(Math.round(haversineDistance(point, coords[1])));
  });

  it('returns the same value for min and max when polygon has one vertex', () => {
    const point = { lat: 34, lng: 131 };
    const coords = [{ lat: 34.001, lng: 131.001 }];
    expect(calcMaxDistanceToPolygon(point, coords)).toBe(calcDistanceToPolygon(point, coords));
  });

  it('returns realistic distance for 周南CC green polygon from ref_start', () => {
    const max = calcMaxDistanceToPolygon(SHUNAN_HOLE1_REF_START, SHUNAN_HOLE1_GREEN_A);
    // ref_start からグリーン最遠頂点までは数百メートル
    expect(max).toBeGreaterThan(100);
    expect(max).toBeLessThan(1000);
  });
});
