'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, db, type PoolClient } from '@/lib/db/neon';
import type { Score } from '@/features/score/types';
import { isValidUUID } from '@/lib/utils';

function validateIntRange(value: number, min: number, max: number, label: string): string | null {
  if (!Number.isInteger(value) || value < min || value > max) return `${label}が不正です。`;
  return null;
}

function validateFirstPuttDistanceM(value: number | null | undefined): string | null {
  if (value != null && (typeof value !== 'number' || value < 0 || value > 50)) {
    return 'パット距離（数値）が不正です。';
  }
  return null;
}

function validateEnum(value: string | null, allowed: string[], label: string): string | null {
  if (value !== null && !allowed.includes(value)) return `${label}が不正です。`;
  return null;
}

async function assertRoundOwned(
  client: PoolClient,
  roundId: string,
  options?: { includeCompleted?: boolean },
): Promise<void> {
  const statuses = options?.includeCompleted ? ['in_progress', 'completed'] : ['in_progress'];
  const r = await client.query<{ id: string }>(
    `SELECT id FROM rounds
      WHERE id = $1
        AND user_id = current_user_id()::uuid
        AND status = ANY($2::text[])`,
    [roundId, statuses],
  );
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

export async function upsertScore(data: {
  roundId: string;
  holeNumber: number;
  strokes: number;
  putts: number | null;
  fairwayHit: boolean | null;
  greenInReg: boolean | null;
  teeShotLr: string | null;
  teeShotFb: string | null;
  obCount: number;
  bunkerCount: number;
  penaltyCount: number;
  firstPuttDistance: string | null;
  firstPuttDistanceM?: number | null;
  windDirection: string | null;
  windStrength: string | null;
  skipRevalidate?: boolean;
}): Promise<{ error?: string }> {
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };

  const validationError =
    validateIntRange(data.holeNumber, 1, 18, 'ホール番号') ??
    validateIntRange(data.strokes, 1, 20, '打数') ??
    (data.putts !== null ? validateIntRange(data.putts, 0, data.strokes, 'パット数') : null) ??
    validateEnum(data.teeShotLr, ['left', 'center', 'right'], 'ティーショット方向') ??
    validateEnum(data.teeShotFb, ['short', 'center', 'long'], 'ティーショット距離') ??
    validateIntRange(data.obCount, 0, 10, 'OB数') ??
    validateIntRange(data.bunkerCount, 0, 10, 'バンカー数') ??
    validateIntRange(data.penaltyCount, 0, 10, 'ペナルティ数') ??
    validateEnum(data.firstPuttDistance, ['short', 'mid', 'long', 'very_long'], 'ファーストパット距離') ??
    validateFirstPuttDistanceM(data.firstPuttDistanceM) ??
    validateEnum(data.windDirection, ['head', 'tail', 'left', 'right'], '風向き') ??
    validateEnum(data.windStrength, ['calm', 'light', 'moderate', 'strong'], '風の強さ');
  if (validationError) return { error: validationError };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, data.roundId, { includeCompleted: true });

        await client.query(
          `INSERT INTO scores (
              round_id, hole_number, strokes, putts, fairway_hit, green_in_reg,
              tee_shot_lr, tee_shot_fb, ob_count, bunker_count, penalty_count,
              first_putt_distance, first_putt_distance_m, wind_direction, wind_strength
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (round_id, hole_number) DO UPDATE SET
              strokes = EXCLUDED.strokes,
              putts = EXCLUDED.putts,
              fairway_hit = EXCLUDED.fairway_hit,
              green_in_reg = EXCLUDED.green_in_reg,
              tee_shot_lr = EXCLUDED.tee_shot_lr,
              tee_shot_fb = EXCLUDED.tee_shot_fb,
              ob_count = EXCLUDED.ob_count,
              bunker_count = EXCLUDED.bunker_count,
              penalty_count = EXCLUDED.penalty_count,
              first_putt_distance = EXCLUDED.first_putt_distance,
              first_putt_distance_m = EXCLUDED.first_putt_distance_m,
              wind_direction = EXCLUDED.wind_direction,
              wind_strength = EXCLUDED.wind_strength`,
          [
            data.roundId,
            data.holeNumber,
            data.strokes,
            data.putts,
            data.fairwayHit,
            data.greenInReg,
            data.teeShotLr,
            data.teeShotFb,
            data.obCount,
            data.bunkerCount,
            data.penaltyCount,
            data.firstPuttDistance,
            data.firstPuttDistanceM ?? null,
            data.windDirection,
            data.windStrength,
          ],
        );

        // total_score 再計算
        const totalR = await client.query<{ total: string | null }>(
          'SELECT COALESCE(SUM(strokes), 0)::text AS total FROM scores WHERE round_id = $1',
          [data.roundId],
        );
        const total = Number(totalR.rows[0]?.total ?? 0);
        await client.query(
          'UPDATE rounds SET total_score = $2 WHERE id = $1 AND user_id = current_user_id()::uuid',
          [data.roundId, total > 0 ? total : null],
        );
      });
    });
  } catch (err) {
    return mapError(err, 'スコアの保存に失敗しました。');
  }

  if (!data.skipRevalidate) {
    revalidatePath(`/play/${data.roundId}/score`);
    revalidatePath(`/rounds/${data.roundId}`);
    revalidatePath('/rounds');
    revalidatePath('/rounds/stats');
  }
  return {};
}

