'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { Round, RoundWithCourse } from '@/features/round/types';
import { WEATHER_VALUES, WIND_STRENGTH_VALUES } from '@/features/round/types';
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

  const gamePlanSetId = formData.get('game_plan_set_id') as string | null;

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

  // ゲームプランセットをラウンドにコピー
  if (gamePlanSetId && isValidUUID(gamePlanSetId)) {
    const { applyGamePlanSetToRound } = await import('@/actions/game-plan-set');
    const planResult = await applyGamePlanSetToRound({ setId: gamePlanSetId, roundId: round.id });
    if (planResult.error) {
      // プランコピー失敗はラウンド開始を止めない（警告のみ）
      console.error('Failed to apply game plan:', planResult.error);
    }
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
    .select('id, user_id, course_id, played_at, total_score, status, created_at, starting_course, weather, wind, target_score, review_note')
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
    .select('id, user_id, course_id, played_at, total_score, status, created_at, starting_course, weather, wind, target_score, review_note, courses(id, name, prefecture)')
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
    .select('id, user_id, course_id, played_at, total_score, status, created_at, starting_course, weather, wind, target_score, review_note, courses(id, name, prefecture)')
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

  // ラウンドを完了に更新（context_snapshotもクリア）
  const { error } = await supabase
    .from('rounds')
    .update({
      status: 'completed',
      total_score: totalScore > 0 ? totalScore : null,
      context_snapshot: null,
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

/** スタートコース（OUT/IN）を変更 */
export async function updateStartingCourse(roundId: string, startingCourse: 'out' | 'in'): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('rounds')
    .update({ starting_course: startingCourse })
    .eq('id', roundId)
    .eq('user_id', user.id)
    .eq('status', 'in_progress');

  if (error) return { error: 'スタートコースの変更に失敗しました。' };

  revalidatePath(`/play/${roundId}`);
  revalidatePath(`/play/${roundId}/score`);
  revalidatePath(`/play/${roundId}/scorecard`);
  return {};
}

/** 天候を変更 */
export async function updateWeather(roundId: string, weather: string | null): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };
  if (weather !== null && !(WEATHER_VALUES as string[]).includes(weather)) {
    return { error: '天候の値が不正です。' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('rounds')
    .update({ weather })
    .eq('id', roundId)
    .eq('user_id', user.id);

  if (error) return { error: '天候の変更に失敗しました。' };
  return {};
}

/** 風を変更 */
export async function updateWind(roundId: string, wind: string | null): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };
  if (wind !== null && !(WIND_STRENGTH_VALUES as string[]).includes(wind)) {
    return { error: '風の値が不正です。' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('rounds')
    .update({ wind })
    .eq('id', roundId)
    .eq('user_id', user.id);

  if (error) return { error: '風の変更に失敗しました。' };
  return {};
}

/** 総括メモを保存（completedラウンドのみ） */
export async function saveReviewNote(roundId: string, reviewNote: string): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };
  if (reviewNote.length > 2000) return { error: '総括は2000文字以内で入力してください。' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('rounds')
    .update({ review_note: reviewNote || null })
    .eq('id', roundId)
    .eq('user_id', user.id)
    .eq('status', 'completed');

  if (error) return { error: '総括の保存に失敗しました。' };

  revalidatePath(`/rounds/${roundId}`);
  return {};
}

/** 練習提案を取得 */
export async function getPracticeSuggestion(roundId: string): Promise<string | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  if (!isValidUUID(roundId)) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('practice_suggestions')
    .select('content')
    .eq('round_id', roundId)
    .eq('user_id', user.id)
    .maybeSingle();

  return data?.content ?? null;
}

/** 練習提案を保存（upsert） */
export async function savePracticeSuggestion(roundId: string, content: string): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };
  if (content.length > 10000) return { error: '練習提案が長すぎます。' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('practice_suggestions')
    .upsert(
      { round_id: roundId, user_id: user.id, content },
      { onConflict: 'round_id' },
    );

  if (error) return { error: '練習提案の保存に失敗しました。' };

  revalidatePath(`/rounds/${roundId}`);
  return {};
}
