'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, db, type PoolClient } from '@/lib/db/neon';
import type { Companion, CompanionScore } from '@/features/score/types';
import { isValidUUID } from '@/lib/utils';

async function assertRoundOwned(client: PoolClient, roundId: string): Promise<void> {
  const r = await client.query<{ id: string }>(
    'SELECT id FROM rounds WHERE id = $1 AND user_id = current_user_id()::uuid',
    [roundId],
  );
  if (r.rowCount === 0) {
    throw new Error('round_not_found');
  }
}

function mapError(err: unknown, fallback: string): { error: string } {
  if (err instanceof Error) {
    if (err.message === 'round_not_found') return { error: 'ラウンドが見つかりません。' };
    if (err.message === 'duplicate_companion') return { error: '同じ名前の同伴者が既に登録されています。' };
    if (err.message.startsWith('unauthorized')) return { error: 'ログインが必要です。' };
  }
  console.error(fallback, err);
  return { error: fallback };
}

export async function getCompanions(roundId: string): Promise<Companion[]> {
  if (!isValidUUID(roundId)) return [];
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        await assertRoundOwned(client, roundId);
        const r = await client.query<Companion>(
          `SELECT * FROM companions
            WHERE round_id = $1
            ORDER BY sort_order, name`,
          [roundId],
        );
        return r.rows;
      });
    });
  } catch {
    return [];
  }
}

export async function addCompanion(
  roundId: string,
  name: string,
): Promise<{ error?: string; companion?: Companion }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: '名前を入力してください。' };
  if (trimmed.length > 20) return { error: '名前は20文字以内で入力してください。' };
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };

  let companion: Companion;
  try {
    companion = await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, roundId);

        const countRes = await client.query<{ count: string }>(
          'SELECT COUNT(*)::int AS count FROM companions WHERE round_id = $1',
          [roundId],
        );
        const count = Number(countRes.rows[0]?.count ?? 0);
        if (count >= 3) {
          throw new Error('companion_limit');
        }

        try {
          // sort_order は MAX+1 で決定 (COUNT(*) だと削除後の追加で重複し得る)
          const r = await client.query<Companion>(
            `INSERT INTO companions (round_id, name, sort_order)
             VALUES (
               $1,
               $2,
               COALESCE((SELECT MAX(sort_order) + 1 FROM companions WHERE round_id = $1), 0)
             )
             RETURNING *`,
            [roundId, trimmed],
          );
          return r.rows[0];
        } catch (err: unknown) {
          // unique violation
          if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
            throw new Error('duplicate_companion');
          }
          throw err;
        }
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'companion_limit') {
      return { error: '同伴者は最大3人までです。' };
    }
    return mapError(err, '同伴者の追加に失敗しました。');
  }

  revalidatePath(`/play/${roundId}`);
  return { companion };
}

export async function deleteCompanion(roundId: string, companionId: string): Promise<{ error?: string }> {
  if (!isValidUUID(companionId)) return { error: 'IDが不正です。' };
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, roundId);
        await client.query(
          'DELETE FROM companions WHERE id = $1 AND round_id = $2',
          [companionId, roundId],
        );
      });
    });
  } catch (err) {
    return mapError(err, '同伴者の削除に失敗しました。');
  }

  revalidatePath(`/play/${roundId}`);
  return {};
}

export async function getCompanionScores(
  roundId: string,
): Promise<{ companion: Companion; scores: CompanionScore[] }[]> {
  if (!isValidUUID(roundId)) return [];
  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        await assertRoundOwned(client, roundId);

        const companionsRes = await client.query<Companion>(
          `SELECT * FROM companions
            WHERE round_id = $1
            ORDER BY sort_order, name`,
          [roundId],
        );
        const companions = companionsRes.rows;
        if (companions.length === 0) return [];

        const companionIds = companions.map((c) => c.id);
        const scoresRes = await client.query<CompanionScore>(
          `SELECT * FROM companion_scores
            WHERE companion_id = ANY($1::uuid[])`,
          [companionIds],
        );

        const scoresByCompanion = new Map<string, CompanionScore[]>();
        for (const row of scoresRes.rows) {
          const list = scoresByCompanion.get(row.companion_id) ?? [];
          list.push(row);
          scoresByCompanion.set(row.companion_id, list);
        }

        return companions.map((companion) => ({
          companion,
          scores: scoresByCompanion.get(companion.id) ?? [],
        }));
      });
    });
  } catch {
    return [];
  }
}

function validateCompanionScore(score: { strokes: number | null; putts: number | null }): string | null {
  if (score.strokes !== null && (!Number.isInteger(score.strokes) || score.strokes < 1 || score.strokes > 20)) {
    return '打数が不正です。';
  }
  if (score.putts !== null && (!Number.isInteger(score.putts) || score.putts < 0 || score.putts > 10)) {
    return 'パット数が不正です。';
  }
  if (score.strokes !== null && score.putts !== null && score.putts > score.strokes) {
    return 'パット数が打数を超えています。';
  }
  return null;
}

