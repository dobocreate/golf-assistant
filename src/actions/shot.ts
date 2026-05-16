'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, db, type PoolClient } from '@/lib/db/neon';
import type {
  Shot,
  ShotResult,
  DirectionLR,
  DirectionFB,
  ShotLie,
  ShotSlopeFB,
  ShotSlopeLR,
  ShotLanding,
  ShotElevation,
  AdviceHistoryItem,
  ShotType,
} from '@/features/score/types';
import { isValidUUID } from '@/lib/utils';
import {
  VALID_LIES,
  VALID_SLOPE_FB,
  VALID_SLOPE_LR,
  VALID_SHOT_TYPES,
  VALID_ELEVATIONS,
  SHOT_NOTE_MAX_LENGTH,
} from '@/lib/golf-constants';

const VALID_RESULTS: ShotResult[] = ['excellent', 'good', 'fair', 'poor'];
const VALID_MISS_TYPES = ['フック', 'スライス', 'ダフリ', 'トップ', 'シャンク'];
const VALID_DIRECTION_LR: DirectionLR[] = ['left', 'center', 'right'];
const VALID_DIRECTION_FB: DirectionFB[] = ['short', 'center', 'long'];
const VALID_LANDINGS: ShotLanding[] = ['ob', 'water', 'bunker'];

function validateShotFields(data: {
  club?: string | null;
  result: ShotResult | null;
  missType: string | null;
  directionLr: string | null;
  directionFb: string | null;
  lie: string | null;
  slopeFb: string | null;
  slopeLr: string | null;
  landing: string | null;
  shotType?: string | null;
  remainingDistance?: number | null;
  elevation?: string | null;
}): string | null {
  if (data.club !== undefined && data.club !== null && (typeof data.club !== 'string' || data.club.length > 20)) {
    return 'クラブ名が不正です。';
  }
  if (data.result !== null && !VALID_RESULTS.includes(data.result)) {
    return 'ショット結果が不正です。';
  }
  if (data.missType !== null && !VALID_MISS_TYPES.includes(data.missType)) {
    return 'ミスタイプが不正です。';
  }
  if (data.directionLr !== null && !VALID_DIRECTION_LR.includes(data.directionLr as DirectionLR)) {
    return '左右方向が不正です。';
  }
  if (data.directionFb !== null && !VALID_DIRECTION_FB.includes(data.directionFb as DirectionFB)) {
    return '前後方向が不正です。';
  }
  if (data.lie !== null && !VALID_LIES.includes(data.lie as ShotLie)) {
    return 'ライが不正です。';
  }
  if (data.slopeFb !== null && !VALID_SLOPE_FB.includes(data.slopeFb as ShotSlopeFB)) {
    return '前後傾斜が不正です。';
  }
  if (data.slopeLr !== null && !VALID_SLOPE_LR.includes(data.slopeLr as ShotSlopeLR)) {
    return '左右傾斜が不正です。';
  }
  if (data.landing !== null && !VALID_LANDINGS.includes(data.landing as ShotLanding)) {
    return '着地状況が不正です。';
  }
  if (data.shotType != null && !VALID_SHOT_TYPES.includes(data.shotType as ShotType)) {
    return 'ショット種別が不正です。';
  }
  if (data.remainingDistance != null && (!Number.isInteger(data.remainingDistance) || data.remainingDistance < 0 || data.remainingDistance > 700)) {
    return '残り距離が不正です。';
  }
  if (data.elevation != null && !VALID_ELEVATIONS.includes(data.elevation as ShotElevation)) {
    return '高低差が不正です。';
  }
  return null;
}

async function assertRoundOwned(
  client: PoolClient,
  roundId: string,
  options?: { statusFilter?: 'in_progress' | 'completed' },
): Promise<void> {
  let sql =
    'SELECT id FROM rounds WHERE id = $1 AND user_id = current_user_id()::uuid';
  const params: unknown[] = [roundId];
  if (options?.statusFilter) {
    sql += ' AND status = $2';
    params.push(options.statusFilter);
  }
  const r = await client.query<{ id: string }>(sql, params);
  if (r.rowCount === 0) {
    throw new Error('round_not_found');
  }
}

