'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { Knowledge } from '@/features/knowledge/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getKnowledgeList(category?: string | null): Promise<Knowledge[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const supabase = await createClient();
  let query = supabase
    .from('knowledge')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  const { data } = await query;
  return (data as Knowledge[]) ?? [];
}

export async function getKnowledge(id: string): Promise<Knowledge | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  if (!UUID_RE.test(id)) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('knowledge')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  return (data as Knowledge) ?? null;
}

export async function createKnowledge(formData: FormData): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  const title = (formData.get('title') as string)?.trim();
  const content = (formData.get('content') as string)?.trim();
  const category = (formData.get('category') as string)?.trim() || null;
  const tagsRaw = (formData.get('tags') as string)?.trim() || '';
  const sourceUrl = (formData.get('source_url') as string)?.trim() || null;

  if (!title) return { error: 'タイトルは必須です。' };
  if (!content) return { error: '内容は必須です。' };
  if (title.length > 200) return { error: 'タイトルは200文字以内で入力してください。' };
  if (content.length > 10000) return { error: '内容は10000文字以内で入力してください。' };
  if (sourceUrl && sourceUrl.length > 2000) return { error: 'URLは2000文字以内で入力してください。' };

  const tags = tagsRaw
    ? tagsRaw.split(/[,、]/).map(t => t.trim()).filter(Boolean)
    : [];

  const supabase = await createClient();
  const { error } = await supabase.from('knowledge').insert({
    user_id: user.id,
    title,
    content,
    category,
    tags,
    source_url: sourceUrl,
  });

  if (error) return { error: 'ナレッジの保存に失敗しました。' };

  revalidatePath('/knowledge');
  redirect('/knowledge');
}

export async function updateKnowledge(formData: FormData): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  const id = formData.get('id') as string;
  if (!id || !UUID_RE.test(id)) return { error: 'IDが不正です。' };

  const title = (formData.get('title') as string)?.trim();
  const content = (formData.get('content') as string)?.trim();
  const category = (formData.get('category') as string)?.trim() || null;
  const tagsRaw = (formData.get('tags') as string)?.trim() || '';
  const sourceUrl = (formData.get('source_url') as string)?.trim() || null;

  if (!title) return { error: 'タイトルは必須です。' };
  if (!content) return { error: '内容は必須です。' };
  if (title.length > 200) return { error: 'タイトルは200文字以内で入力してください。' };
  if (content.length > 10000) return { error: '内容は10000文字以内で入力してください。' };
  if (sourceUrl && sourceUrl.length > 2000) return { error: 'URLは2000文字以内で入力してください。' };

  const tags = tagsRaw
    ? tagsRaw.split(/[,、]/).map(t => t.trim()).filter(Boolean)
    : [];

  const supabase = await createClient();
  const { error } = await supabase
    .from('knowledge')
    .update({
      title,
      content,
      category,
      tags,
      source_url: sourceUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { error: 'ナレッジの更新に失敗しました。' };

  revalidatePath('/knowledge');
  revalidatePath(`/knowledge/${id}`);
  redirect(`/knowledge/${id}`);
}

export async function deleteKnowledge(id: string): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!UUID_RE.test(id)) return { error: 'IDが不正です。' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('knowledge')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { error: 'ナレッジの削除に失敗しました。' };

  revalidatePath('/knowledge');
  redirect('/knowledge');
}
