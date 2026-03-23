'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { isValidUUID } from '@/lib/utils';

export interface Memo {
  id: string;
  round_id: string;
  hole_number: number;
  content: string;
  source: 'voice' | 'text';
  created_at: string;
}

export async function saveMemo(data: {
  roundId: string;
  holeNumber: number;
  content: string;
  source: 'voice' | 'text';
}): Promise<{ error?: string; memo?: Memo }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }
  if (!data.content || data.content.trim().length === 0) {
    return { error: 'メモの内容を入力してください。' };
  }
  if (data.content.length > 1000) {
    return { error: 'メモは1000文字以内で入力してください。' };
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

  const { data: memo, error } = await supabase
    .from('memos')
    .insert({
      round_id: data.roundId,
      hole_number: data.holeNumber,
      content: data.content.trim(),
      source: data.source,
    })
    .select()
    .single();

  if (error) return { error: 'メモの保存に失敗しました。' };

  revalidatePath(`/play/${data.roundId}/score`);
  return { memo: memo as Memo };
}

export async function getMemos(roundId: string, holeNumber?: number): Promise<Memo[]> {
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

  let query = supabase
    .from('memos')
    .select('*')
    .eq('round_id', roundId);

  if (holeNumber !== undefined) {
    query = query.eq('hole_number', holeNumber);
  }

  const { data } = await query.order('created_at', { ascending: false });

  return (data as Memo[]) ?? [];
}

export async function deleteMemo(memoId: string): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  if (!isValidUUID(memoId)) return { error: 'メモIDが不正です。' };

  const supabase = await createClient();

  // メモの所有確認（RLSに依存）
  const { data: memo } = await supabase
    .from('memos')
    .select('id, round_id')
    .eq('id', memoId)
    .single();

  if (!memo) return { error: 'メモが見つかりません。' };

  const { error } = await supabase
    .from('memos')
    .delete()
    .eq('id', memoId);

  if (error) return { error: 'メモの削除に失敗しました。' };

  revalidatePath(`/play/${memo.round_id}/score`);
  return {};
}