function mapError(err: unknown, fallback: string): { error: string } {
  if (err instanceof Error) {
    if (err.message === 'round_not_found') return { error: 'ラウンドが見つかりません。' };
    if (err.message.startsWith('unauthorized')) return { error: 'ログインが必要です。' };
  }
  console.error(fallback, err);
  return { error: fallback };
}

export async function recordShot(data: {
  roundId: string;
  holeNumber: number;
  shotNumber: number;
  club: string | null;
  result: ShotResult | null;
  missType: string | null;
  directionLr: string | null;
  directionFb: string | null;
  lie: string | null;
  slopeFb: string | null;
  slopeLr: string | null;
  landing: string | null;
  shotType: string | null;
  remainingDistance: number | null;
  note?: string | null;
  elevation?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gpsAccuracyM?: number | null;
  capturedAt?: string | null;
  autoLie?: string | null;
  remainingToGreenM?: number | null;
  gpsSource?: string | null;
  autoLieConfidence?: string | null;
  autoLieCalculatedAt?: string | null;
}): Promise<{ error?: string; shot?: Shot }> {
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }
  if (!Number.isInteger(data.shotNumber) || data.shotNumber < 1 || data.shotNumber > 20) {
    return { error: 'ショット番号が不正です。' };
  }

  const validationError = validateShotFields(data);
  if (validationError) return { error: validationError };

  const note = data.note?.trim() || null;
  if (note !== null && note.length > SHOT_NOTE_MAX_LENGTH) {
    return { error: `メモは${SHOT_NOTE_MAX_LENGTH}文字以内で入力してください。` };
  }

  let shot: Shot;
  try {
    shot = await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, data.roundId, { statusFilter: 'in_progress' });

        const r = await client.query<Shot>(
          `INSERT INTO shots (
              round_id, hole_number, shot_number, club, result, miss_type,
              direction_lr, direction_fb, lie, slope_fb, slope_lr, landing,
              shot_type, remaining_distance, note, elevation,
              latitude, longitude, gps_accuracy_m, captured_at, auto_lie,
              remaining_to_green_m, gps_source, auto_lie_confidence, auto_lie_calculated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                    $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
            RETURNING *`,
          [
            data.roundId,
            data.holeNumber,
            data.shotNumber,
            data.club,
            data.result,
            data.missType,
            data.directionLr,
            data.directionFb,
            data.lie,
            data.slopeFb,
            data.slopeLr,
            data.landing,
            data.shotType,
            data.remainingDistance,
            note,
            data.elevation ?? null,
            data.latitude ?? null,
            data.longitude ?? null,
            data.gpsAccuracyM ?? null,
            data.capturedAt ?? null,
            data.autoLie ?? null,
            data.remainingToGreenM ?? null,
            data.gpsSource ?? 'gps',
            data.autoLieConfidence ?? null,
            data.autoLieCalculatedAt ?? null,
          ],
        );
        return r.rows[0];
      });
    });
  } catch (err) {
    return mapError(err, 'ショットの保存に失敗しました。');
  }

  revalidatePath(`/play/${data.roundId}/score`);
  return { shot };
}

