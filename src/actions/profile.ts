'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, db } from '@/lib/db/neon';
import { SHOT_SHAPES, SCORE_LEVELS, type Profile } from '@/features/profile/types';

export async function getProfile(): Promise<Profile | null> {
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const r = await client.query<Profile>(
          'SELECT * FROM profiles WHERE user_id = current_user_id()::uuid LIMIT 1',
        );
        return r.rows[0] ?? null;
      });
    });
  } catch {
    return null;
  }
}

export async function upsertProfile(formData: FormData): Promise<{ error?: string }> {
  const handicapRaw = formData.get('handicap');
  const handicap = handicapRaw ? parseFloat(handicapRaw as string) : null;

  if (handicap !== null && (isNaN(handicap) || handicap < 0 || handicap > 54)) {
    return { error: 'ハンディキャップは0〜54の範囲で入力してください。' };
  }

  const shotShape = (formData.get('shot_shape') as string) || null;
  const validShotShapes = SHOT_SHAPES.map((s) => s.value) as string[];
  if (shotShape && !validShotShapes.includes(shotShape)) {
    return { error: '持ち球の値が不正です。' };
  }

  const scoreLevel = (formData.get('score_level') as string) || null;
  const validScoreLevels = SCORE_LEVELS.map((s) => s.value) as string[];
  if (scoreLevel && !validScoreLevels.includes(scoreLevel)) {
    return { error: 'スコアレベルの値が不正です。' };
  }

  const profileData = {
    handicap,
    play_style: (formData.get('play_style') as string) || null,
    miss_tendency: (formData.get('miss_tendency') as string) || null,
    fatigue_note: (formData.get('fatigue_note') as string) || null,
    favorite_shot: (formData.get('favorite_shot') as string) || null,
    favorite_distance: (formData.get('favorite_distance') as string) || null,
    situation_notes: (formData.get('situation_notes') as string) || null,
    shot_shape: shotShape,
    score_level: scoreLevel,
  };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await client.query(
          `INSERT INTO profiles (
             user_id, handicap, play_style, miss_tendency, fatigue_note,
             favorite_shot, favorite_distance, situation_notes, shot_shape, score_level
           ) VALUES (
             current_user_id()::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9
           )
           ON CONFLICT (user_id) DO UPDATE SET
             handicap = EXCLUDED.handicap,
             play_style = EXCLUDED.play_style,
             miss_tendency = EXCLUDED.miss_tendency,
             fatigue_note = EXCLUDED.fatigue_note,
             favorite_shot = EXCLUDED.favorite_shot,
             favorite_distance = EXCLUDED.favorite_distance,
             situation_notes = EXCLUDED.situation_notes,
             shot_shape = EXCLUDED.shot_shape,
             score_level = EXCLUDED.score_level,
             updated_at = now()`,
          [
            profileData.handicap,
            profileData.play_style,
            profileData.miss_tendency,
            profileData.fatigue_note,
            profileData.favorite_shot,
            profileData.favorite_distance,
            profileData.situation_notes,
            profileData.shot_shape,
            profileData.score_level,
          ],
        );
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('unauthorized')) {
      return { error: 'ログインが必要です。' };
    }
    console.error('upsertProfile error', err);
    return { error: 'プロファイルの保存に失敗しました。' };
  }

  revalidatePath('/profile');
  return {};
}
