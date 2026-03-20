'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/features/profile/types';

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  return data;
}

export async function upsertProfile(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'ログインが必要です。' };

  const handicapRaw = formData.get('handicap');
  const handicap = handicapRaw ? parseFloat(handicapRaw as string) : null;

  if (handicap !== null && (isNaN(handicap) || handicap < 0 || handicap > 54)) {
    return { error: 'ハンディキャップは0〜54の範囲で入力してください。' };
  }

  const profileData = {
    user_id: user.id,
    handicap,
    play_style: (formData.get('play_style') as string) || null,
    miss_tendency: (formData.get('miss_tendency') as string) || null,
    fatigue_note: (formData.get('fatigue_note') as string) || null,
    favorite_shot: (formData.get('favorite_shot') as string) || null,
    favorite_distance: (formData.get('favorite_distance') as string) || null,
    situation_notes: (formData.get('situation_notes') as string) || null,
  };

  const { error } = await supabase
    .from('profiles')
    .upsert(profileData, { onConflict: 'user_id' });

  if (error) {
    return { error: 'プロファイルの保存に失敗しました。' };
  }

  revalidatePath('/profile');
  return {};
}