export async function updateShot(data: {
  shotId: string;
  roundId: string;
  club: string | null;
  result: ShotResult | null;
  missType: string | null;
  directionLr: string | null;
  directionFb: string | null;
  lie: string | null;
  slopeFb: string | null;
  slopeLr: string | null;
  landing: string | null;
  shotType: string | null;
  remainingDistance: number | null;
  note?: string | null;
  elevation?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gpsAccuracyM?: number | null;
  capturedAt?: string | null;
  autoLie?: string | null;
  remainingToGreenM?: number | null;
  gpsSource?: string | null;
  originalLatitude?: number | null;
  originalLongitude?: number | null;
  editedAt?: string | null;
  autoLieConfidence?: string | null;
  autoLieCalculatedAt?: string | null;
}): Promise<{ error?: string; shot?: Shot }> {
  if (!isValidUUID(data.shotId)) return { error: 'ショットIDが不正です。' };
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };

  const validationError = validateShotFields(data);
  if (validationError) return { error: validationError };

  const note = data.note?.trim() || null;
  if (note !== null && note.length > SHOT_NOTE_MAX_LENGTH) {
    return { error: `メモは${SHOT_NOTE_MAX_LENGTH}文字以内で入力してください。` };
  }

  // GPS 関連フィールドは undefined（=送信なし）のキーは update から除外する
  const updates: Array<{ column: string; value: unknown }> = [
    { column: 'club', value: data.club },
    { column: 'result', value: data.result },
    { column: 'miss_type', value: data.missType },
    { column: 'direction_lr', value: data.directionLr },
    { column: 'direction_fb', value: data.directionFb },
    { column: 'lie', value: data.lie },
    { column: 'slope_fb', value: data.slopeFb },
    { column: 'slope_lr', value: data.slopeLr },
    { column: 'landing', value: data.landing },
    { column: 'shot_type', value: data.shotType },
    { column: 'remaining_distance', value: data.remainingDistance },
    { column: 'note', value: note },
    { column: 'elevation', value: data.elevation ?? null },
  ];
  if (data.latitude !== undefined) updates.push({ column: 'latitude', value: data.latitude });
  if (data.longitude !== undefined) updates.push({ column: 'longitude', value: data.longitude });
  if (data.gpsAccuracyM !== undefined) updates.push({ column: 'gps_accuracy_m', value: data.gpsAccuracyM });
  if (data.capturedAt !== undefined) updates.push({ column: 'captured_at', value: data.capturedAt });
  if (data.autoLie !== undefined) updates.push({ column: 'auto_lie', value: data.autoLie });
  if (data.remainingToGreenM !== undefined) updates.push({ column: 'remaining_to_green_m', value: data.remainingToGreenM });
  if (data.gpsSource !== undefined) updates.push({ column: 'gps_source', value: data.gpsSource });
  if (data.originalLatitude !== undefined) updates.push({ column: 'original_latitude', value: data.originalLatitude });
  if (data.originalLongitude !== undefined) updates.push({ column: 'original_longitude', value: data.originalLongitude });
  if (data.editedAt !== undefined) updates.push({ column: 'edited_at', value: data.editedAt });
  if (data.autoLieConfidence !== undefined) updates.push({ column: 'auto_lie_confidence', value: data.autoLieConfidence });
  if (data.autoLieCalculatedAt !== undefined) updates.push({ column: 'auto_lie_calculated_at', value: data.autoLieCalculatedAt });

  // 動的に SET 句を組み立てる ($1=shotId, $2=roundId, $3..=updates)
  const setClause = updates.map((u, i) => `${u.column} = $${i + 3}`).join(', ');
  const params: unknown[] = [data.shotId, data.roundId, ...updates.map((u) => u.value)];

  let shot: Shot;
  try {
    shot = await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, data.roundId, { statusFilter: 'in_progress' });
        const r = await client.query<Shot>(
          `UPDATE shots SET ${setClause}
            WHERE id = $1 AND round_id = $2
            RETURNING *`,
          params,
        );
        if (r.rowCount === 0) {
          throw new Error('shot_not_found');
        }
        return r.rows[0];
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'shot_not_found') {
      return { error: 'ショットが見つかりません。' };
    }
    return mapError(err, 'ショットの更新に失敗しました。');
  }

  revalidatePath(`/play/${data.roundId}/score`);
  return { shot };
}

export async function getShot(
  roundId: string,
  holeNumber: number,
  shotNumber: number,
): Promise<Shot | null> {
  if (!isValidUUID(roundId)) return null;
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        await assertRoundOwned(client, roundId);
        const r = await client.query<Shot>(
          `SELECT * FROM shots
            WHERE round_id = $1 AND hole_number = $2 AND shot_number = $3`,
          [roundId, holeNumber, shotNumber],
        );
        return r.rows[0] ?? null;
      });
    });
  } catch {
    return null;
  }
}

