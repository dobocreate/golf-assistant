'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { GamePlanSet, GamePlanHole, GamePlanSetWithHoles, RiskLevel } from '@/features/game-plan/types';
import { RISK_LEVEL_VALUES } from '@/features/game-plan/types';
import { isValidUUID } from '@/lib/utils';

function revalidateGamePlanSetPaths() {
  revalidatePath('/game-plans');
}

/** ユーザーの全プランセット一覧（コース名付き） */
export async function getGamePlanSets(): Promise<(GamePlanSet & { course_name: string })[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('game_plan_sets')
    .select('*, courses(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch game plan sets:', error.message);
    return [];
  }

  return (data ?? []).map(d => ({
    ...d,
    course_name: ((d.courses as unknown) as { name: string } | null)?.name ?? '不明なコース',
  })) as (GamePlanSet & { course_name: string })[];
}

/** 特定コースのプランセット一覧 */
export async function getGamePlanSetsByCourse(courseId: string): Promise<GamePlanSet[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];
  if (!isValidUUID(courseId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('game_plan_sets')
    .select('*')
    .eq('user_id', user.id)
    .eq('course_id', courseId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch game plan sets by course:', error.message);
    return [];
  }

  return (data as GamePlanSet[]) ?? [];
}

/** プランセット＋ホール詳細を取得 */
export async function getGamePlanSetWithHoles(setId: string): Promise<GamePlanSetWithHoles | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  if (!isValidUUID(setId)) return null;

  const supabase = await createClient();
  const { data: set } = await supabase
    .from('game_plan_sets')
    .select('*')
    .eq('id', setId)
    .eq('user_id', user.id)
    .single();

  if (!set) return null;

  const { data: holes } = await supabase
    .from('game_plan_holes')
    .select('*')
    .eq('game_plan_set_id', setId)
    .order('hole_number');

  return {
    ...(set as GamePlanSet),
    holes: (holes as GamePlanHole[]) ?? [],
  };
}

/** プランセット作成 */
export async function createGamePlanSet(data: {
  courseId: string;
  name: string;
  targetScore?: number | null;
}): Promise<{ error?: string; id?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!isValidUUID(data.courseId)) return { error: 'コースIDが不正です。' };

  const trimmed = data.name.trim();
  if (!trimmed) return { error: 'プラン名を入力してください。' };
  if (trimmed.length > 100) return { error: 'プラン名は100文字以内です。' };

  if (data.targetScore !== undefined && data.targetScore !== null) {
    if (!Number.isInteger(data.targetScore) || data.targetScore < 50 || data.targetScore > 200) {
      return { error: '目標スコアは50〜200の整数です。' };
    }
  }

  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from('game_plan_sets')
    .insert({
      user_id: user.id,
      course_id: data.courseId,
      name: trimmed,
      target_score: data.targetScore ?? null,
    })
    .select('id')
    .single();

  if (error) return { error: 'プランセットの作成に失敗しました。' };

  revalidateGamePlanSetPaths();
  return { id: result.id };
}

