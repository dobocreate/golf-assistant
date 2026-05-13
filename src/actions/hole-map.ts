'use server';

// hole_map_points and hole_elevation_grids use RLS policy "SELECT USING (true)"
// — readable by all, including unauthenticated requests via the anon key.
// Writes are only possible via service role key (golf-course-mapper admin tool).
// No auth check is needed here.

import { createClient } from '@/lib/supabase/server';
import type { HoleMapPoint, HoleElevationGrid, HoleViewConfig, HoleArea, AerialImageMetadata } from '@/lib/geo';

/**
 * mapper のセンターライン点 (`{ lat, lng }`)。
 * `hole_view_configs.centerline_json_a/b` に JSON 配列として保存される。
 * 2 点以上 (最初がティー、最後がグリーン、間に waypoint)。
 */
export interface CenterlinePoint {
  lat: number;
  lng: number;
}

/**
 * GPS マップ表示用データ。getHoleMapDataForRoundHole / ForCourseHole / AllForCourse の
 * 戻り値で共通利用する shape。client (use-hole-map-cache) 側でも同型を再宣言している。
 *
 * Sprint 7 PR1 (S-7a): 自動軌跡生成のためにセンターラインと参照点を追加
 *   - centerlineA / centerlineB: mapper の `centerline_json_a/b` (整備済み 15/18 ホール)
 *   - refStart / refEnd: 未整備ホールの fallback 用 (`hole_view_configs.ref_start_lat/lng` 等、全 18 整備済み)
 */
export interface HoleMapData {
  aerialImageUrl: string;
  metadata: AerialImageMetadata;
  areas: HoleArea[];
  centerlineA: CenterlinePoint[] | null;
  centerlineB: CenterlinePoint[] | null;
  refStart: CenterlinePoint | null;
  refEnd: CenterlinePoint | null;
}

/**
 * Get all map points for a course (joins holes to filter by course_id).
 * Used for preloading at round start or course detail display.
 * Ordered by hole_number then sort_order.
 */
export async function getMapPointsForCourse(courseId: string): Promise<HoleMapPoint[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('hole_map_points')
    .select('*, holes!inner(course_id, hole_number)')
    .eq('holes.course_id', courseId)
    .order('hole_number', { referencedTable: 'holes' })
    .order('sort_order');

  if (error) {
    console.error('Failed to fetch map points for course:', error.message);
    return [];
  }

  // Strip the joined holes column before returning — callers only need HoleMapPoint fields
  return (data ?? []).map(({ holes: _holes, ...point }) => point as HoleMapPoint);
}

/**
 * Get all elevation grids for a course.
 */
export async function getElevationGridsForCourse(courseId: string): Promise<HoleElevationGrid[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('hole_elevation_grids')
    .select('*, holes!inner(course_id)')
    .eq('holes.course_id', courseId);

  if (error) {
    console.error('Failed to fetch elevation grids for course:', error.message);
    return [];
  }

  return (data ?? []).map(({ holes: _holes, ...grid }) => grid as HoleElevationGrid);
}

/**
 * Get map points for a single hole (for course detail page display).
 * Ordered by sort_order.
 */
export async function getMapPointsForHole(holeId: string): Promise<HoleMapPoint[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('hole_map_points')
    .select('*')
    .eq('hole_id', holeId)
    .order('sort_order');

  if (error) {
    console.error('Failed to fetch map points for hole:', error.message);
    return [];
  }

  return (data ?? []) as HoleMapPoint[];
}

/**
 * Get hole_view_configs for all holes in a course.
 * Returns a plain object keyed by hole_id (serializable for Server → Client Component passing).
 */
export async function getHoleViewConfigsForCourse(
  courseId: string,
): Promise<Record<string, HoleViewConfig>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('hole_view_configs')
    .select('*, holes!inner(course_id)')
    .eq('holes.course_id', courseId);

  if (error) {
    console.error('Failed to fetch hole view configs for course:', error.message);
    return {};
  }

  const result: Record<string, HoleViewConfig> = {};
  for (const row of data ?? []) {
    const { holes: _holes, ...config } = row;
    result[config.hole_id] = config as HoleViewConfig;
  }
  return result;
}

/**
 * Get all hole_areas for a course (joins holes to filter by course_id).
 * Returns a flat array; callers group by hole_id as needed.
 */
export async function getHoleAreasForCourse(courseId: string): Promise<HoleArea[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('hole_areas')
    .select('*, holes!inner(course_id, hole_number)')
    .eq('holes.course_id', courseId)
    .order('hole_number', { referencedTable: 'holes' })
    .order('sort_order');

  if (error) {
    console.error('Failed to fetch hole areas for course:', error.message);
    return [];
  }

  return (data ?? []).map(({ holes: _holes, ...area }) => area as HoleArea);
}

