'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { Score } from '@/features/score/types';
import { isValidUUID } from '@/lib/utils';

function validateIntRange(value: number, min: number, max: number, label: string): string | null {
  if (!Number.isInteger(value) || value < min || value > max) return `${label}が不正です。`;
  return null;
}

function validateEnum(value: string | null, allowed: string[], label: string): string | null {
  if (value !== null && !allowed.includes(value)) return `${label}が不正です。`;
  return null;
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
}): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

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
    (data.firstPuttDistanceM != null && (typeof data.firstPuttDistanceM !== 'number' || data.firstPuttDistanceM < 0 || data.firstPuttDistanceM > 50) ? 'パット距離（数値）が不正です。' : null) ??
    validateEnum(data.windDirection, ['head', 'tail', 'left', 'right'], '風向き') ??
    validateEnum(data.windStrength, ['calm', 'light', 'moderate', 'strong'], '風の強さ');
  if (validationError) return { error: validationError };

  const supabase = await createClient();

  // ラウンドの所有確認
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', data.roundId)
    .eq('user_id', user.id)
    .in('status', ['in_progress', 'completed'])
    .single();

  if (!round) return { error: 'ラウンドが見つかりません。' };

  const { error } = await supabase
    .from('scores')
    .upsert(
      {
        round_id: data.roundId,
        hole_number: data.holeNumber,
        strokes: data.strokes,
        putts: data.putts,
        fairway_hit: data.fairwayHit,
        green_in_reg: data.greenInReg,
        tee_shot_lr: data.teeShotLr,
        tee_shot_fb: data.teeShotFb,
        ob_count: data.obCount,
        bunker_count: data.bunkerCount,
        penalty_count: data.penaltyCount,
        first_putt_distance: data.firstPuttDistance,
        first_putt_distance_m: data.firstPuttDistanceM ?? null,
        wind_direction: data.windDirection,
        wind_strength: data.windStrength,
      },
      { onConflict: 'round_id,hole_number' }
    );

  if (error) return { error: 'スコアの保存に失敗しました。' };

  // total_score 再計算
  const { data: allScores } = await supabase
    .from('scores')
    .select('strokes')
    .eq('round_id', data.roundId);
  if (allScores) {
    const total = allScores.reduce((sum: number, s: { strokes: number }) => sum + s.strokes, 0);
    await supabase
      .from('rounds')
      .update({ total_score: total })
      .eq('id', data.roundId);
  }

  revalidatePath(`/play/${data.roundId}/score`);
  revalidatePath(`/rounds/${data.roundId}`);
  revalidatePath('/rounds');
  revalidatePath('/rounds/stats');
  return {};
}

/** ファーストパット距離をscoresテーブルに同期保存（ショットレコーダーから呼ばれる） */
export async function updateFirstPuttDistance(data: {
  roundId: string;
  holeNumber: number;
  firstPuttDistance: string | null;
  firstPuttDistanceM: number | null;
}): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };

  if (data.firstPuttDistance !== null && !['short', 'mid', 'long', 'very_long'].includes(data.firstPuttDistance)) {
    return { error: 'パット距離が不正です。' };
  }
  if (data.firstPuttDistanceM !== null && (typeof data.firstPuttDistanceM !== 'number' || data.firstPuttDistanceM < 0 || data.firstPuttDistanceM > 50)) {
    return { error: 'パット距離（数値）が不正です。' };
  }

  const supabase = await createClient();

  // ラウンドの所有確認
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', data.roundId)
    .eq('user_id', user.id)
    .single();
  if (!round) return { error: 'ラウンドが見つかりません。' };

  const { error } = await supabase
    .from('scores')
    .update({
      first_putt_distance: data.firstPuttDistance,
      first_putt_distance_m: data.firstPuttDistanceM,
    })
    .eq('round_id', data.roundId)
    .eq('hole_number', data.holeNumber);

  if (error) return { error: 'パット距離の保存に失敗しました。' };
  return {};
}

export async function getScores(roundId: string): Promise<Score[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];
  if (!isValidUUID(roundId)) return [];

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
    .from('scores')
    .select('*')
    .eq('round_id', roundId)
    .order('hole_number');

  return (data as Score[]) ?? [];
}

export async function getScoresWithHoles(roundId: string) {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  if (!isValidUUID(roundId)) return null;

  const supabase = await createClient();

  // ラウンド + コース情報を取得
  const { data: round } = await supabase
    .from('rounds')
    .select('id, course_id, status, starting_course, weather, target_score, courses(id, name)')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .single();

  if (!round) return null;

  // ホール情報とスコアを並列取得
  const [holesResult, scoresResult] = await Promise.all([
    supabase
      .from('holes')
      .select('hole_number, par, distance')
      .eq('course_id', round.course_id)
      .order('hole_number'),
    supabase
      .from('scores')
      .select('*')
      .eq('round_id', roundId)
      .order('hole_number'),
  ]);

  return {
    round: {
      id: round.id,
      courseId: round.course_id,
      courseName: ((round.courses as unknown) as { name: string } | null)?.name ?? '',
      status: round.status as string,
      startingCourse: (round.starting_course === 'in' ? 'in' : 'out') as 'out' | 'in',
      weather: (round.weather as string) ?? null,
      targetScore: (round.target_score as number) ?? null,
    },
    holes: holesResult.data ?? [],
    scores: (scoresResult.data as Score[]) ?? [],
  };
}

// FormData版（未使用だが互換性のため残す）
export async function recordScore(_formData: FormData) {
  throw new Error('Use upsertScore() instead');
}

// recordShot は src/actions/shot.ts に移動しました (STORY-019)
