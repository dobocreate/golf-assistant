'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { createRakutenGoraSource } from '@/lib/course-source/rakuten-gora';
import { env } from '@/lib/env';
import type { Course } from '@/features/course/types';

export async function getSavedCourses(): Promise<Course[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('courses')
    .select('id, gora_id, name, prefecture, address, layout_url')
    .order('name');

  return data ?? [];
}

export async function saveCourseFromGora(goraId: string): Promise<{ error?: string; courseId?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  if (!goraId) return { error: 'コースIDが必要です。' };

  const supabase = await createClient();

  // 既に保存済みかチェック
  const { data: existing } = await supabase
    .from('courses')
    .select('id')
    .eq('gora_id', goraId)
    .single();

  if (existing) {
    return { courseId: existing.id };
  }

  // 楽天GORA APIから詳細取得
  const appId = env.RAKUTEN_APP_ID;
  if (!appId) return { error: '楽天GORA APIが設定されていません。' };

  const gora = createRakutenGoraSource(appId);
  const detail = await gora.getDetail(goraId);

  if (!detail) return { error: 'コース情報の取得に失敗しました。' };

  // DBに保存
  const { data: course, error } = await supabase
    .from('courses')
    .insert({
      gora_id: goraId,
      name: detail.name,
      prefecture: detail.prefecture,
      address: detail.address,
      layout_url: detail.layout_url,
      raw_data: detail.raw_data,
    })
    .select('id')
    .single();

  if (error) return { error: 'コースの保存に失敗しました。' };

  revalidatePath('/courses');
  return { courseId: course.id };
}

export async function getCourseWithHoles(courseId: string) {
  const user = await getAuthenticatedUser();
  if (!user) return { course: null, holes: [] };

  const supabase = await createClient();

  const [courseResult, holesResult] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('holes').select('*').eq('course_id', courseId).order('hole_number'),
  ]);

  return {
    course: courseResult.data as Course | null,
    holes: holesResult.data ?? [],
  };
}

export async function upsertHoleNote(formData: FormData): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  const holeId = formData.get('hole_id') as string;
  if (!holeId) return { error: 'ホールIDが必要です。' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('hole_notes')
    .upsert(
      {
        user_id: user.id,
        hole_id: holeId,
        note: (formData.get('note') as string) || null,
        strategy: (formData.get('strategy') as string) || null,
      },
      { onConflict: 'user_id,hole_id' }
    );

  if (error) return { error: 'メモの保存に失敗しました。' };

  // holeIdからcourse_idを取得してコース詳細ページも再検証
  const { data: hole } = await supabase.from('holes').select('course_id').eq('id', holeId).single();
  if (hole?.course_id) {
    revalidatePath(`/courses/${hole.course_id}`);
  }
  revalidatePath('/courses');
  return {};
}
