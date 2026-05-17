'use server';

// hole_map_points / hole_elevation_grids / hole_view_configs / hole_areas は
// public 読み取り可能なテーブル（mapper が書き込み、アプリは read のみ）。
// 認証チェック不要のため db.read (assistant_app_readonly) を使う。

import { db } from '@/lib/db/neon';
import { buildR2PublicUrl } from '@/lib/r2';
import type {
  HoleMapPoint,
  HoleElevationGrid,
  HoleViewConfig,
  HoleArea,
  AerialImageMetadata,
} from '@/lib/geo';

export interface CenterlinePoint {
  lat: number;
  lng: number;
}

export interface HoleMapData {
  aerialImageUrl: string;
  metadata: AerialImageMetadata;
  areas: HoleArea[];
  centerlineA: CenterlinePoint[] | null;
  centerlineB: CenterlinePoint[] | null;
  refStart: CenterlinePoint | null;
  refEnd: CenterlinePoint | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getMapPointsForCourse(courseId: string): Promise<HoleMapPoint[]> {
  if (!UUID_RE.test(courseId)) return [];
  try {
    return await db.read(async (client) => {
      const r = await client.query<HoleMapPoint>(
        `SELECT mp.*
           FROM hole_map_points mp
           JOIN holes h ON h.id = mp.hole_id
          WHERE h.course_id = $1
          ORDER BY h.hole_number, mp.sort_order`,
        [courseId],
      );
      return r.rows;
    });
  } catch (err) {
    console.error('Failed to fetch map points for course:', err);
    return [];
  }
}

export async function getElevationGridsForCourse(courseId: string): Promise<HoleElevationGrid[]> {
  if (!UUID_RE.test(courseId)) return [];
  try {
    return await db.read(async (client) => {
      const r = await client.query<HoleElevationGrid>(
        `SELECT eg.*
           FROM hole_elevation_grids eg
           JOIN holes h ON h.id = eg.hole_id
          WHERE h.course_id = $1`,
        [courseId],
      );
      return r.rows;
    });
  } catch (err) {
    console.error('Failed to fetch elevation grids for course:', err);
    return [];
  }
}

export async function getMapPointsForHole(holeId: string): Promise<HoleMapPoint[]> {
  if (!UUID_RE.test(holeId)) return [];
  try {
    return await db.read(async (client) => {
      const r = await client.query<HoleMapPoint>(
        'SELECT * FROM hole_map_points WHERE hole_id = $1 ORDER BY sort_order',
        [holeId],
      );
      return r.rows;
    });
  } catch (err) {
    console.error('Failed to fetch map points for hole:', err);
    return [];
  }
}

export async function getHoleViewConfigsForCourse(
  courseId: string,
): Promise<Record<string, HoleViewConfig>> {
  if (!UUID_RE.test(courseId)) return {};
  try {
    return await db.read(async (client) => {
      const r = await client.query<HoleViewConfig>(
        `SELECT vc.*
           FROM hole_view_configs vc
           JOIN holes h ON h.id = vc.hole_id
          WHERE h.course_id = $1`,
        [courseId],
      );
      const result: Record<string, HoleViewConfig> = {};
      for (const config of r.rows) {
        result[config.hole_id] = {
          ...config,
          aerial_image_url: buildR2PublicUrl(config.object_key),
        };
      }
      return result;
    });
  } catch (err) {
    console.error('Failed to fetch hole view configs for course:', err);
    return {};
  }
}

export async function getHoleAreasForCourse(courseId: string): Promise<HoleArea[]> {
  if (!UUID_RE.test(courseId)) return [];
  try {
    return await db.read(async (client) => {
      const r = await client.query<HoleArea>(
        `SELECT ha.*
           FROM hole_areas ha
           JOIN holes h ON h.id = ha.hole_id
          WHERE h.course_id = $1
          ORDER BY h.hole_number, ha.sort_order`,
        [courseId],
      );
      return r.rows;
    });
  } catch (err) {
    console.error('Failed to fetch hole areas for course:', err);
    return [];
  }
}

function isValidLatLng(lat: number, lng: number): boolean {
  if (!isFinite(lat) || !isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

function toLatLngNumber(latRaw: unknown, lngRaw: unknown): { lat: number; lng: number } | null {
  if (latRaw == null || lngRaw == null) return null;
  const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
  const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
  if (!isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

function parseCenterlineJson(raw: unknown): CenterlinePoint[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const result: CenterlinePoint[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const point = toLatLngNumber(obj.lat, obj.lng);
      if (point) result.push(point);
    }
  }
  return result.length >= 2 ? result : null;
}

function parseRefPoint(latRaw: unknown, lngRaw: unknown): CenterlinePoint | null {
  return toLatLngNumber(latRaw, lngRaw);
}

const VC_COLUMNS =
  'object_key, metadata_json, centerline_json_a, centerline_json_b, ref_start_lat, ref_start_lng, ref_end_lat, ref_end_lng';

interface VcRow {
  object_key: string | null;
  metadata_json: unknown;
  centerline_json_a: unknown;
  centerline_json_b: unknown;
  ref_start_lat: unknown;
  ref_start_lng: unknown;
  ref_end_lat: unknown;
  ref_end_lng: unknown;
}

async function buildHoleMapData(
  vc: VcRow | undefined,
  areas: HoleArea[],
): Promise<HoleMapData | null> {
  if (!vc) return null;
  const aerialImageUrl = buildR2PublicUrl(vc.object_key);
  if (!aerialImageUrl) return null;
  const { parseAerialImageMetadata } = await import('@/lib/geo');
  const metadata = parseAerialImageMetadata(vc.metadata_json);
  if (!metadata) return null;
  return {
    aerialImageUrl,
    metadata,
    areas,
    centerlineA: parseCenterlineJson(vc.centerline_json_a),
    centerlineB: parseCenterlineJson(vc.centerline_json_b),
    refStart: parseRefPoint(vc.ref_start_lat, vc.ref_start_lng),
    refEnd: parseRefPoint(vc.ref_end_lat, vc.ref_end_lng),
  };
}

export async function getHoleMapDataForRoundHole(
  roundId: string,
  holeNumber: number,
): Promise<HoleMapData | null> {
  if (!UUID_RE.test(roundId)) return null;
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) return null;

  try {
    const result = await db.read(async (client) => {
      const roundR = await client.query<{ course_id: string }>(
        'SELECT course_id FROM rounds WHERE id = $1',
        [roundId],
      );
      const round = roundR.rows[0];
      if (!round) return null;

      const holeR = await client.query<{ id: string }>(
        'SELECT id FROM holes WHERE course_id = $1 AND hole_number = $2',
        [round.course_id, holeNumber],
      );
      if (holeR.rowCount === 0) return null;
      const holeId = holeR.rows[0].id;

      const [vcR, areasR] = await Promise.all([
        client.query<VcRow>(
          `SELECT ${VC_COLUMNS} FROM hole_view_configs WHERE hole_id = $1`,
          [holeId],
        ),
        client.query<HoleArea>(
          'SELECT * FROM hole_areas WHERE hole_id = $1 ORDER BY sort_order',
          [holeId],
        ),
      ]);
      return { vc: vcR.rows[0], areas: areasR.rows };
    });
    if (!result) return null;
    return await buildHoleMapData(result.vc, result.areas);
  } catch (err) {
    console.error('getHoleMapDataForRoundHole failed:', err);
    return null;
  }
}

export async function getHoleMapDataForCourseHole(
  courseId: string,
  holeNumber: number,
): Promise<HoleMapData | null> {
  if (!UUID_RE.test(courseId)) return null;
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) return null;

  try {
    const result = await db.read(async (client) => {
      const holeR = await client.query<{ id: string }>(
        'SELECT id FROM holes WHERE course_id = $1 AND hole_number = $2',
        [courseId, holeNumber],
      );
      if (holeR.rowCount === 0) return null;
      const holeId = holeR.rows[0].id;

      const [vcR, areasR] = await Promise.all([
        client.query<VcRow>(
          `SELECT ${VC_COLUMNS} FROM hole_view_configs WHERE hole_id = $1`,
          [holeId],
        ),
        client.query<HoleArea>(
          'SELECT * FROM hole_areas WHERE hole_id = $1 ORDER BY sort_order',
          [holeId],
        ),
      ]);
      return { vc: vcR.rows[0], areas: areasR.rows };
    });
    if (!result) return null;
    return await buildHoleMapData(result.vc, result.areas);
  } catch (err) {
    console.error('getHoleMapDataForCourseHole failed:', err);
    return null;
  }
}

export type HoleMapDataEntry = HoleMapData & { holeNumber: number };

export async function getHoleMapDataAllForCourse(
  courseId: string,
): Promise<HoleMapDataEntry[]> {
  if (!UUID_RE.test(courseId)) return [];

  try {
    const { holes, vcs, areas } = await db.read(async (client) => {
      const [holesR, vcsR, areasR] = await Promise.all([
        client.query<{ id: string; hole_number: number }>(
          'SELECT id, hole_number FROM holes WHERE course_id = $1',
          [courseId],
        ),
        client.query<VcRow & { hole_id: string }>(
          `SELECT vc.hole_id, ${VC_COLUMNS.split(', ').map((c) => `vc.${c}`).join(', ')}
             FROM hole_view_configs vc
             JOIN holes h ON h.id = vc.hole_id
            WHERE h.course_id = $1`,
          [courseId],
        ),
        client.query<HoleArea>(
          `SELECT ha.*
             FROM hole_areas ha
             JOIN holes h ON h.id = ha.hole_id
            WHERE h.course_id = $1
            ORDER BY ha.sort_order`,
          [courseId],
        ),
      ]);
      return { holes: holesR.rows, vcs: vcsR.rows, areas: areasR.rows };
    });

    if (holes.length === 0) return [];

    const holeIdToNumber = new Map<string, number>();
    for (const h of holes) holeIdToNumber.set(h.id, h.hole_number);

    const areasByHoleId = new Map<string, HoleArea[]>();
    for (const area of areas) {
      const arr = areasByHoleId.get(area.hole_id) ?? [];
      arr.push(area);
      areasByHoleId.set(area.hole_id, arr);
    }

    const { parseAerialImageMetadata } = await import('@/lib/geo');
    const entries: HoleMapDataEntry[] = [];
    for (const vc of vcs) {
      const aerialImageUrl = buildR2PublicUrl(vc.object_key);
      if (!aerialImageUrl) continue;
      const metadata = parseAerialImageMetadata(vc.metadata_json);
      if (!metadata) continue;
      const holeNumber = holeIdToNumber.get(vc.hole_id);
      if (holeNumber == null) continue;
      entries.push({
        holeNumber,
        aerialImageUrl,
        metadata,
        areas: areasByHoleId.get(vc.hole_id) ?? [],
        centerlineA: parseCenterlineJson(vc.centerline_json_a),
        centerlineB: parseCenterlineJson(vc.centerline_json_b),
        refStart: parseRefPoint(vc.ref_start_lat, vc.ref_start_lng),
        refEnd: parseRefPoint(vc.ref_end_lat, vc.ref_end_lng),
      });
    }

    entries.sort((a, b) => a.holeNumber - b.holeNumber);
    return entries;
  } catch (err) {
    console.error('getHoleMapDataAllForCourse failed:', err);
    return [];
  }
}
