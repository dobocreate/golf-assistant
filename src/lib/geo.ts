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

  if (rows <= 0 || cols <= 0 || elevations.length !== rows * cols) {
    return null;
  }

  // Approximate degrees per meter at the given latitude
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((origin_lat * Math.PI) / 180);

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