export async function getShots(roundId: string, holeNumber: number): Promise<Shot[]> {
  if (!isValidUUID(roundId)) return [];
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        await assertRoundOwned(client, roundId);
        const r = await client.query<Shot>(
          `SELECT * FROM shots
            WHERE round_id = $1 AND hole_number = $2
            ORDER BY shot_number`,
          [roundId, holeNumber],
        );
        return r.rows;
      });
    });
  } catch {
    return [];
  }
}

/**
 * 指定コースの全ホールについて、認証ユーザーの GPS タグ付きショットを
 * hole_number ごとにグループ化して取得する。
 */
export async function getShotsWithGpsByHoleForCourse(
  courseId: string,
): Promise<Map<number, Shot[]>> {
  const empty = new Map<number, Shot[]>();
  if (!isValidUUID(courseId)) return empty;

  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const r = await client.query<Shot>(
          `SELECT s.*
             FROM shots s
             JOIN rounds r ON r.id = s.round_id
            WHERE r.user_id = current_user_id()::uuid
              AND r.course_id = $1
              AND s.latitude IS NOT NULL
              AND s.longitude IS NOT NULL
            ORDER BY s.round_id, s.shot_number`,
          [courseId],
        );
        const grouped = new Map<number, Shot[]>();
        for (const shot of r.rows) {
          const arr = grouped.get(shot.hole_number) ?? [];
          arr.push(shot);
          grouped.set(shot.hole_number, arr);
        }
        return grouped;
      });
    });
  } catch {
    return empty;
  }
}

export async function getShotsForRound(roundId: string): Promise<Shot[]> {
  if (!isValidUUID(roundId)) return [];
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        await assertRoundOwned(client, roundId);
        const r = await client.query<Shot>(
          `SELECT * FROM shots
            WHERE round_id = $1
            ORDER BY hole_number, shot_number`,
          [roundId],
        );
        return r.rows;
      });
    });
  } catch {
    return [];
  }
}

export async function updateShotAdvice(data: {
  roundId: string;
  holeNumber: number;
  shotNumber: number;
  adviceText: string;
}): Promise<{ error?: string }> {
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }
  if (!Number.isInteger(data.shotNumber) || data.shotNumber < 1 || data.shotNumber > 20) {
    return { error: 'ショット番号が不正です。' };
  }
  if (!data.adviceText.trim()) return { error: 'アドバイスが空です。' };
  if (data.adviceText.length > 5000) return { error: 'アドバイスが長すぎます。' };
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, data.roundId);
        await client.query(
          `UPDATE shots SET advice_text = $4
            WHERE round_id = $1 AND hole_number = $2 AND shot_number = $3`,
          [data.roundId, data.holeNumber, data.shotNumber, data.adviceText],
        );
      });
    });
  } catch (err) {
    return mapError(err, 'アドバイスの保存に失敗しました。');
  }
  return {};
}

export async function getAdviceHistory(roundId: string): Promise<AdviceHistoryItem[]> {
  if (!isValidUUID(roundId)) return [];
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        await assertRoundOwned(client, roundId);
        const r = await client.query<AdviceHistoryItem>(
          `SELECT hole_number, shot_number, advice_text, club, lie,
                  remaining_distance, shot_type, slope_fb, slope_lr
             FROM shots
            WHERE round_id = $1 AND advice_text IS NOT NULL
            ORDER BY hole_number DESC, shot_number DESC
            LIMIT 20`,
          [roundId],
        );
        return r.rows;
      });
    });
  } catch {
    return [];
  }
}

export async function deleteShot(shotId: string, roundId: string): Promise<{ error?: string }> {
  if (!isValidUUID(shotId) || !isValidUUID(roundId)) return { error: 'IDが不正です。' };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, roundId);
        await client.query(
          'DELETE FROM shots WHERE id = $1 AND round_id = $2',
          [shotId, roundId],
        );
      });
    });
  } catch (err) {
    return mapError(err, 'ショットの削除に失敗しました。');
  }

  revalidatePath(`/play/${roundId}/score`);
  return {};
}

