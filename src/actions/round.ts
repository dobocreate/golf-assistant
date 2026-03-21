'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { Round } from '@/features/round/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startRound(formData: FormData) {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  const courseId = formData.get('course_id') as string;
  if (!courseId || !UUID_RE.test(courseId)) {
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

  // ラウンド作成
  const { data: round, error } = await supabase
    .from('rounds')
    .insert({
      user_id: user.id,
      course_id: courseId,
      played_at: playedAt,
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
  if (!UUID_RE.test(roundId)) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('rounds')
    .select('*')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .single();

  return data as Round | null;
}

export async function getRoundWithCourse(roundId: string) {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  if (!UUID_RE.test(roundId)) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('rounds')
    .select('*, courses(id, name, prefecture)')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .single();

  return data;
}

export async function getActiveRound() {
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

  return data;
}

export async function completeRound(_roundId: string) {
  throw new Error('Not implemented: STORY-011 で実装予定');
}
