'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, db, type PoolClient } from '@/lib/db/neon';
import type { GamePlan, RiskLevel } from '@/features/game-plan/types';
import { RISK_LEVEL_VALUES } from '@/features/game-plan/types';
import { isValidUUID } from '@/lib/utils';

async function assertRoundOwned(client: PoolClient, roundId: string): Promise<void> {
  const r = await client.query<{ id: string }>(
    'SELECT id FROM rounds WHERE id = $1 AND user_id = current_user_id()::uuid',
    [roundId],
  );
  if (r.rowCount === 0) {
    throw new Error('round_not_found');
  }
}

function validateHoleNumber(holeNumber: number): string | null {
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    return 'ホール番号が不正です。';
  }
  return null;
}

function validateGamePlanFields(data: {
  planText?: string | null;
  alertText?: string | null;
  riskLevel?: RiskLevel | null;
  targetStrokes?: number | null;
}): string | null {
  if (data.planText && data.planText.length > 2000) {
    return 'プランテキストが長すぎます（2000文字以内）。';
  }
  if (data.alertText && data.alertText.length > 1000) {
    return 'アラートテキストが長すぎます（1000文字以内）。';
  }
  if (data.riskLevel !== undefined && data.riskLevel !== null && !RISK_LEVEL_VALUES.includes(data.riskLevel)) {
    return 'リスクレベルが不正です。';
  }
  if (data.targetStrokes !== undefined && data.targetStrokes !== null) {
    if (!Number.isInteger(data.targetStrokes) || data.targetStrokes < 1 || data.targetStrokes > 20) {
      return '目標打数が不正です。';
    }
  }
  return null;
}

function revalidateGamePlanPaths(roundId: string) {
  revalidatePath(`/play/${roundId}/score`);
  revalidatePath(`/rounds/${roundId}`);
}

function mapError(err: unknown, fallback: string): { error: string } {
  if (err instanceof Error) {
    if (err.message === 'round_not_found') return { error: 'ラウンドが見つかりません。' };
    if (err.message.startsWith('unauthorized')) return { error: 'ログインが必要です。' };
  }
  console.error(fallback, err);
  return { error: fallback };
}

export async function getGamePlans(roundId: string): Promise<GamePlan[]> {
  if (!isValidUUID(roundId)) return [];
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        await assertRoundOwned(client, roundId);
        const r = await client.query<GamePlan>(
          'SELECT * FROM game_plans WHERE round_id = $1 ORDER BY hole_number',
          [roundId],
        );
        return r.rows;
      });
    });
  } catch {
    return [];
  }
}

export async function upsertGamePlan(data: {
  roundId: string;
  holeNumber: number;
  planText?: string | null;
  alertText?: string | null;
  riskLevel?: RiskLevel | null;
  targetStrokes?: number | null;
}): Promise<{ error?: string }> {
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  const holeError = validateHoleNumber(data.holeNumber);
  if (holeError) return { error: holeError };
  const fieldError = validateGamePlanFields(data);
  if (fieldError) return { error: fieldError };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, data.roundId);
        await client.query(
          `INSERT INTO game_plans (round_id, hole_number, plan_text, alert_text, risk_level, target_strokes)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (round_id, hole_number) DO UPDATE SET
             plan_text = EXCLUDED.plan_text,
             alert_text = EXCLUDED.alert_text,
             risk_level = EXCLUDED.risk_level,
             target_strokes = EXCLUDED.target_strokes`,
          [
            data.roundId,
            data.holeNumber,
            data.planText ?? null,
            data.alertText ?? null,
            data.riskLevel ?? null,
            data.targetStrokes ?? null,
          ],
        );
      });
    });
  } catch (err) {
    return mapError(err, 'ゲームプランの保存に失敗しました。');
  }

  revalidateGamePlanPaths(data.roundId);
  return {};
}

export async function upsertGamePlansBatch(data: {
  roundId: string;
  plans: Array<{
    holeNumber: number;
    planText?: string | null;
    alertText?: string | null;
    riskLevel?: RiskLevel | null;
    targetStrokes?: number | null;
  }>;
}): Promise<{ error?: string }> {
  if (data.plans.length === 0) return {};
  if (data.plans.length > 18) return { error: 'プランは最大18件です。' };

  const holeNumbers = data.plans.map((p) => p.holeNumber);
  if (new Set(holeNumbers).size !== holeNumbers.length) {
    return { error: 'ホール番号が重複しています。' };
  }

  for (const plan of data.plans) {
    const holeError = validateHoleNumber(plan.holeNumber);
    if (holeError) return { error: holeError };
    const fieldError = validateGamePlanFields(plan);
    if (fieldError) return { error: fieldError };
  }

  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, data.roundId);
        for (const plan of data.plans) {
          await client.query(
            `INSERT INTO game_plans (round_id, hole_number, plan_text, alert_text, risk_level, target_strokes)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (round_id, hole_number) DO UPDATE SET
               plan_text = EXCLUDED.plan_text,
               alert_text = EXCLUDED.alert_text,
               risk_level = EXCLUDED.risk_level,
               target_strokes = EXCLUDED.target_strokes`,
            [
              data.roundId,
              plan.holeNumber,
              plan.planText ?? null,
              plan.alertText ?? null,
              plan.riskLevel ?? null,
              plan.targetStrokes ?? null,
            ],
          );
        }
      });
    });
  } catch (err) {
    return mapError(err, 'ゲームプランの一括保存に失敗しました。');
  }

  revalidateGamePlanPaths(data.roundId);
  return {};
}

export async function deleteGamePlan(data: {
  roundId: string;
  holeNumber: number;
}): Promise<{ error?: string }> {
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  const holeError = validateHoleNumber(data.holeNumber);
  if (holeError) return { error: holeError };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, data.roundId);
        await client.query(
          'DELETE FROM game_plans WHERE round_id = $1 AND hole_number = $2',
          [data.roundId, data.holeNumber],
        );
      });
    });
  } catch (err) {
    return mapError(err, 'ゲームプランの削除に失敗しました。');
  }

  revalidateGamePlanPaths(data.roundId);
  return {};
}

export async function updateTargetScore(data: {
  roundId: string;
  targetScore: number | null;
}): Promise<{ error?: string }> {
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  if (data.targetScore !== null) {
    if (!Number.isInteger(data.targetScore) || data.targetScore < 50 || data.targetScore > 200) {
      return { error: '目標スコアが不正です（50〜200）。' };
    }
  }

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        const r = await client.query(
          'UPDATE rounds SET target_score = $1 WHERE id = $2 AND user_id = current_user_id()::uuid',
          [data.targetScore, data.roundId],
        );
        if (r.rowCount === 0) {
          throw new Error('round_not_found');
        }
      });
    });
  } catch (err) {
    return mapError(err, '目標スコアの更新に失敗しました。');
  }

  revalidateGamePlanPaths(data.roundId);
  return {};
}
