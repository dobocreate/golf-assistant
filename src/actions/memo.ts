'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, db } from '@/lib/db/neon';
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

  const trimmedContent = data.content.trim();

  try {
    const memo = await requireUser(async () => {
      return db.transaction(async (client) => {
        // RLS で round の所有権が強制される (insert_own ポリシー: round.user_id 確認)
        const r = await client.query<Memo>(
          `INSERT INTO memos (round_id, hole_number, content, source)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [data.roundId, data.holeNumber, trimmedContent, data.source],
        );
        if (r.rowCount === 0) {
          throw new Error('round_not_owned');
        }
        return r.rows[0];
      });
    });

    revalidatePath(`/play/${data.roundId}/score`);
    return { memo };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'round_not_owned') return { error: 'ラウンドが見つかりません。' };
      if (err.message.startsWith('unauthorized')) return { error: 'ログインが必要です。' };
    }
    console.error('saveMemo error', err);
    return { error: 'メモの保存に失敗しました。' };
  }
}

export async function getMemos(roundId: string, holeNumber?: number): Promise<Memo[]> {
  if (!isValidUUID(roundId)) return [];
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const sql =
          holeNumber !== undefined
            ? `SELECT m.* FROM memos m JOIN rounds r ON r.id = m.round_id
               WHERE m.round_id = $1 AND m.hole_number = $2 AND r.user_id = current_user_id()::uuid
               ORDER BY m.created_at DESC`
            : `SELECT m.* FROM memos m JOIN rounds r ON r.id = m.round_id
               WHERE m.round_id = $1 AND r.user_id = current_user_id()::uuid
               ORDER BY m.created_at DESC`;
        const params = holeNumber !== undefined ? [roundId, holeNumber] : [roundId];
        const r = await client.query<Memo>(sql, params);
        return r.rows;
      });
    });
  } catch {
    return [];
  }
}

export async function deleteMemo(memoId: string): Promise<{ error?: string }> {
  if (!isValidUUID(memoId)) return { error: 'メモIDが不正です。' };

  try {
    const roundId = await requireUser(async () => {
      return db.transaction(async (client) => {
        const r = await client.query<{ round_id: string }>(
          'DELETE FROM memos WHERE id = $1 RETURNING round_id',
          [memoId],
        );
        if (r.rowCount === 0) {
          throw new Error('memo_not_found');
        }
        return r.rows[0].round_id;
      });
    });

    revalidatePath(`/play/${roundId}/score`);
    return {};
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'memo_not_found') return { error: 'メモが見つかりません。' };
      if (err.message.startsWith('unauthorized')) return { error: 'ログインが必要です。' };
    }
    console.error('deleteMemo error', err);
    return { error: 'メモの削除に失敗しました。' };
  }
}
