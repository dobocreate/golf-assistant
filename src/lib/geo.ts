export type PointKind = 'tee' | 'green' | 'hazard' | 'ob' | 'bunker' | 'water';

export const POINT_KIND_LABELS: Record<PointKind, string> = {
  tee: 'ティー',
  green: 'グリーン',
  hazard: 'ハザード',
  ob: 'OB',
  bunker: 'バンカー',
  water: '池',
};

export interface HoleMapPoint {
  id: string;
  hole_id: string;
  point_kind: PointKind;
  name: string;
  lat: number;
  lng: number;
  elevation_m: number | null;
  hsrc: string | null;
  is_tee_reference: boolean;
  sort_order: number;
}

export interface ElevationGridData {
  origin_lat: number;
  origin_lng: number;
  rows: number;
  cols: number;
  cell_size_m: number;
  elevations: number[];
  hsrc_summary: string;
}

export interface HoleElevationGrid {
  hole_id: string;
  bbox_min_lat: number;
  bbox_max_lat: number;
  bbox_min_lng: number;
  bbox_max_lng: number;
  grid_data: ElevationGridData;
  schema_version: number;
  fetched_at: string;
}

export interface HoleViewConfig {
  hole_id: string;
  ref_start_lat: number;
  ref_start_lng: number;
  ref_end_lat: number;
  ref_end_lng: number;
  object_key: string | null;
  object_key_gsi: string | null;
  cached_image_url: string | null;
  cached_image_url_gsi?: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AerialImageMetadata {
  bbox: {
    lat_min: number;
    lat_max: number;
    lng_min: number;
    lng_max: number;
  };
  pre_rotate_width: number;
  pre_rotate_height: number;
  rotated_width: number;
  rotated_height: number;
  final_width?: number;
  final_height?: number;
  bearing_rad: number;
  zoom: number;
}

export function parseAerialImageMetadata(json: unknown): AerialImageMetadata | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  const bbox = j['bbox'];
  if (!bbox || typeof bbox !== 'object') return null;
  const b = bbox as Record<string, unknown>;
  if (
    typeof b['lat_min'] !== 'number' || typeof b['lat_max'] !== 'number' ||
    typeof b['lng_min'] !== 'number' || typeof b['lng_max'] !== 'number' ||
    typeof j['pre_rotate_width'] !== 'number' || typeof j['pre_rotate_height'] !== 'number' ||
    typeof j['rotated_width'] !== 'number' || typeof j['rotated_height'] !== 'number' ||
    typeof j['bearing_rad'] !== 'number' || typeof j['zoom'] !== 'number'
  ) return null;
  return {
    bbox: {
      lat_min: b['lat_min'] as number,
      lat_max: b['lat_max'] as number,
      lng_min: b['lng_min'] as number,
      lng_max: b['lng_max'] as number,
    },
    pre_rotate_width: j['pre_rotate_width'] as number,
    pre_rotate_height: j['pre_rotate_height'] as number,
    rotated_width: j['rotated_width'] as number,
    rotated_height: j['rotated_height'] as number,
    final_width: typeof j['final_width'] === 'number' ? (j['final_width'] as number) : undefined,
    final_height: typeof j['final_height'] === 'number' ? (j['final_height'] as number) : undefined,
    bearing_rad: j['bearing_rad'] as number,
    zoom: j['zoom'] as number,
  };
}

export function latLngToPixel(
  lat: number,
  lng: number,
  metadata: AerialImageMetadata,
): { px: number; py: number } | null {
  const { bbox, pre_rotate_width, pre_rotate_height, rotated_width, rotated_height, bearing_rad } = metadata;
  const final_width = metadata.final_width ?? rotated_width;
  const final_height = metadata.final_height ?? rotated_height;

  if (pre_rotate_width === 0 || pre_rotate_height === 0) return null;
  if (rotated_width === 0 || rotated_height === 0) return null;
  if (bbox.lat_max === bbox.lat_min || bbox.lng_max === bbox.lng_min) return null;

  // lat/lng → pre-rotation pixel coordinates (y=0 at lat_max)
  const px_o = ((lng - bbox.lng_min) / (bbox.lng_max - bbox.lng_min)) * pre_rotate_width;
  const py_o = ((bbox.lat_max - lat) / (bbox.lat_max - bbox.lat_min)) * pre_rotate_height;

  // Shift origin to center of pre-rotation image
  const dx_o = px_o - pre_rotate_width / 2;
  const dy_o = py_o - pre_rotate_height / 2;

  // Rotate by -bearing to get rotated image coordinates
  const dx_r = dx_o * Math.cos(-bearing_rad) - dy_o * Math.sin(-bearing_rad);
  const dy_r = dx_o * Math.sin(-bearing_rad) + dy_o * Math.cos(-bearing_rad);

  // Shift to rotated bbox origin
  const px_rot = dx_r + rotated_width / 2;
  const py_rot = dy_r + rotated_height / 2;

  // Apply post-rotation crop offset to get final image coordinates
  return {
    px: px_rot - (rotated_width - final_width) / 2,
    py: py_rot - (rotated_height - final_height) / 2,
  };
}

