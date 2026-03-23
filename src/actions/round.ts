'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { Round, RoundWithCourse } from '@/features/round/types';
import { isValidUUID } from '@/lib/utils';

export async function startRound(formData: FormData) {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  const courseId = formData.get('course_id') as string;
  if (!courseId || !isValidUUID(courseId)) {
    return { error: 'コースを選択してください。' };
  }

  const playedAt = (formData.get('played_at') as string) || new Date().toISOString().split('T')[0];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_RE.test(playedAt)) {
    return { error: 'プレー日の形式が不正です。' };
  }

  const supabase = await createClient();

  // コースの存在確認
  const { data: course } = await supabase
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .single();

  if (!course) {
    return { error: '選択されたコースが見つかりません。' };
  }

  const startingCourse = formData.get('starting_course');
  if (startingCourse !== 'out' && startingCourse !== 'in') {
    return { error: 'スタートコースを選択してください。' };
  }

  // ラウンド作成
  const { data: round, error } = await supabase
    .from('rounds')
    .insert({
      user_id: user.id,
      course_id: courseId,
      played_at: playedAt,
      starting_course: startingCourse,
      status: 'in_progress',
    })
    .select('id')
    .single();

  if (error) {
    return { error: 'ラウンドの作成に失敗しました。' };
  }

  revalidatePath('/play');
  revalidatePath('/rounds');
  redirect(`/play/${round.id}`);
}

export async function getRound(roundId: string): Promise<Round | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  if (!isValidUUID(roundId)) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('rounds')
    .select('*')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .single();

  return data as Round | null;
}

export async function getRoundWithCourse(roundId: string): Promise<RoundWithCourse | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  if (!isValidUUID(roundId)) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('rounds')
    .select('*, courses(id, name, prefecture)')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .single();

  return data as RoundWithCourse | null;
}

export async function getActiveRound(): Promise<RoundWithCourse | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('rounds')
    .select('*, courses(id, name, prefecture)')
    .eq('user_id', user.id)
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as RoundWithCourse | null;
}

export async function completeRound(
  _prevState: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  const roundId = formData.get('roundId') as string;
  if (!roundId || !isValidUUID(roundId)) {
    return { error: 'ラウンドIDが不正です。' };
  }

  const supabase = await createClient();

  // ラウンドの所有確認 + status='in_progress' チェック
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .eq('status', 'in_progress')
    .single();

  if (!round) {
    return { error: 'ラウンドが見つからない、または既に完了しています。' };
  }

  // スコアを取得して合計打数を計算
  const { data: scores } = await supabase
    .from('scores')
    .select('strokes')
    .eq('round_id', roundId);

  const totalScore = (scores ?? []).reduce((sum, s) => sum + s.strokes, 0);

  // ラウンドを完了に更新
  const { error } = await supabase
    .from('rounds')
    .update({
      status: 'completed',
      total_score: totalScore > 0 ? totalScore : null,
    })
    .eq('id', roundId)
    .eq('user_id', user.id);

  if (error) {
    return { error: 'ラウンドの完了に失敗しました。' };
  }

  revalidatePath('/play');
  revalidatePath('/rounds');
  revalidatePath(`/rounds/${roundId}`);
  redirect(`/rounds/${roundId}`);
}