/** プランセット更新（名前・目標スコア） */
export async function updateGamePlanSet(data: {
  setId: string;
  name: string;
  targetScore?: number | null;
}): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!isValidUUID(data.setId)) return { error: 'IDが不正です。' };

  const trimmed = data.name.trim();
  if (!trimmed) return { error: 'プラン名を入力してください。' };
  if (trimmed.length > 100) return { error: 'プラン名は100文字以内です。' };

  if (data.targetScore !== undefined && data.targetScore !== null) {
    if (!Number.isInteger(data.targetScore) || data.targetScore < 50 || data.targetScore > 200) {
      return { error: '目標スコアは50〜200の整数です。' };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('game_plan_sets')
    .update({ name: trimmed, target_score: data.targetScore ?? null })
    .eq('id', data.setId)
    .eq('user_id', user.id);

  if (error) return { error: 'プランセットの更新に失敗しました。' };

  revalidateGamePlanSetPaths();
  return {};
}

/** プランセット削除 */
export async function deleteGamePlanSet(setId: string): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!isValidUUID(setId)) return { error: 'IDが不正です。' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('game_plan_sets')
    .delete()
    .eq('id', setId)
    .eq('user_id', user.id);

  if (error) return { error: 'プランセットの削除に失敗しました。' };

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
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!isValidUUID(data.setId)) return { error: 'IDが不正です。' };
  if (data.holes.length === 0) return {};
  if (data.holes.length > 18) return { error: 'ホールは最大18件です。' };

  for (const h of data.holes) {
    if (!Number.isInteger(h.holeNumber) || h.holeNumber < 1 || h.holeNumber > 18) {
      return { error: 'ホール番号が不正です。' };
    }
    if (h.planText && h.planText.length > 2000) return { error: 'プランテキストが長すぎます。' };
    if (h.alertText && h.alertText.length > 1000) return { error: 'アラートテキストが長すぎます。' };
    if (h.riskLevel && !RISK_LEVEL_VALUES.includes(h.riskLevel)) return { error: 'リスクレベルが不正です。' };
    if (h.targetStrokes !== undefined && h.targetStrokes !== null) {
      if (!Number.isInteger(h.targetStrokes) || h.targetStrokes < 1 || h.targetStrokes > 20) {
        return { error: '目標打数が不正です。' };
      }
    }
  }

  // セットの所有権確認
  const supabase = await createClient();
  const { data: set } = await supabase
    .from('game_plan_sets')
    .select('id')
    .eq('id', data.setId)
    .eq('user_id', user.id)
    .single();
  if (!set) return { error: 'プランセットが見つかりません。' };

  const { error } = await supabase
    .from('game_plan_holes')
    .upsert(
      data.holes.map(h => ({
        game_plan_set_id: data.setId,
        hole_number: h.holeNumber,
        plan_text: h.planText ?? null,
        alert_text: h.alertText ?? null,
        risk_level: h.riskLevel ?? null,
        target_strokes: h.targetStrokes ?? null,
      })),
      { onConflict: 'game_plan_set_id,hole_number' }
    );

  if (error) return { error: 'ホールデータの保存に失敗しました。' };

  revalidateGamePlanSetPaths();
  return {};
}

/** プランセットをラウンドにコピー（ラウンド開始時） */
export async function applyGamePlanSetToRound(data: {
  setId: string;
  roundId: string;
}): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!isValidUUID(data.setId) || !isValidUUID(data.roundId)) return { error: 'IDが不正です。' };

  const supabase = await createClient();

  // セット所有権確認
  const { data: set } = await supabase
    .from('game_plan_sets')
    .select('id, target_score')
    .eq('id', data.setId)
    .eq('user_id', user.id)
    .single();
  if (!set) return { error: 'プランセットが見つかりません。' };

  // ラウンド所有権確認
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', data.roundId)
    .eq('user_id', user.id)
    .single();
  if (!round) return { error: 'ラウンドが見つかりません。' };

  // ホールデータ取得
  const { data: holes } = await supabase
    .from('game_plan_holes')
    .select('*')
    .eq('game_plan_set_id', data.setId);

  if (!holes || holes.length === 0) return { error: 'プランにホールデータがありません。' };

  // 既存のラウンドプランを削除してからコピー
  await supabase
    .from('game_plans')
    .delete()
    .eq('round_id', data.roundId);

  const { error: insertError } = await supabase
    .from('game_plans')
    .insert(
      holes.map(h => ({
        round_id: data.roundId,
        hole_number: h.hole_number,
        plan_text: h.plan_text,
        alert_text: h.alert_text,
        risk_level: h.risk_level,
        target_strokes: h.target_strokes,
      }))
    );

  if (insertError) return { error: 'プランのコピーに失敗しました。' };

  // 目標スコアもコピー
  if (set.target_score) {
    await supabase
      .from('rounds')
      .update({ target_score: set.target_score })
      .eq('id', data.roundId);
  }

  revalidatePath(`/play/${data.roundId}/score`);
  revalidatePath(`/play/${data.roundId}`);
  return {};
}
