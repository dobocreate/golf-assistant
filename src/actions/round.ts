'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser, db } from '@/lib/db/neon';
import type { Round, RoundWithCourse } from '@/features/round/types';
import { WEATHER_VALUES, WIND_STRENGTH_VALUES } from '@/features/round/types';
import { isValidUUID } from '@/lib/utils';

function mapError(err: unknown, fallback: string): { error: string } {
  if (err instanceof Error) {
    if (err.message === 'course_not_found') return { error: '選択されたコースが見つかりません。' };
    if (err.message === 'round_not_found') {
      return { error: 'ラウンドが見つからない、または既に完了しています。' };
    }
    if (err.message.startsWith('unauthorized')) return { error: 'ログインが必要です。' };
  }
  console.error(fallback, err);
  return { error: fallback };
}

const ROUND_COLUMNS =
  'id, user_id, course_id, played_at, total_score, status, created_at, starting_course, weather, wind, target_score, review_note, active_green';

export async function startRound(formData: FormData) {
  const courseId = formData.get('course_id') as string;
  if (!courseId || !isValidUUID(courseId)) {
    return { error: 'コースを選択してください。' };
  }

  const playedAt = (formData.get('played_at') as string) || new Date().toISOString().split('T')[0];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_RE.test(playedAt)) {
    return { error: 'プレー日の形式が不正です。' };
  }

  const startingCourse = formData.get('starting_course');
  if (startingCourse !== 'out' && startingCourse !== 'in') {
    return { error: 'スタートコースを選択してください。' };
  }

  const gamePlanSetId = formData.get('game_plan_set_id') as string | null;

  let roundId: string;
  try {
    roundId = await requireUser(async () => {
      return db.transaction(async (client) => {
        const c = await client.query<{ id: string }>('SELECT id FROM courses WHERE id = $1', [courseId]);
        if (c.rowCount === 0) throw new Error('course_not_found');

        const r = await client.query<{ id: string }>(
          `INSERT INTO rounds (user_id, course_id, played_at, starting_course, status)
             VALUES (current_user_id()::uuid, $1, $2, $3, 'in_progress')
           RETURNING id`,
          [courseId, playedAt, startingCourse],
        );
        return r.rows[0].id;
      });
    });
  } catch (err) {
    return mapError(err, 'ラウンドの作成に失敗しました。');
  }

  // ゲームプランセットをラウンドにコピー (失敗しても警告のみ)
  if (gamePlanSetId && isValidUUID(gamePlanSetId)) {
    const { applyGamePlanSetToRound } = await import('@/actions/game-plan-set');
    const planResult = await applyGamePlanSetToRound({ setId: gamePlanSetId, roundId });
    if (planResult.error) {
      console.error('Failed to apply game plan:', planResult.error);
    }
  }

  revalidatePath('/play');
  revalidatePath('/rounds');
  redirect(`/play/${roundId}`);
}

export async function getRound(roundId: string): Promise<Round | null> {
  if (!isValidUUID(roundId)) return null;
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const r = await client.query<Round>(
          `SELECT ${ROUND_COLUMNS}
             FROM rounds
            WHERE id = $1 AND user_id = current_user_id()::uuid`,
          [roundId],
        );
        return r.rows[0] ?? null;
      });
    });
  } catch {
    return null;
  }
}

type RoundRow = Round & {
  course_name: string | null;
  course_prefecture: string | null;
};

function rowToRoundWithCourse(row: RoundRow | undefined): RoundWithCourse | null {
  if (!row) return null;
  const { course_name, course_prefecture, course_id, ...rest } = row;
  return {
    ...rest,
    course_id,
    courses: {
      id: course_id,
      name: course_name ?? '',
      prefecture: course_prefecture ?? '',
    },
  } as RoundWithCourse;
}

export async function getRoundWithCourse(roundId: string): Promise<RoundWithCourse | null> {
  if (!isValidUUID(roundId)) return null;
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const r = await client.query<RoundRow>(
          `SELECT r.${ROUND_COLUMNS.split(', ').join(', r.')},
                  c.name AS course_name, c.prefecture AS course_prefecture
             FROM rounds r
             LEFT JOIN courses c ON c.id = r.course_id
            WHERE r.id = $1 AND r.user_id = current_user_id()::uuid`,
          [roundId],
        );
        return rowToRoundWithCourse(r.rows[0]);
      });
    });
  } catch {
    return null;
  }
}

export async function getActiveRound(): Promise<RoundWithCourse | null> {
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const r = await client.query<RoundRow>(
          `SELECT r.${ROUND_COLUMNS.split(', ').join(', r.')},
                  c.name AS course_name, c.prefecture AS course_prefecture
             FROM rounds r
             LEFT JOIN courses c ON c.id = r.course_id
            WHERE r.user_id = current_user_id()::uuid AND r.status = 'in_progress'
            ORDER BY r.created_at DESC
            LIMIT 1`,
        );
        return rowToRoundWithCourse(r.rows[0]);
      });
    });
  } catch {
    return null;
  }
}

