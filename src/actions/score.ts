'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { Score } from '@/features/score/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function upsertScore(data: {
  roundId: string;
  holeNumber: number;
  strokes: number;
  putts: number | null;
  fairwayHit: boolean | null;
  greenInReg: boolean | null;
}): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  if (!UUID_RE.test(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) return { error: 'ホール番号が不正です。' };
  if (!Number.isInteger(data.strokes) || data.strokes < 1 || data.strokes > 20) return { error: '打数が不正です。' };
  if (data.putts !== null && (!Number.isInteger(data.putts) || data.putts < 0 || data.putts > 10)) return { error: 'パット数が不正です。' };

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
      },
      { onConflict: 'round_id,hole_number' }
    );

  if (error) return { error: 'スコアの保存に失敗しました。' };

  revalidatePath(`/play/${data.roundId}/score`);
  return {};
}

export async function getScores(roundId: string): Promise<Score[]> {
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
    .from('scores')
    .select('*')
    .eq('round_id', roundId)
    .order('hole_number');

  return (data as Score[]) ?? [];
}

export async function getScoresWithHoles(roundId: string) {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  if (!UUID_RE.test(roundId)) return null;

  const supabase = await createClient();

  // ラウンド + コース情報を取得
  const { data: round } = await supabase
    .from('rounds')
    .select('id, course_id, status, courses(id, name)')
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
