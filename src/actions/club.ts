'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedProfileId } from '@/lib/auth-utils';
import type { Club } from '@/features/profile/types';

export async function getClubs(): Promise<Club[]> {
  const profileId = await getAuthenticatedProfileId();
  if (!profileId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('clubs')
    .select('*')
    .eq('profile_id', profileId)
    .order('distance', { ascending: false, nullsFirst: false });

  return data ?? [];
}

export async function upsertClub(formData: FormData): Promise<{ error?: string }> {
  const profileId = await getAuthenticatedProfileId();
  if (!profileId) return { error: 'プロファイルを先に作成してください。' };

  const name = formData.get('name') as string;
  const customName = formData.get('custom_name') as string;
  const clubName = name === '__custom__' ? customName : name;

  if (!clubName?.trim()) {
    return { error: 'クラブ名は必須です。' };
  }

  const distanceRaw = formData.get('distance');
  const distance = distanceRaw ? parseInt(distanceRaw as string, 10) : null;
  if (distance !== null && isNaN(distance)) {
    return { error: '飛距離は数値で入力してください。' };
  }

  const confidenceRaw = formData.get('confidence');
  const confidence = confidenceRaw ? parseInt(confidenceRaw as string, 10) : 3;
  if (isNaN(confidence) || confidence < 1 || confidence > 5) {
    return { error: '自信度は1〜5で入力してください。' };
  }

  const distanceHalfRaw = formData.get('distance_half');
  const distanceHalf = distanceHalfRaw ? parseInt(distanceHalfRaw as string, 10) : null;
  if (distanceHalf !== null && (isNaN(distanceHalf) || distanceHalf < 0 || distanceHalf > 400)) {
    return { error: 'ハーフショット飛距離は0〜400の範囲で入力してください。' };
  }

  const successRateRaw = formData.get('success_rate');
  const successRate = successRateRaw ? parseInt(successRateRaw as string, 10) : null;
  if (successRate !== null && (isNaN(successRate) || successRate < 0 || successRate > 10)) {
    return { error: '成功率は0〜10の範囲で入力してください。' };
  }

  const clubData = {
    profile_id: profileId,
    name: clubName.trim(),
    distance,
    distance_half: distanceHalf,
    success_rate: successRate,
    is_weak: formData.get('is_weak') === 'true',
    confidence,
    note: (formData.get('note') as string) || null,
  };

  const clubId = formData.get('id') as string;
  const supabase = await createClient();

  if (clubId) {
    const { error } = await supabase
      .from('clubs')
      .update(clubData)
      .eq('id', clubId)
      .eq('profile_id', profileId);
    if (error) return { error: 'クラブの更新に失敗しました。' };
  } else {
    const { error } = await supabase
      .from('clubs')
      .insert(clubData);
    if (error) return { error: 'クラブの追加に失敗しました。' };
  }

  revalidatePath('/profile');
  return {};
}

export async function deleteClub(clubId: string): Promise<{ error?: string }> {
  if (!clubId) return { error: 'クラブIDが必要です。' };

  const profileId = await getAuthenticatedProfileId();
  if (!profileId) return { error: 'ログインが必要です。' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('clubs')
    .delete()
    .eq('id', clubId)
    .eq('profile_id', profileId);

  if (error) return { error: 'クラブの削除に失敗しました。' };

  revalidatePath('/profile');
  return {};
}