export async function completeRound(
  _prevState: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const roundId = formData.get('roundId') as string;
  if (!roundId || !isValidUUID(roundId)) {
    return { error: 'ラウンドIDが不正です。' };
  }

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        const own = await client.query<{ id: string }>(
          `SELECT id FROM rounds
            WHERE id = $1 AND user_id = current_user_id()::uuid AND status = 'in_progress'`,
          [roundId],
        );
        if (own.rowCount === 0) throw new Error('round_not_found');

        const scoresR = await client.query<{ strokes: number }>(
          'SELECT strokes FROM scores WHERE round_id = $1',
          [roundId],
        );
        const totalScore = scoresR.rows.reduce((sum, s) => sum + (s.strokes ?? 0), 0);

        await client.query(
          `UPDATE rounds SET
              status = 'completed',
              total_score = $2,
              context_snapshot = NULL
            WHERE id = $1 AND user_id = current_user_id()::uuid`,
          [roundId, totalScore > 0 ? totalScore : null],
        );
      });
    });
  } catch (err) {
    return mapError(err, 'ラウンドの完了に失敗しました。');
  }

  revalidatePath('/play');
  revalidatePath('/rounds');
  revalidatePath(`/rounds/${roundId}`);
  redirect(`/rounds/${roundId}`);
}

/** スタートコース（OUT/IN）を変更 */
export async function updateStartingCourse(
  roundId: string,
  startingCourse: 'out' | 'in',
): Promise<{ error?: string }> {
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await client.query(
          `UPDATE rounds SET starting_course = $2
            WHERE id = $1 AND user_id = current_user_id()::uuid AND status = 'in_progress'`,
          [roundId, startingCourse],
        );
      });
    });
  } catch (err) {
    return mapError(err, 'スタートコースの変更に失敗しました。');
  }

  revalidatePath(`/play/${roundId}`);
  revalidatePath(`/play/${roundId}/score`);
  revalidatePath(`/play/${roundId}/scorecard`);
  return {};
}

/** 天候を変更 */
export async function updateWeather(roundId: string, weather: string | null): Promise<{ error?: string }> {
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };
  if (weather !== null && !(WEATHER_VALUES as string[]).includes(weather)) {
    return { error: '天候の値が不正です。' };
  }

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await client.query(
          `UPDATE rounds SET weather = $2
            WHERE id = $1 AND user_id = current_user_id()::uuid`,
          [roundId, weather],
        );
      });
    });
  } catch (err) {
    return mapError(err, '天候の変更に失敗しました。');
  }
  return {};
}

/** 風を変更 */
export async function updateWind(roundId: string, wind: string | null): Promise<{ error?: string }> {
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };
  if (wind !== null && !(WIND_STRENGTH_VALUES as string[]).includes(wind)) {
    return { error: '風の値が不正です。' };
  }

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await client.query(
          `UPDATE rounds SET wind = $2
            WHERE id = $1 AND user_id = current_user_id()::uuid`,
          [roundId, wind],
        );
      });
    });
  } catch (err) {
    return mapError(err, '風の変更に失敗しました。');
  }
  return {};
}

/** 総括メモを保存（completedラウンドのみ） */
export async function saveReviewNote(roundId: string, reviewNote: string): Promise<{ error?: string }> {
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };
  if (reviewNote.length > 2000) return { error: '総括は2000文字以内で入力してください。' };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await client.query(
          `UPDATE rounds SET review_note = $2
            WHERE id = $1 AND user_id = current_user_id()::uuid AND status = 'completed'`,
          [roundId, reviewNote || null],
        );
      });
    });
  } catch (err) {
    return mapError(err, '総括の保存に失敗しました。');
  }

  revalidatePath(`/rounds/${roundId}`);
  return {};
}

/** 練習提案を取得 */
export async function getPracticeSuggestion(roundId: string): Promise<string | null> {
  if (!isValidUUID(roundId)) return null;
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const r = await client.query<{ content: string }>(
          `SELECT content FROM practice_suggestions
            WHERE round_id = $1 AND user_id = current_user_id()::uuid`,
          [roundId],
        );
        return r.rows[0]?.content ?? null;
      });
    });
  } catch {
    return null;
  }
}

/** 練習提案を保存（upsert） */
export async function savePracticeSuggestion(roundId: string, content: string): Promise<{ error?: string }> {
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };
  if (content.length > 10000) return { error: '練習提案が長すぎます。' };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await client.query(
          `INSERT INTO practice_suggestions (round_id, user_id, content)
             VALUES ($1, current_user_id()::uuid, $2)
             ON CONFLICT (round_id) DO UPDATE SET content = EXCLUDED.content`,
          [roundId, content],
        );
      });
    });
  } catch (err) {
    return mapError(err, '練習提案の保存に失敗しました。');
  }

  revalidatePath(`/rounds/${roundId}`);
  return {};
}

/** 使用グリーン（A/B）を変更 */
export async function updateActiveGreen(
  roundId: string,
  activeGreen: 'A' | 'B' | null,
): Promise<{ error?: string }> {
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await client.query(
          `UPDATE rounds SET
              active_green = $2,
              context_snapshot = NULL
            WHERE id = $1 AND user_id = current_user_id()::uuid AND status = 'in_progress'`,
          [roundId, activeGreen],
        );
      });
    });
  } catch (err) {
    return mapError(err, 'グリーン設定の保存に失敗しました。');
  }

  revalidatePath(`/play/${roundId}`);
  revalidatePath(`/play/${roundId}/score`);
  revalidatePath(`/play/${roundId}/scorecard`);
  return {};
}

/** ラウンドを削除（関連データはCASCADE DELETEで自動削除） */
export async function deleteRound(roundId: string): Promise<{ error?: string }> {
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await client.query(
          'DELETE FROM rounds WHERE id = $1 AND user_id = current_user_id()::uuid',
          [roundId],
        );
      });
    });
  } catch (err) {
    return mapError(err, 'ラウンドの削除に失敗しました。');
  }

  revalidatePath('/rounds');
  redirect('/rounds');
}
