'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, db, type PoolClient } from '@/lib/db/neon';
import type {
  GamePlanSet,
  GamePlanHole,
  GamePlanSetWithHoles,
  RiskLevel,
} from '@/features/game-plan/types';
import { RISK_LEVEL_VALUES } from '@/features/game-plan/types';
import { isValidUUID } from '@/lib/utils';

function revalidateGamePlanSetPaths() {
  revalidatePath('/game-plans');
}

function mapError(err: unknown, fallback: string): { error: string } {
  if (err instanceof Error) {
    if (err.message === 'set_not_found') return { error: 'プランセットが見つかりません。' };
    if (err.message === 'round_not_found') return { error: 'ラウンドが見つかりません。' };
    if (err.message.startsWith('unauthorized')) return { error: 'ログインが必要です。' };
  }
  console.error(fallback, err);
  return { error: fallback };
}

async function assertSetOwned(client: PoolClient, setId: string): Promise<void> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM game_plan_sets
      WHERE id = $1 AND user_id = current_user_id()::uuid`,
    [setId],
  );
  if (r.rowCount === 0) {
    throw new Error('set_not_found');
  }
}

async function assertRoundOwned(client: PoolClient, roundId: string): Promise<void> {
  const r = await client.query<{ id: string }>(
    'SELECT id FROM rounds WHERE id = $1 AND user_id = current_user_id()::uuid',
    [roundId],
  );
  if (r.rowCount === 0) {
    throw new Error('round_not_found');
  }
}

/** ユーザーの全プランセット一覧（コース名付き） */
export async function getGamePlanSets(): Promise<(GamePlanSet & { course_name: string })[]> {
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const r = await client.query<GamePlanSet & { course_name: string | null }>(
          `SELECT gps.*, c.name AS course_name
             FROM game_plan_sets gps
             LEFT JOIN courses c ON c.id = gps.course_id
            WHERE gps.user_id = current_user_id()::uuid
            ORDER BY gps.created_at DESC`,
        );
        return r.rows.map((row) => ({
          ...row,
          course_name: row.course_name ?? '不明なコース',
        }));
      });
    });
  } catch (err) {
    console.error('Failed to fetch game plan sets:', err);
    return [];
  }
}

/** 特定コースのプランセット一覧 */
export async function getGamePlanSetsByCourse(courseId: string): Promise<GamePlanSet[]> {
  if (!isValidUUID(courseId)) return [];
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const r = await client.query<GamePlanSet>(
          `SELECT * FROM game_plan_sets
            WHERE user_id = current_user_id()::uuid
              AND course_id = $1
            ORDER BY created_at DESC`,
          [courseId],
        );
        return r.rows;
      });
    });
  } catch (err) {
    console.error('Failed to fetch game plan sets by course:', err);
    return [];
  }
}

/** プランセット＋ホール詳細を取得 */
export async function getGamePlanSetWithHoles(setId: string): Promise<GamePlanSetWithHoles | null> {
  if (!isValidUUID(setId)) return null;
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const setR = await client.query<GamePlanSet>(
          `SELECT * FROM game_plan_sets
            WHERE id = $1 AND user_id = current_user_id()::uuid`,
          [setId],
        );
        if (setR.rowCount === 0) return null;

        const holesR = await client.query<GamePlanHole>(
          `SELECT * FROM game_plan_holes
            WHERE game_plan_set_id = $1
            ORDER BY hole_number`,
          [setId],
        );

        return {
          ...setR.rows[0],
          holes: holesR.rows,
        };
      });
    });
  } catch {
    return null;
  }
}

/** プランセット作成 */
export async function createGamePlanSet(data: {
  courseId: string;
  name: string;
  targetScore?: number | null;
}): Promise<{ error?: string; id?: string }> {
  if (!isValidUUID(data.courseId)) return { error: 'コースIDが不正です。' };

  const trimmed = data.name.trim();
  if (!trimmed) return { error: 'プラン名を入力してください。' };
  if (trimmed.length > 100) return { error: 'プラン名は100文字以内です。' };

  if (data.targetScore !== undefined && data.targetScore !== null) {
    if (!Number.isInteger(data.targetScore) || data.targetScore < 50 || data.targetScore > 200) {
      return { error: '目標スコアは50〜200の整数です。' };
    }
  }

  let id: string;
  try {
    id = await requireUser(async () => {
      return db.transaction(async (client) => {
        const r = await client.query<{ id: string }>(
          `INSERT INTO game_plan_sets (user_id, course_id, name, target_score)
             VALUES (current_user_id()::uuid, $1, $2, $3)
           RETURNING id`,
          [data.courseId, trimmed, data.targetScore ?? null],
        );
        return r.rows[0].id;
      });
    });
  } catch (err) {
    return mapError(err, 'プランセットの作成に失敗しました。');
  }

  revalidateGamePlanSetPaths();
  return { id };
}

/** プランセット更新（名前・目標スコア） */
export async function updateGamePlanSet(data: {
  setId: string;
  name: string;
  targetScore?: number | null;
}): Promise<{ error?: string }> {
  if (!isValidUUID(data.setId)) return { error: 'IDが不正です。' };

  const trimmed = data.name.trim();
  if (!trimmed) return { error: 'プラン名を入力してください。' };
  if (trimmed.length > 100) return { error: 'プラン名は100文字以内です。' };

  if (data.targetScore !== undefined && data.targetScore !== null) {
    if (!Number.isInteger(data.targetScore) || data.targetScore < 50 || data.targetScore > 200) {
      return { error: '目標スコアは50〜200の整数です。' };
    }
  }

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        const r = await client.query(
          `UPDATE game_plan_sets
              SET name = $2, target_score = $3
            WHERE id = $1 AND user_id = current_user_id()::uuid`,
          [data.setId, trimmed, data.targetScore ?? null],
        );
        if (r.rowCount === 0) throw new Error('set_not_found');
      });
    });
  } catch (err) {
    return mapError(err, 'プランセットの更新に失敗しました。');
  }

  revalidateGamePlanSetPaths();
  return {};
}

/** プランセット削除 */
export async function deleteGamePlanSet(setId: string): Promise<{ error?: string }> {
  if (!isValidUUID(setId)) return { error: 'IDが不正です。' };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await client.query(
          `DELETE FROM game_plan_sets
            WHERE id = $1 AND user_id = current_user_id()::uuid`,
          [setId],
        );
      });
    });
  } catch (err) {
    return mapError(err, 'プランセットの削除に失敗しました。');
  }

  revalidateGamePlanSetPaths();
  return {};
}

/** ホール詳細の一括保存 */
export async function upsertGamePlanHolesBatch(data: {
  setId: string;
  holes: Array<{
    holeNumber: number;
    planText?: string | null;
    alertText?: string | null;
    riskLevel?: RiskLevel | null;
    targetStrokes?: number | null;
  }>;
}): Promise<{ error?: string }> {
  if (!isValidUUID(data.setId)) return { error: 'IDが不正です。' };
  if (data.holes.length === 0) return {};
  if (data.holes.length > 18) return { error: 'ホールは最大18件です。' };

  for (const h of data.holes) {
    if (!Number.isInteger(h.holeNumber) || h.holeNumber < 1 || h.holeNumber > 18) {
      return { error: 'ホール番号が不正です。' };
    }
    if (h.planText && h.planText.length > 2000) return { error: 'プランテキストが長すぎます。' };
    if (h.alertText && h.alertText.length > 1000) return { error: 'アラートテキストが長すぎます。' };
    if (h.riskLevel && !RISK_LEVEL_VALUES.includes(h.riskLevel)) {
      return { error: 'リスクレベルが不正です。' };
    }
    if (h.targetStrokes !== undefined && h.targetStrokes !== null) {
      if (!Number.isInteger(h.targetStrokes) || h.targetStrokes < 1 || h.targetStrokes > 20) {
        return { error: '目標打数が不正です。' };
      }
    }
  }

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertSetOwned(client, data.setId);
        for (const h of data.holes) {
          await client.query(
            `INSERT INTO game_plan_holes (
                 game_plan_set_id, hole_number, plan_text, alert_text, risk_level, target_strokes
               )
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (game_plan_set_id, hole_number) DO UPDATE SET
                 plan_text = EXCLUDED.plan_text,
                 alert_text = EXCLUDED.alert_text,
                 risk_level = EXCLUDED.risk_level,
                 target_strokes = EXCLUDED.target_strokes`,
            [
              data.setId,
              h.holeNumber,
              h.planText ?? null,
              h.alertText ?? null,
              h.riskLevel ?? null,
              h.targetStrokes ?? null,
            ],
          );
        }
      });
    });
  } catch (err) {
    return mapError(err, 'ホールデータの保存に失敗しました。');
  }

  revalidateGamePlanSetPaths();
  return {};
}

/** プランセットをラウンドにコピー（ラウンド開始時） */
export async function applyGamePlanSetToRound(data: {
  setId: string;
  roundId: string;
}): Promise<{ error?: string }> {
  if (!isValidUUID(data.setId) || !isValidUUID(data.roundId)) return { error: 'IDが不正です。' };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        const setR = await client.query<{ id: string; target_score: number | null }>(
          `SELECT id, target_score FROM game_plan_sets
            WHERE id = $1 AND user_id = current_user_id()::uuid`,
          [data.setId],
        );
        if (setR.rowCount === 0) throw new Error('set_not_found');
        const set = setR.rows[0];

        await assertRoundOwned(client, data.roundId);

        const holesR = await client.query<{
          hole_number: number;
          plan_text: string | null;
          alert_text: string | null;
          risk_level: RiskLevel | null;
          target_strokes: number | null;
        }>(
          `SELECT hole_number, plan_text, alert_text, risk_level, target_strokes
             FROM game_plan_holes
            WHERE game_plan_set_id = $1`,
          [data.setId],
        );
        if (holesR.rowCount === 0) {
          throw new Error('empty_holes');
        }

        await client.query('DELETE FROM game_plans WHERE round_id = $1', [data.roundId]);

        for (const h of holesR.rows) {
          await client.query(
            `INSERT INTO game_plans (
                 round_id, hole_number, plan_text, alert_text, risk_level, target_strokes
               )
               VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              data.roundId,
              h.hole_number,
              h.plan_text,
              h.alert_text,
              h.risk_level,
              h.target_strokes,
            ],
          );
        }

        if (set.target_score !== null) {
          await client.query(
            'UPDATE rounds SET target_score = $1 WHERE id = $2 AND user_id = current_user_id()::uuid',
            [set.target_score, data.roundId],
          );
        }
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'empty_holes') {
      return { error: 'プランにホールデータがありません。' };
    }
    return mapError(err, 'プランのコピーに失敗しました。');
  }

  revalidatePath(`/play/${data.roundId}/score`);
  revalidatePath(`/play/${data.roundId}`);
  return {};
}
