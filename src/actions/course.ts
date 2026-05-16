'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, db, type PoolClient } from '@/lib/db/neon';
import type { Course } from '@/features/course/types';
import { isValidUUID } from '@/lib/utils';

function parseOptionalInt(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const v = parseInt(raw, 10);
  return isNaN(v) ? null : v;
}

function validateOptionalInt(value: number | null, min: number, max: number, label: string): string | null {
  if (value !== null && (isNaN(value) || value < min || value > max)) {
    return `${label}は${min}〜${max}の範囲で入力してください。`;
  }
  return null;
}

function validateOptionalEnum(value: string | null, allowed: string[], label: string): string | null {
  if (value !== null && !allowed.includes(value)) {
    return `${label}の値が不正です。`;
  }
  return null;
}

function mapError(err: unknown, fallback: string): { error: string } {
  if (err instanceof Error && err.message.startsWith('unauthorized')) {
    return { error: 'ログインが必要です。' };
  }
  console.error(fallback, err);
  return { error: fallback };
}

export async function getSavedCourses(): Promise<Course[]> {
  try {
    return await requireUser(async () => {
      return db.read(async (client) => {
        const r = await client.query<Course>(
          `SELECT id, gora_id, name, prefecture, address, layout_url
             FROM courses
            ORDER BY name`,
        );
        return r.rows;
      });
    });
  } catch {
    return [];
  }
}

/**
 * GPS マップ機能（Sprint 5）が完全動作するコースの ID 集合を返す。
 * 18 ホール全てに hole_view_configs があり、各ホールに green_a/green_b の polygon があるコース。
 */
export async function getGpsReadyCourseIds(): Promise<Set<string>> {
  const result = new Set<string>();
  try {
    return await requireUser(async () => {
      return db.read(async (client) => {
        const r = await client.query<{ course_id: string; hole_count: string }>(
          `SELECT c.id AS course_id, COUNT(DISTINCT h.id)::text AS hole_count
             FROM courses c
             JOIN holes h ON h.course_id = c.id
             JOIN hole_view_configs hvc ON hvc.hole_id = h.id
             JOIN hole_areas ha ON ha.hole_id = h.id AND ha.area_type IN ('green_a', 'green_b')
           GROUP BY c.id
            HAVING COUNT(DISTINCT h.id) = 18`,
        );
        for (const row of r.rows) {
          result.add(row.course_id);
        }
        return result;
      });
    });
  } catch {
    return result;
  }
}

interface SaveCourseData {
  goraId: string;
  name: string;
  prefecture: string;
  address: string;
  imageUrl?: string;
}