/**
 * 指定ラウンド・ホールの GPS マップ表示用データを 1 クエリで返す
 *
 * Sprint 5 PR6 (S-5a / S-5d) — ShotPositionRecorder 内の小型プレビュー、
 * および手動ピン留めモーダル用にホール画像 + メタデータ + areas を取得する。
 *
 * GPS-ready でないホール（hole_view_configs / metadata なし）は null を返し、
 * 呼び出し側でプレビュー UI 自体を非表示にする。
 *
 * 認証チェックなし（hole_* テーブルは public 読み取り可。コース・ラウンドの
 * 所有確認は GPS 操作の前段（ShotForm 表示権限）で既に済んでいる前提）。
 *
 * Sprint 5 PR10 (S-5e) で `getHoleMapDataAllForCourse` + `HoleMapCacheProvider` を
 * 導入し、N+1 問題は解消済み。本関数は cache miss 時の fallback として残置。
 */
export async function getHoleMapDataForRoundHole(
  roundId: string,
  holeNumber: number,
): Promise<HoleMapData | null> {
  // UUID 形式チェック（debugability のため、不正な roundId を Supabase に渡す前に弾く）
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(roundId)) return null;
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) return null;

  const supabase = await createClient();

  // round → course_id → hole_id を 1 クエリで取得
  const { data: round } = await supabase
    .from('rounds')
    .select('course_id')
    .eq('id', roundId)
    .single();
  if (!round) return null;

  const { data: hole } = await supabase
    .from('holes')
    .select('id')
    .eq('course_id', round.course_id)
    .eq('hole_number', holeNumber)
    .single();
  if (!hole) return null;

  // view_config + areas を並列取得
  // Sprint 7 PR1 (S-7a): centerline / ref_start/end も取得
  const [{ data: vc }, { data: areasData }] = await Promise.all([
    supabase
      .from('hole_view_configs')
      .select('cached_image_url, metadata_json, centerline_json_a, centerline_json_b, ref_start_lat, ref_start_lng, ref_end_lat, ref_end_lng')
      .eq('hole_id', hole.id)
      .single(),
    supabase
      .from('hole_areas')
      .select('*')
      .eq('hole_id', hole.id)
      .order('sort_order'),
  ]);

  if (!vc || !vc.cached_image_url) return null;

  const { parseAerialImageMetadata } = await import('@/lib/geo');
  const metadata = parseAerialImageMetadata(vc.metadata_json);
  if (!metadata) return null;

  return {
    aerialImageUrl: vc.cached_image_url,
    metadata,
    areas: (areasData ?? []) as HoleArea[],
    centerlineA: parseCenterlineJson(vc.centerline_json_a),
    centerlineB: parseCenterlineJson(vc.centerline_json_b),
    refStart: parseRefPoint(vc.ref_start_lat, vc.ref_start_lng),
    refEnd: parseRefPoint(vc.ref_end_lat, vc.ref_end_lng),
  };
}

/**
 * 緯度経度の妥当性チェック。WGS84 範囲 (-90..90 / -180..180) + 有限値。
 */
