'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { Shot, ShotResult, DirectionLR, DirectionFB, ShotLie, ShotSlopeFB, ShotSlopeLR, ShotLanding } from '@/features/score/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_RESULTS: ShotResult[] = ['excellent', 'good', 'fair', 'poor'];
const VALID_MISS_TYPES = ['フック', 'スライス', 'ダフリ', 'トップ', 'シャンク'];
const VALID_DIRECTION_LR: DirectionLR[] = ['left', 'center', 'right'];
const VALID_DIRECTION_FB: DirectionFB[] = ['short', 'center', 'long'];
const VALID_LIES: ShotLie[] = ['tee', 'fairway', 'rough', 'bunker', 'woods'];
const VALID_SLOPE_FB: ShotSlopeFB[] = ['toe_up', 'toe_down'];
const VALID_SLOPE_LR: ShotSlopeLR[] = ['left_up', 'left_down'];
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
  return null;
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

  const validationError = validateShotFields(data);
  if (validationError) return { error: validationError };

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
      direction_lr: data.directionLr,
      direction_fb: data.directionFb,
      lie: data.lie,
      slope_fb: data.slopeFb,
      slope_lr: data.slopeLr,
      landing: data.landing,
    })
    .select('*')
    .single();

  if (error) return { error: 'ショットの保存に失敗しました。' };

  revalidatePath(`/play/${data.roundId}/score`);
  return { shot: shot as Shot };
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
}): Promise<{ error?: string; shot?: Shot }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  if (!UUID_RE.test(data.shotId)) return { error: 'ショットIDが不正です。' };
  if (!UUID_RE.test(data.roundId)) return { error: 'ラウンドIDが不正です。' };

  const validationError = validateShotFields(data);
  if (validationError) return { error: validationError };

  const supabase = await createClient();

  // ラウンドの所有確認（in_progress のみ許可）
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
    .update({
      club: data.club,
      result: data.result,
      miss_type: data.missType,
      direction_lr: data.directionLr,
      direction_fb: data.directionFb,
      lie: data.lie,
      slope_fb: data.slopeFb,
      slope_lr: data.slopeLr,
      landing: data.landing,
    })
    .eq('id', data.shotId)
    .eq('round_id', data.roundId)
    .select('*')
    .single();

  if (error) return { error: 'ショットの更新に失敗しました。' };

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

export async function updateShotAdvice(data: {
  roundId: string;
  holeNumber: number;
  shotNumber: number;
  adviceText: string;
}): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!UUID_RE.test(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) return { error: 'ホール番号が不正です。' };
  if (!Number.isInteger(data.shotNumber) || data.shotNumber < 1 || data.shotNumber > 20) return { error: 'ショット番号が不正です。' };
  if (!data.adviceText.trim()) return { error: 'アドバイスが空です。' };
  if (data.adviceText.length > 5000) return { error: 'アドバイスが長すぎます。' };

  const supabase = await createClient();

  // ラウンド所有確認
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', data.roundId)
    .eq('user_id', user.id)
    .single();
  if (!round) return { error: 'ラウンドが見つかりません。' };

  // 該当ショットの advice_text を更新
  const { error } = await supabase
    .from('shots')
    .update({ advice_text: data.adviceText })
    .eq('round_id', data.roundId)
    .eq('hole_number', data.holeNumber)
    .eq('shot_number', data.shotNumber);

  if (error) return { error: 'アドバイスの保存に失敗しました。' };
  return {};
}

export async function getAdviceHistory(roundId: string): Promise<{
  hole_number: number;
  shot_number: number;
  advice_text: string;
  club: string | null;
}[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];
  if (!UUID_RE.test(roundId)) return [];

  const supabase = await createClient();

  // ラウンド所有確認
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .single();
  if (!round) return [];

  const { data } = await supabase
    .from('shots')
    .select('hole_number, shot_number, advice_text, club')
    .eq('round_id', roundId)
    .not('advice_text', 'is', null)
    .order('hole_number')
    .order('shot_number');

  return (data ?? []) as { hole_number: number; shot_number: number; advice_text: string; club: string | null }[];
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