export async function saveCourse(data: SaveCourseData): Promise<{ error?: string; courseId?: string }> {
  if (!data.goraId || !data.name) return { error: 'コース情報が不足しています。' };

  let courseId: string;
  try {
    courseId = await requireUser(async () => {
      return db.transaction(async (client) => {
        const existing = await client.query<{ id: string }>(
          'SELECT id FROM courses WHERE gora_id = $1',
          [data.goraId],
        );
        if (existing.rowCount && existing.rows[0]) {
          return existing.rows[0].id;
        }

        const r = await client.query<{ id: string }>(
          `INSERT INTO courses (gora_id, name, prefecture, address, layout_url)
             VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [data.goraId, data.name, data.prefecture, data.address, data.imageUrl ?? null],
        );
        return r.rows[0].id;
      });
    });
  } catch (err) {
    return mapError(err, 'コースの保存に失敗しました。');
  }

  revalidatePath('/courses');
  return { courseId };
}

export async function getCourseWithHoles(courseId: string) {
  if (!isValidUUID(courseId)) return { course: null, holes: [], holeNotes: [] };
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const [courseR, holesR, notesR] = await Promise.all([
          client.query<Course>('SELECT * FROM courses WHERE id = $1', [courseId]),
          client.query(
            'SELECT * FROM holes WHERE course_id = $1 ORDER BY hole_number',
            [courseId],
          ),
          client.query(
            `SELECT hn.id, hn.user_id, hn.hole_id, hn.note, hn.strategy
               FROM hole_notes hn
               JOIN holes h ON h.id = hn.hole_id
              WHERE hn.user_id = current_user_id()::uuid
                AND h.course_id = $1`,
            [courseId],
          ),
        ]);
        return {
          course: courseR.rows[0] as Course | undefined ?? null,
          holes: holesR.rows,
          holeNotes: notesR.rows,
        };
      });
    });
  } catch {
    return { course: null, holes: [], holeNotes: [] };
  }
}

async function upsertHoleInner(
  client: PoolClient,
  fields: {
    courseId: string;
    holeNumber: number;
    par: number;
    distance: number | null;
    hdcp: number | null;
    dogleg: string | null;
    elevation: string | null;
    distanceBack: number | null;
    distanceFront: number | null;
    distanceLadies: number | null;
    hazard: string | null;
    ob: string | null;
    description: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO holes (
        course_id, hole_number, par, distance, hdcp, dogleg, elevation,
        distance_back, distance_front, distance_ladies, hazard, ob, description
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (course_id, hole_number) DO UPDATE SET
        par = EXCLUDED.par,
        distance = EXCLUDED.distance,
        hdcp = EXCLUDED.hdcp,
        dogleg = EXCLUDED.dogleg,
        elevation = EXCLUDED.elevation,
        distance_back = EXCLUDED.distance_back,
        distance_front = EXCLUDED.distance_front,
        distance_ladies = EXCLUDED.distance_ladies,
        hazard = EXCLUDED.hazard,
        ob = EXCLUDED.ob,
        description = EXCLUDED.description`,
    [
      fields.courseId,
      fields.holeNumber,
      fields.par,
      fields.distance,
      fields.hdcp,
      fields.dogleg,
      fields.elevation,
      fields.distanceBack,
      fields.distanceFront,
      fields.distanceLadies,
      fields.hazard,
      fields.ob,
      fields.description,
    ],
  );
}

export async function upsertHole(formData: FormData): Promise<{ error?: string }> {
  const courseId = formData.get('course_id') as string;
  const holeNumberRaw = formData.get('hole_number') as string;
  const parRaw = formData.get('par') as string;
  const distanceRaw = formData.get('distance') as string;

  if (!courseId || !isValidUUID(courseId)) return { error: 'コースIDが不正です。' };

  const holeNumber = parseInt(holeNumberRaw, 10);
  if (isNaN(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    return { error: 'ホール番号は1〜18で入力してください。' };
  }

  const par = parseInt(parRaw, 10);
  if (isNaN(par) || par < 3 || par > 5) {
    return { error: 'Parは3〜5で入力してください。' };
  }

  const distance = distanceRaw ? parseInt(distanceRaw, 10) : null;
  if (distance !== null && (isNaN(distance) || distance < 0 || distance > 700)) {
    return { error: '距離は0〜700の範囲で入力してください。' };
  }

  const hdcp = parseOptionalInt(formData.get('hdcp') as string);
  const distanceBack = parseOptionalInt(formData.get('distance_back') as string);
  const distanceFront = parseOptionalInt(formData.get('distance_front') as string);
  const distanceLadies = parseOptionalInt(formData.get('distance_ladies') as string);
  const dogleg = (formData.get('dogleg') as string) || null;
  const elevation = (formData.get('elevation') as string) || null;

  const fieldError =
    validateOptionalInt(hdcp, 1, 18, 'HDCP') ??
    validateOptionalEnum(dogleg, ['straight', 'left', 'right'], 'ドッグレッグ') ??
    validateOptionalEnum(elevation, ['flat', 'uphill', 'downhill'], '高低差') ??
    validateOptionalInt(distanceBack, 0, 700, 'バックティー距離') ??
    validateOptionalInt(distanceFront, 0, 700, 'フロントティー距離') ??
    validateOptionalInt(distanceLadies, 0, 700, 'レディースティー距離');
  if (fieldError) return { error: fieldError };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await upsertHoleInner(client, {
          courseId,
          holeNumber,
          par,
          distance,
          hdcp,
          dogleg,
          elevation,
          distanceBack,
          distanceFront,
          distanceLadies,
          hazard: (formData.get('hazard') as string) || null,
          ob: (formData.get('ob') as string) || null,
          description: (formData.get('description') as string) || null,
        });
      });
    });
  } catch (err) {
    return mapError(err, 'ホール情報の保存に失敗しました。');
  }

  revalidatePath(`/courses/${courseId}`);
  return {};
}

export async function upsertHoleNote(formData: FormData): Promise<{ error?: string }> {
  const holeId = formData.get('hole_id') as string;
  if (!holeId || !isValidUUID(holeId)) return { error: 'ホールIDが必要です。' };

  let courseId: string | null = null;
  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await client.query(
          `INSERT INTO hole_notes (user_id, hole_id, note, strategy)
             VALUES (current_user_id()::uuid, $1, $2, $3)
             ON CONFLICT (user_id, hole_id) DO UPDATE SET
               note = EXCLUDED.note,
               strategy = EXCLUDED.strategy`,
          [
            holeId,
            (formData.get('note') as string) || null,
            (formData.get('strategy') as string) || null,
          ],
        );
        const r = await client.query<{ course_id: string }>(
          'SELECT course_id FROM holes WHERE id = $1',
          [holeId],
        );
        courseId = r.rows[0]?.course_id ?? null;
      });
    });
  } catch (err) {
    return mapError(err, 'メモの保存に失敗しました。');
  }

  if (courseId) {
    revalidatePath(`/courses/${courseId}`);
  }
  revalidatePath('/courses');
  return {};
}

