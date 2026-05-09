'use server';

// hole_map_points and hole_elevation_grids use RLS policy "SELECT USING (true)"
// — readable by all, including unauthenticated requests via the anon key.
// Writes are only possible via service role key (golf-course-mapper admin tool).
// No auth check is needed here.

import { createClient } from '@/lib/supabase/server';
import type { HoleMapPoint, HoleElevationGrid, HoleViewConfig, HoleArea } from '@/lib/geo';

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
 * TODO(PR7+, S-5e): ホール切替ごとにこの 4 クエリが走るため、ラウンド開始時に
 * 全 18 ホール分をプリフェッチしてクライアント側でキャッシュする最適化を検討。
 */
export async function getHoleMapDataForRoundHole(
  roundId: string,
  holeNumber: number,
): Promise<{
  aerialImageUrl: string;
  metadata: import('@/lib/geo').AerialImageMetadata;
  areas: HoleArea[];
} | null> {
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
  const [{ data: vc }, { data: areasData }] = await Promise.all([
    supabase
      .from('hole_view_configs')
      .select('cached_image_url, metadata_json')
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
  };
}
