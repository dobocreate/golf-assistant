'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, db } from '@/lib/db/neon';
import type { Club } from '@/features/profile/types';

export async function getClubs(): Promise<Club[]> {
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const r = await client.query<Club>(
          `SELECT c.* FROM clubs c
           JOIN profiles p ON p.id = c.profile_id
           WHERE p.user_id = current_user_id()::uuid
           ORDER BY c.distance DESC NULLS LAST`,
        );
        return r.rows;
      });
    });
  } catch {
    return [];
  }
}

export async function upsertClub(formData: FormData): Promise<{ error?: string }> {
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

  const trimmedName = clubName.trim();
  const isWeak = formData.get('is_weak') === 'true';
  const note = (formData.get('note') as string) || null;
  const clubId = formData.get('id') as string;

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        // 自分の profile.id を取得 (RLS でも user_id 一致が強制される)
        const profileResult = await client.query<{ id: string }>(
          'SELECT id FROM profiles WHERE user_id = current_user_id()::uuid LIMIT 1',
        );
        if (profileResult.rowCount === 0) {
          throw new Error('profile_missing');
        }
        const profileId = profileResult.rows[0].id;

        if (clubId) {
          await client.query(
            `UPDATE clubs SET
               name = $1, distance = $2, distance_half = $3, success_rate = $4,
               is_weak = $5, confidence = $6, note = $7
             WHERE id = $8 AND profile_id = $9`,
            [trimmedName, distance, distanceHalf, successRate, isWeak, confidence, note, clubId, profileId],
          );
        } else {
          await client.query(
            `INSERT INTO clubs (profile_id, name, distance, distance_half, success_rate, is_weak, confidence, note)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [profileId, trimmedName, distance, distanceHalf, successRate, isWeak, confidence, note],
          );
        }
      });
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'profile_missing') {
        return { error: 'プロファイルを先に作成してください。' };
      }
      if (err.message.startsWith('unauthorized')) {
        return { error: 'ログインが必要です。' };
      }
    }
    console.error('upsertClub error', err);
    return { error: clubId ? 'クラブの更新に失敗しました。' : 'クラブの追加に失敗しました。' };
  }

  revalidatePath('/profile');
  return {};
}

export async function deleteClub(clubId: string): Promise<{ error?: string }> {
  if (!clubId) return { error: 'クラブIDが必要です。' };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        // RLS により profile.user_id 一致のみ削除可能
        await client.query('DELETE FROM clubs WHERE id = $1', [clubId]);
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('unauthorized')) {
      return { error: 'ログインが必要です。' };
    }
    console.error('deleteClub error', err);
    return { error: 'クラブの削除に失敗しました。' };
  }

  revalidatePath('/profile');
  return {};
}