type ShotInputForBatch = {
  id?: string;
  shotNumber: number;
  club: string | null;
  result: string | null;
  missType: string | null;
  directionLr: string | null;
  directionFb: string | null;
  lie: string | null;
  slopeFb: string | null;
  slopeLr: string | null;
  landing: string | null;
  shotType: string | null;
  remainingDistance: number | null;
  note: string | null;
  adviceText: string | null;
  windDirection: string | null;
  windStrength: string | null;
  elevation: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gpsAccuracyM?: number | null;
  capturedAt?: string | null;
  autoLie?: string | null;
  remainingToGreenM?: number | null;
  gpsSource?: string | null;
  originalLatitude?: number | null;
  originalLongitude?: number | null;
  editedAt?: string | null;
  autoLieConfidence?: string | null;
  positionRevision?: number | null;
  autoLieCalculatedAt?: string | null;
};

/** ホール単位のバッチ保存（ホール切替時に一括保存） */
export async function saveShotsForHole(data: {
  roundId: string;
  holeNumber: number;
  shots: ShotInputForBatch[];
  skipRevalidate?: boolean;
}): Promise<{ error?: string; shots?: Shot[] }> {
  if (data.shots.length === 0) return { shots: [] };
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }

  for (const shot of data.shots) {
    if (!Number.isInteger(shot.shotNumber) || shot.shotNumber < 1 || shot.shotNumber > 20) {
      return { error: `ショット番号 ${shot.shotNumber} が不正です。` };
    }
    if (shot.note && shot.note.length > SHOT_NOTE_MAX_LENGTH) {
      return { error: `第${shot.shotNumber}打: メモが長すぎます。` };
    }
    const validationError = validateShotFields({
      club: shot.club,
      result: shot.result as ShotResult | null,
      missType: shot.missType,
      directionLr: shot.directionLr,
      directionFb: shot.directionFb,
      lie: shot.lie,
      slopeFb: shot.slopeFb,
      slopeLr: shot.slopeLr,
      landing: shot.landing,
      shotType: shot.shotType,
      remainingDistance: shot.remainingDistance,
      elevation: shot.elevation,
    });
    if (validationError) return { error: `第${shot.shotNumber}打: ${validationError}` };
  }

  let savedShots: Shot[];
  try {
    savedShots = await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, data.roundId, { statusFilter: 'in_progress' });

        for (const s of data.shots) {
          if (s.id) {
            // UPDATE existing
            await client.query(
              `UPDATE shots SET
                  shot_number = $3,
                  club = $4,
                  result = $5,
                  miss_type = $6,
                  direction_lr = $7,
                  direction_fb = $8,
                  lie = $9,
                  slope_fb = $10,
                  slope_lr = $11,
                  landing = $12,
                  shot_type = $13,
                  remaining_distance = $14,
                  note = $15,
                  advice_text = $16,
                  wind_direction = $17,
                  wind_strength = $18,
                  elevation = $19,
                  latitude = $20,
                  longitude = $21,
                  gps_accuracy_m = $22,
                  captured_at = $23,
                  auto_lie = $24,
                  remaining_to_green_m = $25,
                  gps_source = $26,
                  original_latitude = $27,
                  original_longitude = $28,
                  edited_at = $29,
                  auto_lie_confidence = $30,
                  position_revision = $31,
                  auto_lie_calculated_at = $32
                WHERE id = $1 AND round_id = $2`,
              [
                s.id,
                data.roundId,
                s.shotNumber,
                s.club,
                s.result,
                s.missType,
                s.directionLr,
                s.directionFb,
                s.lie,
                s.slopeFb,
                s.slopeLr,
                s.landing,
                s.shotType,
                s.remainingDistance,
                s.note,
                s.adviceText,
                s.windDirection,
                s.windStrength,
                s.elevation,
                s.latitude ?? null,
                s.longitude ?? null,
                s.gpsAccuracyM ?? null,
                s.capturedAt ?? null,
                s.autoLie ?? null,
                s.remainingToGreenM ?? null,
                s.gpsSource ?? 'gps',
                s.originalLatitude ?? null,
                s.originalLongitude ?? null,
                s.editedAt ?? null,
                s.autoLieConfidence ?? null,
                s.positionRevision ?? 0,
                s.autoLieCalculatedAt ?? null,
              ],
            );
          } else {
            // INSERT new
            await client.query(
              `INSERT INTO shots (
                  round_id, hole_number, shot_number, club, result, miss_type,
                  direction_lr, direction_fb, lie, slope_fb, slope_lr, landing,
                  shot_type, remaining_distance, note, advice_text,
                  wind_direction, wind_strength, elevation,
                  latitude, longitude, gps_accuracy_m, captured_at, auto_lie,
                  remaining_to_green_m, gps_source, original_latitude, original_longitude,
                  edited_at, auto_lie_confidence, position_revision, auto_lie_calculated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
                        $25, $26, $27, $28, $29, $30, $31, $32)`,
              [
                data.roundId,
                data.holeNumber,
                s.shotNumber,
                s.club,
                s.result,
                s.missType,
                s.directionLr,
                s.directionFb,
                s.lie,
                s.slopeFb,
                s.slopeLr,
                s.landing,
                s.shotType,
                s.remainingDistance,
                s.note,
                s.adviceText,
                s.windDirection,
                s.windStrength,
                s.elevation,
                s.latitude ?? null,
                s.longitude ?? null,
                s.gpsAccuracyM ?? null,
                s.capturedAt ?? null,
                s.autoLie ?? null,
                s.remainingToGreenM ?? null,
                s.gpsSource ?? 'gps',
                s.originalLatitude ?? null,
                s.originalLongitude ?? null,
                s.editedAt ?? null,
                s.autoLieConfidence ?? null,
                s.positionRevision ?? 0,
                s.autoLieCalculatedAt ?? null,
              ],
            );
          }
        }

        const r = await client.query<Shot>(
          `SELECT * FROM shots
            WHERE round_id = $1 AND hole_number = $2
            ORDER BY shot_number`,
          [data.roundId, data.holeNumber],
        );
        return r.rows;
      });
    });
  } catch (err) {
    return mapError(err, 'ショットの保存に失敗しました。');
  }

  return { shots: savedShots };
}