/**
 * Inverse of latLngToPixel — convert pixel coordinates on the cropped/rotated
 * aerial image back to lat/lng.
 *
 * Synced from golf-course-mapper/src/lib/aerial-transform.ts (pixelToLatLng).
 * Returns null on invalid metadata (zero dimensions or zero-range bbox).
 */
export function pixelToLatLng(
  px: number,
  py: number,
  metadata: AerialImageMetadata,
): { lat: number; lng: number } | null {
  const { bbox, pre_rotate_width, pre_rotate_height, rotated_width, rotated_height, bearing_rad } = metadata;
  const final_width = metadata.final_width ?? rotated_width;
  const final_height = metadata.final_height ?? rotated_height;

  // 注: mapper 側 aerial-transform.ts の pixelToLatLng は pre_rotate_* と bbox しかガードしていないが、
  // assistant 側では rotated_* も含めて防御的にガードする（latLngToPixel と対称）。
  // 同期時はこの差を意図的なものとして残す。
  if (pre_rotate_width === 0 || pre_rotate_height === 0) return null;
  if (rotated_width === 0 || rotated_height === 0) return null;
  if (bbox.lat_max === bbox.lat_min || bbox.lng_max === bbox.lng_min) return null;

  // Step 1: undo post-rotation crop offset
  const px_rot = px + (rotated_width - final_width) / 2;
  const py_rot = py + (rotated_height - final_height) / 2;

  // Step 2: shift to rotated bbox center
  const dx_r = px_rot - rotated_width / 2;
  const dy_r = py_rot - rotated_height / 2;

  // Step 3: rotate by +bearing to undo
  const dx_o = dx_r * Math.cos(bearing_rad) - dy_r * Math.sin(bearing_rad);
  const dy_o = dx_r * Math.sin(bearing_rad) + dy_r * Math.cos(bearing_rad);

  // Step 4: shift back to pre-rotation image center
  const px_o = dx_o + pre_rotate_width / 2;
  const py_o = dy_o + pre_rotate_height / 2;

  // Step 5: pixel → lat/lng (y=0 corresponds to lat_max)
  const lng = bbox.lng_min + (px_o / pre_rotate_width) * (bbox.lng_max - bbox.lng_min);
  const lat = bbox.lat_max - (py_o / pre_rotate_height) * (bbox.lat_max - bbox.lat_min);

  return { lat, lng };
}

/**
 * Ray-casting point-in-polygon test using lat/lng coordinates.
 *
 * Treats lat as y, lng as x. Boundary points may be classified either way
 * (numeric edge cases). Callers needing exact boundary semantics should add
 * an epsilon-based check; for the golf-assistant use case, GPS accuracy
 * (5–15m) dominates any classification error from rounding.
 *
 * Polygon is treated as closed (first and last vertex are connected).
 * Returns false for polygons with fewer than 3 vertices.
 */
export function pointInPolygon(
  point: { lat: number; lng: number },
  polygon: { lat: number; lng: number }[],
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Compute the centroid of a polygon using the shoelace formula on lat/lng.
 *
 * Synced from golf-course-mapper/src/lib/geo.ts (polygonCentroid).
 * For polygons of typical golf course size, the planar approximation is
 * accurate to within a few centimeters.
 *
 * - 0 vertices → returns origin (0, 0)
 * - 1–2 vertices → returns arithmetic mean
 * - degenerate polygon (zero area) → falls back to arithmetic mean
 */
export function polygonCentroid(
  coords: { lat: number; lng: number }[],
): { lat: number; lng: number } {
  const n = coords.length;
  if (n === 0) return { lat: 0, lng: 0 };
  if (n < 3) {
    return {
      lat: coords.reduce((s, c) => s + c.lat, 0) / n,
      lng: coords.reduce((s, c) => s + c.lng, 0) / n,
    };
  }
  // 注: 命名規則は pointInPolygon と統一して x=lng, y=lat（Mercator 慣習）
  // mapper 側 polygonCentroid は (x=lat, y=lng) 命名だが、shoelace 公式は x/y 入れ替えに対し
  // 不変なので結果は同じ。ファイル内の命名一貫性を優先して assistant 側のみ標準化
  const lat0 = coords[0].lat;
  const lng0 = coords[0].lng;
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = coords[i].lng - lng0;
    const yi = coords[i].lat - lat0;
    const xj = coords[j].lng - lng0;
    const yj = coords[j].lat - lat0;
    const cross = xi * yj - xj * yi;
    area += cross;
    cx += (xi + xj) * cross;
    cy += (yi + yj) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    return {
      lat: coords.reduce((s, c) => s + c.lat, 0) / n,
      lng: coords.reduce((s, c) => s + c.lng, 0) / n,
    };
  }
  return { lat: lat0 + cy / (6 * area), lng: lng0 + cx / (6 * area) };
}