interface HoleImportData {
  holeNumber: number;
  par: number;
  distance: number | null;
  hdcp: number | null;
  dogleg: string | null;
  elevation: string | null;
  distanceBack: number | null;
  distanceFront: number | null;
  distanceLadies: number | null;
  hazard: string | null;
  ob: string | null;
  description: string | null;
}

export async function importHoles(
  courseId: string,
  holes: HoleImportData[],
): Promise<{ error?: string }> {
  if (!isValidUUID(courseId)) return { error: 'コースIDが不正です。' };
  if (!Array.isArray(holes) || holes.length === 0) {
    return { error: 'ホールデータが必要です。' };
  }

  const seenHoles = new Set<number>();
  for (const h of holes) {
    if (!Number.isInteger(h.holeNumber) || h.holeNumber < 1 || h.holeNumber > 18) {
      return { error: `ホール番号が不正です: ${h.holeNumber}` };
    }
    if (seenHoles.has(h.holeNumber)) {
      return { error: `ホール${h.holeNumber}が重複しています。` };
    }
    seenHoles.add(h.holeNumber);

    const prefix = `ホール${h.holeNumber}: `;
    const holeError =
      validateOptionalInt(h.par, 3, 5, 'Par') ??
      validateOptionalInt(h.distance, 0, 700, '距離') ??
      validateOptionalInt(h.hdcp, 1, 18, 'HDCP') ??
      validateOptionalEnum(h.dogleg, ['straight', 'left', 'right'], 'ドッグレッグ') ??
      validateOptionalEnum(h.elevation, ['flat', 'uphill', 'downhill'], '高低差') ??
      validateOptionalInt(h.distanceBack, 0, 700, 'バックティー距離') ??
      validateOptionalInt(h.distanceFront, 0, 700, 'フロントティー距離') ??
      validateOptionalInt(h.distanceLadies, 0, 700, 'レディースティー距離');
    if (holeError) return { error: prefix + holeError };
  }

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        const c = await client.query<{ id: string }>('SELECT id FROM courses WHERE id = $1', [courseId]);
        if (c.rowCount === 0) {
          throw new Error('course_not_found');
        }
        for (const h of holes) {
          await upsertHoleInner(client, {
            courseId,
            holeNumber: h.holeNumber,
            par: h.par,
            distance: h.distance,
            hdcp: h.hdcp,
            dogleg: h.dogleg,
            elevation: h.elevation,
            distanceBack: h.distanceBack,
            distanceFront: h.distanceFront,
            distanceLadies: h.distanceLadies,
            hazard: h.hazard,
            ob: h.ob,
            description: h.description,
          });
        }
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'course_not_found') {
      return { error: 'コースが見つかりません。' };
    }
    return mapError(err, 'ホール情報のインポートに失敗しました。');
  }

  revalidatePath(`/courses/${courseId}`);
  return {};
}