export async function upsertCompanionScore(data: {
  companionId: string;
  roundId: string;
  holeNumber: number;
  strokes: number | null;
  putts: number | null;
}): Promise<{ error?: string }> {
  if (!isValidUUID(data.companionId)) return { error: 'IDが不正です。' };
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }
  const scoreError = validateCompanionScore(data);
  if (scoreError) return { error: scoreError };

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, data.roundId);
        // companion がこのラウンドに属することも担保
        const own = await client.query<{ id: string }>(
          'SELECT id FROM companions WHERE id = $1 AND round_id = $2',
          [data.companionId, data.roundId],
        );
        if (own.rowCount === 0) throw new Error('companion_not_found');

        await client.query(
          `INSERT INTO companion_scores (companion_id, hole_number, strokes, putts)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (companion_id, hole_number) DO UPDATE SET
             strokes = EXCLUDED.strokes,
             putts = EXCLUDED.putts`,
          [data.companionId, data.holeNumber, data.strokes, data.putts],
        );
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'companion_not_found') {
      return { error: '同伴者が見つかりません。' };
    }
    return mapError(err, 'スコアの保存に失敗しました。');
  }
  return {};
}

/** 同伴者スコアの一括保存（カード画面の保存ボタン用） */
export async function upsertCompanionScoresBatch(data: {
  roundId: string;
  holeNumber: number;
  scores: Array<{ companionId: string; strokes: number | null; putts: number | null }>;
  skipRevalidate?: boolean;
}): Promise<{ error?: string }> {
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }

  // strokes/putts両方nullのエントリを除外
  const validScores = data.scores.filter((s) => s.strokes !== null || s.putts !== null);
  if (validScores.length === 0) return {};

  for (const s of validScores) {
    if (!isValidUUID(s.companionId)) return { error: 'IDが不正です。' };
    const scoreError = validateCompanionScore(s);
    if (scoreError) return { error: scoreError };
  }

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, data.roundId);

        // 入力 companionId 群がこのラウンドに属することを担保
        const ownRes = await client.query<{ id: string }>(
          `SELECT id FROM companions
            WHERE round_id = $1 AND id = ANY($2::uuid[])`,
          [data.roundId, validScores.map((s) => s.companionId)],
        );
        if (ownRes.rowCount !== validScores.length) {
          throw new Error('companion_not_found');
        }

        for (const s of validScores) {
          await client.query(
            `INSERT INTO companion_scores (companion_id, hole_number, strokes, putts)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (companion_id, hole_number) DO UPDATE SET
               strokes = EXCLUDED.strokes,
               putts = EXCLUDED.putts`,
            [s.companionId, data.holeNumber, s.strokes, s.putts],
          );
        }
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'companion_not_found') {
      return { error: '同伴者がこのラウンドに属していません。' };
    }
    return mapError(err, '同伴者スコアの保存に失敗しました。');
  }
  return {};
}

/** ホール単位の同伴者スコア全件入れ替え（delete all + insert all）— オフライン同期用 */
export async function replaceCompanionScoresForHole(data: {
  roundId: string;
  holeNumber: number;
  scores: Array<{ companionId: string; strokes: number | null; putts: number | null }>;
  skipRevalidate?: boolean;
}): Promise<{ error?: string }> {
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }

  for (const s of data.scores) {
    if (!isValidUUID(s.companionId)) return { error: 'IDが不正です。' };
    const scoreError = validateCompanionScore(s);
    if (scoreError) return { error: scoreError };
  }

  try {
    await requireUser(async () => {
      return db.transaction(async (client) => {
        await assertRoundOwned(client, data.roundId);

        // 既存 RPC (00040 で SECURITY INVOKER 化) を呼ぶ
        const scoresJson = data.scores.map((s) => ({
          companion_id: s.companionId,
          strokes: s.strokes,
          putts: s.putts,
        }));
        await client.query(
          'SELECT replace_companion_scores_for_hole($1::uuid, $2::int, $3::jsonb)',
          [data.roundId, data.holeNumber, JSON.stringify(scoresJson)],
        );
      });
    });
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string; message?: string }).code === 'P0001' &&
      (err as { message?: string }).message?.startsWith('forbidden')
    ) {
      return { error: '権限がないか、対象ラウンドを編集できません。' };
    }
    return mapError(err, '同伴者スコアの保存に失敗しました。');
  }

  if (!data.skipRevalidate) {
    revalidatePath(`/play/${data.roundId}/scorecard`);
  }

  return {};
}