/** ホール単位の全件入れ替え（delete all + insert all）— オフライン同期用 */
export async function replaceShotsForHole(data: {
  roundId: string;
  holeNumber: number;
  shots: Array<
    {
      clientId: string;
      shotNumber: number;
      club: string | null;
      result: string | null;
      missType: string | null;
      directionLr: string | null;
      directionFb: string | null;
      lie: string | null;
      slopeFb: string | null;
      slopeLr: string | null;
      landing: string | null;
      shotType: string | null;
      remainingDistance: number | null;
      note: string | null;
      adviceText: string | null;
      windDirection: string | null;
      windStrength: string | null;
      elevation: string | null;
      latitude?: number | null;
      longitude?: number | null;
      gpsAccuracyM?: number | null;
      capturedAt?: string | null;
      autoLie?: string | null;
      remainingToGreenM?: number | null;
      gpsSource?: string | null;
      originalLatitude?: number | null;
      originalLongitude?: number | null;
      editedAt?: string | null;
      autoLieConfidence?: string | null;
      positionRevision?: number | null;
      autoLieCalculatedAt?: string | null;
    }
  >;
  skipRevalidate?: boolean;
}): Promise<{ error?: string; shots?: Shot[] }> {
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }

  for (const shot of data.shots) {
    if (!shot.clientId || typeof shot.clientId !== 'string') {
      return { error: 'clientIdが不正です。' };
    }
    if (!Number.isInteger(shot.shotNumber) || shot.shotNumber < 1 || shot.shotNumber > 20) {
      return { error: `ショット番号 ${shot.shotNumber} が不正です。` };
    }
    if (shot.note && shot.note.length > SHOT_NOTE_MAX_LENGTH) {
      return { error: `第${shot.shotNumber}打: メモが長すぎます。` };
    }
    const validationError = validateShotFields({
      club: shot.club,
      result: shot.result as ShotResult | null,
      missType: shot.missType,
      directionLr: shot.directionLr,
      directionFb: shot.directionFb,
      lie: shot.lie,
      slopeFb: shot.slopeFb,
      slopeLr: shot.slopeLr,
      landing: shot.landing,
      shotType: shot.shotType,
      remainingDistance: shot.remainingDistance,
      elevation: shot.elevation,
    });
    if (validationError) return { error: `第${shot.shotNumber}打: ${validationError}` };
  }

  const shotsJson = data.shots.map((s) => ({
    client_id: s.clientId,
    shot_number: s.shotNumber,
    club: s.club,
    result: s.result,
    miss_type: s.missType,
    direction_lr: s.directionLr,
    direction_fb: s.directionFb,
    lie: s.lie,
    slope_fb: s.slopeFb,
    slope_lr: s.slopeLr,
    landing: s.landing,
    shot_type: s.shotType,
    remaining_distance: s.remainingDistance,
    note: s.note,
    advice_text: s.adviceText,
    wind_direction: s.windDirection,
    wind_strength: s.windStrength,
    elevation: s.elevation,
    latitude: s.latitude ?? null,
    longitude: s.longitude ?? null,
    gps_accuracy_m: s.gpsAccuracyM ?? null,
    captured_at: s.capturedAt ?? null,
    auto_lie: s.autoLie ?? null,
    remaining_to_green_m: s.remainingToGreenM ?? null,
    gps_source: s.gpsSource ?? 'gps',
    original_latitude: s.originalLatitude ?? null,
    original_longitude: s.originalLongitude ?? null,
    edited_at: s.editedAt ?? null,
    auto_lie_confidence: s.autoLieConfidence ?? null,
    position_revision: s.positionRevision ?? 0,
    auto_lie_calculated_at: s.autoLieCalculatedAt ?? null,
  }));

  let insertedShots: Shot[];
  try {
    insertedShots = await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, data.roundId, { statusFilter: 'in_progress' });
        const r = await client.query<Shot>(
          'SELECT * FROM replace_shots_for_hole($1::uuid, $2::int, $3::jsonb)',
          [data.roundId, data.holeNumber, JSON.stringify(shotsJson)],
        );
        return r.rows;
      });
    });
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'P0001' &&
      (err as { message?: string }).message?.startsWith('forbidden')
    ) {
      return { error: '権限がないか、対象ラウンドを編集できません。' };
    }
    console.error('replace_shots_for_hole failed:', err);
    return mapError(err, 'ショットの保存に失敗しました。');
  }

  if (!data.skipRevalidate) {
    revalidatePath(`/play/${data.roundId}/score`);
  }

  return { shots: insertedShots };
}

/**
 * 指定ラウンドの GPS タグ付きショットを hole_number ごとにグループ化して取得する
 */
export async function getShotsWithGpsByHoleForRound(
  roundId: string,
): Promise<Map<number, Shot[]>> {
  const empty = new Map<number, Shot[]>();
  if (!isValidUUID(roundId)) return empty;

  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        await assertRoundOwned(client, roundId);
        const r = await client.query<Shot>(
          `SELECT * FROM shots
            WHERE round_id = $1
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            ORDER BY hole_number, shot_number`,
          [roundId],
        );
        const grouped = new Map<number, Shot[]>();
        for (const shot of r.rows) {
          const arr = grouped.get(shot.hole_number) ?? [];
          arr.push(shot);
          grouped.set(shot.hole_number, arr);
        }
        return grouped;
      });
    });
  } catch {
    return empty;
  }
}