/** ファーストパット距離をscoresテーブルに同期保存（ショットレコーダーから呼ばれる） */
export async function updateFirstPuttDistance(data: {
  roundId: string;
  holeNumber: number;
  firstPuttDistance: string | null;
  firstPuttDistanceM: number | null;
}): Promise<{ error?: string }> {
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };

  if (data.firstPuttDistance !== null && !['short', 'mid', 'long', 'very_long'].includes(data.firstPuttDistance)) {
    return { error: 'パット距離が不正です。' };
  }
  const distMError = validateFirstPuttDistanceM(data.firstPuttDistanceM);
  if (distMError) return { error: distMError };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, data.roundId, { includeCompleted: true });
        await client.query(
          `UPDATE scores SET
              first_putt_distance = $3,
              first_putt_distance_m = $4
            WHERE round_id = $1 AND hole_number = $2`,
          [data.roundId, data.holeNumber, data.firstPuttDistance, data.firstPuttDistanceM],
        );
      });
    });
  } catch (err) {
    return mapError(err, 'パット距離の保存に失敗しました。');
  }
  return {};
}

export async function getScores(roundId: string): Promise<Score[]> {
  if (!isValidUUID(roundId)) return [];
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        await assertRoundOwned(client, roundId, { includeCompleted: true });
        const r = await client.query<Score>(
          'SELECT * FROM scores WHERE round_id = $1 ORDER BY hole_number',
          [roundId],
        );
        return r.rows;
      });
    });
  } catch {
    return [];
  }
}

export async function getScoresWithHoles(roundId: string) {
  if (!isValidUUID(roundId)) return null;
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const roundR = await client.query<{
          id: string;
          course_id: string;
          status: string;
          starting_course: string;
          weather: string | null;
          target_score: number | null;
          course_name: string | null;
        }>(
          `SELECT r.id, r.course_id, r.status, r.starting_course, r.weather, r.target_score,
                  c.name AS course_name
             FROM rounds r
             LEFT JOIN courses c ON c.id = r.course_id
            WHERE r.id = $1 AND r.user_id = current_user_id()::uuid`,
          [roundId],
        );
        const round = roundR.rows[0];
        if (!round) return null;

        const [holesR, scoresR] = await Promise.all([
          client.query<{ hole_number: number; par: number; distance: number | null }>(
            'SELECT hole_number, par, distance FROM holes WHERE course_id = $1 ORDER BY hole_number',
            [round.course_id],
          ),
          client.query<Score>(
            'SELECT * FROM scores WHERE round_id = $1 ORDER BY hole_number',
            [roundId],
          ),
        ]);

        return {
          round: {
            id: round.id,
            courseId: round.course_id,
            courseName: round.course_name ?? '',
            status: round.status,
            startingCourse: (round.starting_course === 'in' ? 'in' : 'out') as 'out' | 'in',
            weather: round.weather ?? null,
            targetScore: round.target_score ?? null,
          },
          holes: holesR.rows,
          scores: scoresR.rows,
        };
      });
    });
  } catch {
    return null;
  }
}

// FormData版（未使用だが互換性のため残す）
export async function recordScore(_formData: FormData) {
  throw new Error('Use upsertScore() instead');
}

// recordShot は src/actions/shot.ts に移動しました (STORY-019)