function isValidLatLng(lat: number, lng: number): boolean {
  if (!isFinite(lat) || !isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

/**
 * unknown 入力を lat/lng の number ペアに正規化 (DB の numeric が string で返るケースも吸収)。
 */
function toLatLngNumber(latRaw: unknown, lngRaw: unknown): { lat: number; lng: number } | null {
  // null/undefined を先に弾く (Number(null) === 0 罠回避)
  if (latRaw == null || lngRaw == null) return null;
  const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
  const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
  if (!isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

/**
 * Sprint 7 PR1: mapper の `centerline_json_a/b` (JSON 配列) を CenterlinePoint[] にパース。
 * 不正な形 (lat/lng が number / 数値文字列でない、範囲外) はスキップ。空配列や null は null を返す。
 * 結果が 2 点未満なら null (centerline として使えない)。
 */
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

/**
 * Sprint 7 PR1: `ref_start_lat/lng` (numeric) を CenterlinePoint にパース。
 * いずれかが null/NaN/範囲外 なら null。
 */
function parseRefPoint(latRaw: unknown, lngRaw: unknown): CenterlinePoint | null {
  return toLatLngNumber(latRaw, lngRaw);
}

/**
 * 指定コース・ホールの GPS マップ表示用データを 1 クエリで返す
 *
 * Sprint 5 PR8 (S-6a) — `/rounds/[roundId]` からは round 経由ではなく
 * course_id を直接渡して呼ぶ。`getHoleMapDataForRoundHole` の course 版。
 */
export async function getHoleMapDataForCourseHole(
  courseId: string,
  holeNumber: number,
): Promise<HoleMapData | null> {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(courseId)) return null;
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) return null;

  const supabase = await createClient();

  const { data: hole } = await supabase
    .from('holes')
    .select('id')
    .eq('course_id', courseId)
    .eq('hole_number', holeNumber)
    .single();
  if (!hole) return null;

  const [{ data: vc }, { data: areasData }] = await Promise.all([
    supabase
      .from('hole_view_configs')
      .select('cached_image_url, metadata_json, centerline_json_a, centerline_json_b, ref_start_lat, ref_start_lng, ref_end_lat, ref_end_lng')
      .eq('hole_id', hole.id)
      .single(),
    supabase
      .from('hole_areas')
      .select('*')
      .eq('hole_id', hole.id)
      .order('sort_order'),
  ]);

  if (!vc || !vc.cached_image_url) return null;

  const { parseAerialImageMetadata } = await import('@/lib/geo');
  const metadata = parseAerialImageMetadata(vc.metadata_json);
  if (!metadata) return null;

  return {
    aerialImageUrl: vc.cached_image_url,
    metadata,
    areas: (areasData ?? []) as HoleArea[],
    centerlineA: parseCenterlineJson(vc.centerline_json_a),
    centerlineB: parseCenterlineJson(vc.centerline_json_b),
    refStart: parseRefPoint(vc.ref_start_lat, vc.ref_start_lng),
    refEnd: parseRefPoint(vc.ref_end_lat, vc.ref_end_lng),
  };
}

/**
 * 全ホールの map data エントリ（client serialize 安全な形）
 * Server Action の戻り値は plain object/array に限定（Map は serialize されない）
 */
export type HoleMapDataEntry = HoleMapData & { holeNumber: number };

/**
 * 指定コースの全ホールについて GPS マップ表示用データを 3 クエリで一括取得
 *
 * Sprint 5 PR10 (S-5e) — ホール切替ごとの 4 query × N ホール (N+1 問題) を
 * ラウンド開始時の 3 query にまとめてクライアントキャッシュさせる最適化。
 *
 * 戻り値: HoleMapDataEntry[]（GPS-ready なホールのみ、hole_number 順）
 *   - hole_view_configs.cached_image_url が NULL のホールは含まれない
 *   - metadata_json が parse できないホールも含まれない
 *
 * 認証チェックなし（hole_* テーブルは public 読み取り可）。
 */
export async function getHoleMapDataAllForCourse(
  courseId: string,
): Promise<HoleMapDataEntry[]> {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(courseId)) return [];

  const supabase = await createClient();

  // 3 クエリ並列: holes (hole_id → hole_number) / hole_view_configs / hole_areas
  const [holesResult, vcResult, areasResult] = await Promise.all([
    supabase
      .from('holes')
      .select('id, hole_number')
      .eq('course_id', courseId),
    supabase
      .from('hole_view_configs')
      .select('hole_id, cached_image_url, metadata_json, centerline_json_a, centerline_json_b, ref_start_lat, ref_start_lng, ref_end_lat, ref_end_lng, holes!inner(course_id)')
      .eq('holes.course_id', courseId),
    supabase
      .from('hole_areas')
      .select('*, holes!inner(course_id)')
      .eq('holes.course_id', courseId)
      .order('sort_order'),
  ]);

  // 既存関数と同様、エラー時はログ出力してから空集合に縮退（プレビュー非表示で続行）
  if (holesResult.error) console.error('Failed to fetch holes for course:', holesResult.error.message);
  if (vcResult.error) console.error('Failed to fetch hole_view_configs for course:', vcResult.error.message);
  if (areasResult.error) console.error('Failed to fetch hole_areas for course:', areasResult.error.message);

  const holes = (holesResult.data ?? []) as Array<{ id: string; hole_number: number }>;
  if (holes.length === 0) return [];

  // hole_id → hole_number の lookup
  const holeIdToNumber = new Map<string, number>();
  for (const h of holes) holeIdToNumber.set(h.id, h.hole_number);

  // hole_id → areas[] のグループ化（join 用 holes フィールドは除去）
  const areasByHoleId = new Map<string, HoleArea[]>();
  for (const row of (areasResult.data ?? []) as Array<HoleArea & { holes?: unknown }>) {
    const { holes: _holes, ...area } = row;
    const arr = areasByHoleId.get(area.hole_id) ?? [];
    arr.push(area as HoleArea);
    areasByHoleId.set(area.hole_id, arr);
  }

  const { parseAerialImageMetadata } = await import('@/lib/geo');

  // hole_view_configs を hole_number に紐付けて entry を構築
  type VcRow = {
    hole_id: string;
    cached_image_url: string | null;
    metadata_json: unknown;
    centerline_json_a: unknown;
    centerline_json_b: unknown;
    ref_start_lat: unknown;
    ref_start_lng: unknown;
    ref_end_lat: unknown;
    ref_end_lng: unknown;
  };
  const entries: HoleMapDataEntry[] = [];
  for (const vc of (vcResult.data ?? []) as VcRow[]) {
    if (!vc.cached_image_url) continue;
    const metadata = parseAerialImageMetadata(vc.metadata_json);
    if (!metadata) continue;
    const holeNumber = holeIdToNumber.get(vc.hole_id);
    if (holeNumber == null) continue;
    entries.push({
      holeNumber,
      aerialImageUrl: vc.cached_image_url,
      metadata,
      areas: areasByHoleId.get(vc.hole_id) ?? [],
      centerlineA: parseCenterlineJson(vc.centerline_json_a),
      centerlineB: parseCenterlineJson(vc.centerline_json_b),
      refStart: parseRefPoint(vc.ref_start_lat, vc.ref_start_lng),
      refEnd: parseRefPoint(vc.ref_end_lat, vc.ref_end_lng),
    });
  }

  // hole_number 順にソート（クライアント表示順の安定化）
  entries.sort((a, b) => a.holeNumber - b.holeNumber);
  return entries;
}
