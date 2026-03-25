'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { Companion, CompanionScore } from '@/features/score/types';
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

export async function getCompanions(roundId: string): Promise<Companion[]> {
  const { error, supabase } = await verifyRoundOwnership(roundId);
  if (error || !supabase) return [];

  const { data } = await supabase
    .from('companions')
    .select('*')
    .eq('round_id', roundId)
    .order('sort_order')
    .order('name');

  return (data as Companion[]) ?? [];
}

export async function addCompanion(roundId: string, name: string): Promise<{ error?: string; companion?: Companion }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: '名前を入力してください。' };
  if (trimmed.length > 20) return { error: '名前は20文字以内で入力してください。' };

  const { error, supabase } = await verifyRoundOwnership(roundId);
  if (error || !supabase) return { error: error ?? 'エラーが発生しました。' };

  // 同伴者数の上限チェック（最大3人）
  const { count } = await supabase
    .from('companions')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', roundId);
  if ((count ?? 0) >= 3) return { error: '同伴者は最大3人までです。' };

  const { data, error: insertError } = await supabase
    .from('companions')
    .insert({ round_id: roundId, name: trimmed, sort_order: (count ?? 0) })
    .select('*')
    .single();

  if (insertError) {
    if (insertError.code === '23505') return { error: '同じ名前の同伴者が既に登録されています。' };
    return { error: '同伴者の追加に失敗しました。' };
  }

  revalidatePath(`/play/${roundId}`);
  return { companion: data as Companion };
}

export async function deleteCompanion(roundId: string, companionId: string): Promise<{ error?: string }> {
  if (!isValidUUID(companionId)) return { error: 'IDが不正です。' };

  const { error, supabase } = await verifyRoundOwnership(roundId);
  if (error || !supabase) return { error: error ?? 'エラーが発生しました。' };

  const { error: deleteError } = await supabase
    .from('companions')
    .delete()
    .eq('id', companionId)
    .eq('round_id', roundId);

  if (deleteError) return { error: '同伴者の削除に失敗しました。' };

  revalidatePath(`/play/${roundId}`);
  return {};
}

export async function getCompanionScores(roundId: string): Promise<{ companion: Companion; scores: CompanionScore[] }[]> {
  const { error, supabase } = await verifyRoundOwnership(roundId);
  if (error || !supabase) return [];

  const { data, error: fetchError } = await supabase
    .from('companions')
    .select('*, scores:companion_scores(*)')
    .eq('round_id', roundId)
    .order('sort_order')
    .order('name');

  if (fetchError || !data) return [];

  return data.map(({ scores, ...companionData }) => ({
    companion: companionData as Companion,
    scores: (scores as CompanionScore[]) ?? [],
  }));
}

export async function upsertCompanionScore(data: {
  companionId: string;
  roundId: string;
  holeNumber: number;
  strokes: number | null;
  putts: number | null;
}): Promise<{ error?: string }> {
  if (!isValidUUID(data.companionId)) return { error: 'IDが不正です。' };
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }
  if (data.strokes !== null && (!Number.isInteger(data.strokes) || data.strokes < 1 || data.strokes > 20)) {
    return { error: '打数が不正です。' };
  }
  if (data.putts !== null && (!Number.isInteger(data.putts) || data.putts < 0 || data.putts > 10)) {
    return { error: 'パット数が不正です。' };
  }
  if (data.strokes !== null && data.putts !== null && data.putts > data.strokes) {
    return { error: 'パット数が打数を超えています。' };
  }

  const { error, supabase } = await verifyRoundOwnership(data.roundId);
  if (error || !supabase) return { error: error ?? 'エラーが発生しました。' };

  const { error: upsertError } = await supabase
    .from('companion_scores')
    .upsert(
      {
        companion_id: data.companionId,
        hole_number: data.holeNumber,
        strokes: data.strokes,
        putts: data.putts,
      },
      { onConflict: 'companion_id,hole_number' }
    );

  if (upsertError) return { error: 'スコアの保存に失敗しました。' };
  return {};
}

/** 同伴者スコアの一括保存（カード画面の保存ボタン用） */
export async function upsertCompanionScoresBatch(data: {
  roundId: string;
  holeNumber: number;
  scores: Array<{ companionId: string; strokes: number | null; putts: number | null }>;
}): Promise<{ error?: string }> {
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }

  // strokes/putts両方nullのエントリを除外
  const validScores = data.scores.filter(s => s.strokes !== null || s.putts !== null);
  if (validScores.length === 0) return {};

  // 各エントリのバリデーション
  for (const s of validScores) {
    if (!isValidUUID(s.companionId)) return { error: 'IDが不正です。' };
    if (s.strokes !== null && (!Number.isInteger(s.strokes) || s.strokes < 1 || s.strokes > 20)) {
      return { error: '打数が不正です。' };
    }
    if (s.putts !== null && (!Number.isInteger(s.putts) || s.putts < 0 || s.putts > 10)) {
      return { error: 'パット数が不正です。' };
    }
    if (s.strokes !== null && s.putts !== null && s.putts > s.strokes) {
      return { error: 'パット数が打数を超えています。' };
    }
  }

  // 認証+所有権チェック1回
  const { error, supabase } = await verifyRoundOwnership(data.roundId);
  if (error || !supabase) return { error: error ?? 'エラーが発生しました。' };

  // 一括upsert
  const { error: upsertError } = await supabase
    .from('companion_scores')
    .upsert(
      validScores.map(s => ({
        companion_id: s.companionId,
        hole_number: data.holeNumber,
        strokes: s.strokes,
        putts: s.putts,
      })),
      { onConflict: 'companion_id,hole_number' }
    );

  if (upsertError) return { error: '同伴者スコアの保存に失敗しました。' };
  return {};
}
