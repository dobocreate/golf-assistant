'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { Shot, ShotResult } from '@/features/score/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_RESULTS: ShotResult[] = ['excellent', 'good', 'fair', 'poor'];
const VALID_MISS_TYPES = ['フック', 'スライス', 'ダフリ', 'トップ', 'シャンク'];

export async function recordShot(data: {
  roundId: string;
  holeNumber: number;
  shotNumber: number;
  club: string | null;
  result: ShotResult | null;
  missType: string | null;
}): Promise<{ error?: string; shot?: Shot }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  if (!UUID_RE.test(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }
  if (!Number.isInteger(data.shotNumber) || data.shotNumber < 1 || data.shotNumber > 20) {
    return { error: 'ショット番号が不正です。' };
  }
  if (data.result !== null && !VALID_RESULTS.includes(data.result)) {
    return { error: 'ショット結果が不正です。' };
  }
  if (data.missType !== null && !VALID_MISS_TYPES.includes(data.missType)) {
    return { error: 'ミスタイプが不正です。' };
  }

  const supabase = await createClient();

  // ラウンドの所有確認
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', data.roundId)
    .eq('user_id', user.id)
    .eq('status', 'in_progress')
    .single();

  if (!round) return { error: 'ラウンドが見つかりません。' };

  const { data: shot, error } = await supabase
    .from('shots')
    .insert({
      round_id: data.roundId,
      hole_number: data.holeNumber,
      shot_number: data.shotNumber,
      club: data.club,
      result: data.result,
      miss_type: data.missType,
    })
    .select('*')
    .single();

  if (error) return { error: 'ショットの保存に失敗しました。' };

  revalidatePath(`/play/${data.roundId}/score`);
  return { shot: shot as Shot };
}

export async function getShots(roundId: string, holeNumber: number): Promise<Shot[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];
  if (!UUID_RE.test(roundId)) return [];

  const supabase = await createClient();

  // ラウンドの所有確認
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .single();
  if (!round) return [];

  const { data } = await supabase
    .from('shots')
    .select('*')
    .eq('round_id', roundId)
    .eq('hole_number', holeNumber)
    .order('shot_number');

  return (data as Shot[]) ?? [];
}

export async function deleteShot(shotId: string, roundId: string): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!UUID_RE.test(shotId) || !UUID_RE.test(roundId)) return { error: 'IDが不正です。' };

  const supabase = await createClient();

  // ラウンドの所有確認
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .single();
  if (!round) return { error: 'ラウンドが見つかりません。' };

  const { error } = await supabase
    .from('shots')
    .delete()
    .eq('id', shotId)
    .eq('round_id', roundId);

  if (error) return { error: 'ショットの削除に失敗しました。' };

  revalidatePath(`/play/${roundId}/score`);
  return {};
}