export type HoleAreaType =
  | 'ob_line'
  | 'bunker'
  | 'hazard'
  | 'green_a'
  | 'green_b'
  | 'water_pond'
  | 'water_river'
  | 'fairway';

export interface HoleArea {
  id: string;
  hole_id: string;
  area_type: HoleAreaType;
  coordinates: { lat: number; lng: number }[];
  name: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * コースがツーグリーン制かどうかを判定する。
 * A/B ペアが登録済みのホールが全ホールの過半数であればツーグリーン制とみなす。
 */
export function isTwoGreenCourse(areas: HoleArea[], holeIds: string[]): boolean {
  if (holeIds.length === 0) return false;
  const pairedCount = holeIds.filter(
    (id) =>
      areas.some((a) => a.hole_id === id && a.area_type === 'green_a') &&
      areas.some((a) => a.hole_id === id && a.area_type === 'green_b'),
  ).length;
  return pairedCount >= Math.ceil(holeIds.length / 2);
}

/**
 * Haversine distance in meters between two GPS points.
 */
export function haversineDistance(
  p1: { lat: number; lng: number },
  p2: { lat: number; lng: number },
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * ある点からポリゴン/ポリラインの最近接点までの距離（メートル）を返す。
 * coords が空の場合は Infinity を返す。
 * 注: 各頂点との最短距離を計算。辺の中点が最近接点の場合は実際の距離より大きくなる可能性があるが、AIアドバイス用概算として許容
 */
export function calcDistanceToPolygon(
  point: { lat: number; lng: number },
  coords: { lat: number; lng: number }[],
): number {
  if (coords.length === 0) return Infinity;
  let minDist = Infinity;
  for (const c of coords) {
    const d = haversineDistance(point, c);
    if (d < minDist) minDist = d;
  }
  return Math.round(minDist);
}

/**
 * Effective felt distance accounting for elevation change.
 * 1m of elevation change ≈ 1m of effective distance (linear approximation).
 * elevDiff = destination elevation - source elevation (positive = uphill).
 */
export function effectiveDistance(horizontal: number, elevDiff: number): number {
  // Linear approximation: 1m elevation change adds 1m to felt distance
  return horizontal + elevDiff;
}

/**
 * Bilinear interpolation of elevation from a grid at a specific GPS point.
 * Returns null if the point is outside the grid or if the grid is invalid.
 *
 * The grid is laid out row-major from origin_lat/origin_lng,
 * with cell_size_m spacing in both lat and lng directions.
 * Lat increases with row index; lng increases with col index.
 */
export function interpolateElevation(
  grid: ElevationGridData,
  lat: number,
  lng: number,
): number | null {
  const { origin_lat, origin_lng, rows, cols, cell_size_m, elevations } = grid;

  if (rows <= 0 || cols <= 0 || cell_size_m <= 0 || elevations.length !== rows * cols) {
    return null;
  }

  // Approximate degrees per meter at the given latitude
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((origin_lat * Math.PI) / 180);
  if (metersPerDegLng === 0) return null;

  // Grid cell size in degrees
  const cellDegLat = cell_size_m / metersPerDegLat;
  const cellDegLng = cell_size_m / metersPerDegLng;

  // Fractional row/col index from origin
  const col = (lng - origin_lng) / cellDegLng;
  const row = (lat - origin_lat) / cellDegLat;

  // Bounds check
  if (col < 0 || col > cols - 1 || row < 0 || row > rows - 1) {
    return null;
  }

  const col0 = Math.floor(col);
  const row0 = Math.floor(row);
  const col1 = Math.min(col0 + 1, cols - 1);
  const row1 = Math.min(row0 + 1, rows - 1);

  const dc = col - col0;
  const dr = row - row0;

  const e00 = elevations[row0 * cols + col0];
  const e01 = elevations[row0 * cols + col1];
  const e10 = elevations[row1 * cols + col0];
  const e11 = elevations[row1 * cols + col1];

  if (
    e00 === undefined ||
    e01 === undefined ||
    e10 === undefined ||
    e11 === undefined
  ) {
    return null;
  }

  // Bilinear interpolation
  const interpolated =
    e00 * (1 - dr) * (1 - dc) +
    e01 * (1 - dr) * dc +
    e10 * dr * (1 - dc) +
    e11 * dr * dc;

  return interpolated;
}
