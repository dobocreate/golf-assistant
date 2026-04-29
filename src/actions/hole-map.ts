'use server';

// hole_map_points and hole_elevation_grids use RLS policy "SELECT USING (true)"
// — readable by all, including unauthenticated requests via the anon key.
// Writes are only possible via service role key (golf-course-mapper admin tool).
// No auth check is needed here.

import { createClient } from '@/lib/supabase/server';
import type { HoleMapPoint, HoleElevationGrid } from '@/lib/geo';

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
