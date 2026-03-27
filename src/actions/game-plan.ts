'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { GamePlan, RiskLevel } from '@/features/game-plan/types';
import { RISK_LEVEL_VALUES } from '@/features/game-plan/types';
import { isValidUUID } from '@/lib/utils';

async function verifyRoundOwnership(roundId: string) {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' as const, supabase: null };
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' as const, supabase: null };

  const supabase = await createClient();
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .single();
  if (!round) return { error: 'ラウンドが見つかりません。' as const, supabase: null };

  return { error: null, supabase };
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

export async function getGamePlans(roundId: string): Promise<GamePlan[]> {
  const { error, supabase } = await verifyRoundOwnership(roundId);
  if (error || !supabase) return [];

  const { data } = await supabase
    .from('game_plans')
    .select('*')
    .eq('round_id', roundId)
    .order('hole_number');

  return (data as GamePlan[]) ?? [];
}

export async function upsertGamePlan(data: {
  roundId: string;
  holeNumber: number;
  planText?: string | null;
  alertText?: string | null;
  riskLevel?: RiskLevel | null;
  targetStrokes?: number | null;
}): Promise<{ error?: string }> {
  const holeError = validateHoleNumber(data.holeNumber);
  if (holeError) return { error: holeError };

  const fieldError = validateGamePlanFields(data);
  if (fieldError) return { error: fieldError };

  const { error, supabase } = await verifyRoundOwnership(data.roundId);
  if (error || !supabase) return { error: error ?? 'エラーが発生しました。' };

  const { error: upsertError } = await supabase
    .from('game_plans')
    .upsert(
      {
        round_id: data.roundId,
        hole_number: data.holeNumber,
        plan_text: data.planText ?? null,
        alert_text: data.alertText ?? null,
        risk_level: data.riskLevel ?? null,
        target_strokes: data.targetStrokes ?? null,
      },
      { onConflict: 'round_id,hole_number' }
    );

  if (upsertError) return { error: 'ゲームプランの保存に失敗しました。' };

  revalidatePath(`/play/${data.roundId}/score`);
  revalidatePath(`/rounds/${data.roundId}`);
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

  const holeNumbers = data.plans.map(p => p.holeNumber);
  if (new Set(holeNumbers).size !== holeNumbers.length) {
    return { error: 'ホール番号が重複しています。' };
  }

  for (const plan of data.plans) {
    const holeError = validateHoleNumber(plan.holeNumber);
    if (holeError) return { error: holeError };

    const fieldError = validateGamePlanFields(plan);
    if (fieldError) return { error: fieldError };
  }

  const { error, supabase } = await verifyRoundOwnership(data.roundId);
  if (error || !supabase) return { error: error ?? 'エラーが発生しました。' };

  const { error: upsertError } = await supabase
    .from('game_plans')
    .upsert(
      data.plans.map(plan => ({
        round_id: data.roundId,
        hole_number: plan.holeNumber,
        plan_text: plan.planText ?? null,
        alert_text: plan.alertText ?? null,
        risk_level: plan.riskLevel ?? null,
        target_strokes: plan.targetStrokes ?? null,
      })),
      { onConflict: 'round_id,hole_number' }
    );

  if (upsertError) return { error: 'ゲームプランの一括保存に失敗しました。' };

  revalidatePath(`/play/${data.roundId}/score`);
  revalidatePath(`/rounds/${data.roundId}`);
  return {};
}

export async function deleteGamePlan(data: {
  roundId: string;
  holeNumber: number;
}): Promise<{ error?: string }> {
  const holeError = validateHoleNumber(data.holeNumber);
  if (holeError) return { error: holeError };

  const { error, supabase } = await verifyRoundOwnership(data.roundId);
  if (error || !supabase) return { error: error ?? 'エラーが発生しました。' };

  const { error: deleteError } = await supabase
    .from('game_plans')
    .delete()
    .eq('round_id', data.roundId)
    .eq('hole_number', data.holeNumber);

  if (deleteError) return { error: 'ゲームプランの削除に失敗しました。' };

  revalidatePath(`/play/${data.roundId}/score`);
  revalidatePath(`/rounds/${data.roundId}`);
  return {};
}

export async function updateTargetScore(data: {
  roundId: string;
  targetScore: number | null;
}): Promise<{ error?: string }> {
  if (data.targetScore !== null) {
    if (!Number.isInteger(data.targetScore) || data.targetScore < 50 || data.targetScore > 200) {
      return { error: '目標スコアが不正です（50〜200）。' };
    }
  }

  const { error, supabase } = await verifyRoundOwnership(data.roundId);
  if (error || !supabase) return { error: error ?? 'エラーが発生しました。' };

  const { error: updateError } = await supabase
    .from('rounds')
    .update({ target_score: data.targetScore })
    .eq('id', data.roundId);

  if (updateError) return { error: '目標スコアの更新に失敗しました。' };

  revalidatePath(`/play/${data.roundId}/score`);
  revalidatePath(`/rounds/${data.roundId}`);
  return {};
}
