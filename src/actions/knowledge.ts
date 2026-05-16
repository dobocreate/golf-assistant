'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser, db } from '@/lib/db/neon';
import type { Knowledge } from '@/features/knowledge/types';
import { isValidUUID } from '@/lib/utils';

function parseKnowledgeForm(formData: FormData): {
  data: { title: string; content: string; category: string | null; tags: string[]; source_url: string | null };
  error?: string;
} {
  const title = (formData.get('title') as string)?.trim();
  const content = (formData.get('content') as string)?.trim();
  const category = (formData.get('category') as string)?.trim() || null;
  const tagsRaw = (formData.get('tags') as string)?.trim() || '';
  const sourceUrl = (formData.get('source_url') as string)?.trim() || null;

  if (!title) return { data: null!, error: 'タイトルは必須です。' };
  if (!content) return { data: null!, error: '内容は必須です。' };
  if (title.length > 200) return { data: null!, error: 'タイトルは200文字以内で入力してください。' };
  if (content.length > 10000) return { data: null!, error: '内容は10000文字以内で入力してください。' };
  if (sourceUrl) {
    if (sourceUrl.length > 2000) return { data: null!, error: 'URLは2000文字以内で入力してください。' };
    try {
      new URL(sourceUrl);
    } catch {
      return { data: null!, error: 'URLの形式が不正です。' };
    }
  }

  const tags = tagsRaw ? tagsRaw.split(/[,、]/).map((t) => t.trim()).filter(Boolean) : [];

  return { data: { title, content, category, tags, source_url: sourceUrl } };
}

export async function getKnowledgeList(category?: string | null): Promise<Knowledge[]> {
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const sql = category
          ? `SELECT * FROM knowledge WHERE user_id = current_user_id()::uuid AND category = $1 ORDER BY updated_at DESC`
          : `SELECT * FROM knowledge WHERE user_id = current_user_id()::uuid ORDER BY updated_at DESC`;
        const params = category ? [category] : [];
        const r = await client.query<Knowledge>(sql, params);
        return r.rows;
      });
    });
  } catch {
    return [];
  }
}

export async function getKnowledge(id: string): Promise<Knowledge | null> {
  if (!isValidUUID(id)) return null;
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const r = await client.query<Knowledge>(
          'SELECT * FROM knowledge WHERE id = $1 AND user_id = current_user_id()::uuid',
          [id],
        );
        return r.rows[0] ?? null;
      });
    });
  } catch {
    return null;
  }
}

export async function createKnowledge(formData: FormData): Promise<{ error?: string }> {
  const parsed = parseKnowledgeForm(formData);
  if (parsed.error) return { error: parsed.error };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await client.query(
          `INSERT INTO knowledge (user_id, title, content, category, tags, source_url)
           VALUES (current_user_id()::uuid, $1, $2, $3, $4, $5)`,
          [parsed.data.title, parsed.data.content, parsed.data.category, parsed.data.tags, parsed.data.source_url],
        );
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('unauthorized')) {
      return { error: 'ログインが必要です。' };
    }
    console.error('createKnowledge error', err);
    return { error: 'ナレッジの保存に失敗しました。' };
  }

  revalidatePath('/knowledge');
  redirect('/knowledge');
}

export async function updateKnowledge(formData: FormData): Promise<{ error?: string }> {
  const id = formData.get('id') as string;
  if (!id || !isValidUUID(id)) return { error: 'IDが不正です。' };

  const parsed = parseKnowledgeForm(formData);
  if (parsed.error) return { error: parsed.error };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await client.query(
          `UPDATE knowledge SET title = $1, content = $2, category = $3, tags = $4, source_url = $5, updated_at = now()
           WHERE id = $6 AND user_id = current_user_id()::uuid`,
          [parsed.data.title, parsed.data.content, parsed.data.category, parsed.data.tags, parsed.data.source_url, id],
        );
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('unauthorized')) {
      return { error: 'ログインが必要です。' };
    }
    console.error('updateKnowledge error', err);
    return { error: 'ナレッジの更新に失敗しました。' };
  }

  revalidatePath('/knowledge');
  revalidatePath(`/knowledge/${id}`);
  redirect(`/knowledge/${id}`);
}

export async function deleteKnowledge(id: string): Promise<{ error?: string }> {
  if (!isValidUUID(id)) return { error: 'IDが不正です。' };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await client.query(
          'DELETE FROM knowledge WHERE id = $1 AND user_id = current_user_id()::uuid',
          [id],
        );
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('unauthorized')) {
      return { error: 'ログインが必要です。' };
    }
    console.error('deleteKnowledge error', err);
    return { error: 'ナレッジの削除に失敗しました。' };
  }

  revalidatePath('/knowledge');
  redirect('/knowledge');
}
