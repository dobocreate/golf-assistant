import { NextResponse } from 'next/server';
import { requireUser, db } from '@/lib/db/neon';
import { isValidUUID } from '@/lib/utils';

interface SyncRequestBody {
  roundId: string;
  holeNumber: number;
  score?: {
    strokes: number;
    putts: number | null;
    fairwayHit: boolean | null;
    greenInReg: boolean | null;
    teeShotLr: string | null;
    teeShotFb: string | null;
    obCount: number;
    bunkerCount: number;
    penaltyCount: number;
    firstPuttDistance: string | null;
    firstPuttDistanceM?: number | null;
    windDirection: string | null;
    windStrength: string | null;
  };
  shots?: Array<{
    id?: string;
    clientId: string;
    shotNumber: number;
    club: string | null;
    result: string | null;
    missType: string | null;
    directionLr: string | null;
    directionFb: string | null;
    lie: string | null;
    slopeFb: string | null;
    slopeLr: string | null;
    landing: string | null;
    shotType: string | null;
    remainingDistance: number | null;
    note: string | null;
    adviceText: string | null;
    windDirection: string | null;
    windStrength: string | null;
    elevation: string | null;
    latitude?: number | null;
    longitude?: number | null;
    gpsAccuracyM?: number | null;
    capturedAt?: string | null;
    autoLie?: string | null;
    remainingToGreenM?: number | null;
    gpsSource?: string | null;
    originalLatitude?: number | null;
    originalLongitude?: number | null;
    editedAt?: string | null;
    autoLieConfidence?: string | null;
    positionRevision?: number | null;
    autoLieCalculatedAt?: string | null;
  }>;
  companions?: Array<{
    companionId: string;
    strokes: number | null;
    putts: number | null;
  }>;
}

interface SyncResult {
  score?: { success: boolean; error?: string };
  shots?: { success: boolean; error?: string };
  companions?: { success: boolean; error?: string };
}

function isForbiddenPgError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  return (
    e.code === 'P0001' &&
    typeof e.message === 'string' &&
    e.message.startsWith('forbidden')
  );
}

export async function POST(request: Request) {
  try {
    let body: SyncRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 });
    }

    const { roundId, holeNumber, score, shots, companions } = body;

    if (!isValidUUID(roundId)) {
      return NextResponse.json({ error: 'ラウンドIDが不正です。' }, { status: 400 });
    }
    if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
      return NextResponse.json({ error: 'ホール番号が不正です。' }, { status: 400 });
    }
    if (!score && !shots && !companions) {
      return NextResponse.json({ error: '保存データがありません。' }, { status: 400 });
    }

    const outcome = await requireUser(async () => {
      // 所有確認
      const owned = await db.userRead(async (client) => {
        const r = await client.query<{ id: string }>(
          `SELECT id FROM rounds
            WHERE id = $1
              AND user_id = current_user_id()::uuid
              AND status = ANY(ARRAY['in_progress', 'completed'])`,
          [roundId],
        );
        return (r.rowCount ?? 0) > 0;
      });
      if (!owned) return { error: 'round_not_found' as const };

      const result: SyncResult = {};

      // Save score
      if (score) {
        try {
          await db.transaction(async (client) => {
            await client.query(
              `INSERT INTO scores (
                  round_id, hole_number, strokes, putts, fairway_hit, green_in_reg,
                  tee_shot_lr, tee_shot_fb, ob_count, bunker_count, penalty_count,
                  first_putt_distance, first_putt_distance_m, wind_direction, wind_strength
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                ON CONFLICT (round_id, hole_number) DO UPDATE SET
                  strokes = EXCLUDED.strokes,
                  putts = EXCLUDED.putts,
                  fairway_hit = EXCLUDED.fairway_hit,
                  green_in_reg = EXCLUDED.green_in_reg,
                  tee_shot_lr = EXCLUDED.tee_shot_lr,
                  tee_shot_fb = EXCLUDED.tee_shot_fb,
                  ob_count = EXCLUDED.ob_count,
                  bunker_count = EXCLUDED.bunker_count,
                  penalty_count = EXCLUDED.penalty_count,
                  first_putt_distance = EXCLUDED.first_putt_distance,
                  first_putt_distance_m = EXCLUDED.first_putt_distance_m,
                  wind_direction = EXCLUDED.wind_direction,
                  wind_strength = EXCLUDED.wind_strength`,
              [
                roundId,
                holeNumber,
                score.strokes,
                score.putts ?? null,
                score.fairwayHit ?? null,
                score.greenInReg ?? null,
                score.teeShotLr ?? null,
                score.teeShotFb ?? null,
                score.obCount ?? 0,
                score.bunkerCount ?? 0,
                score.penaltyCount ?? 0,
                score.firstPuttDistance ?? null,
                score.firstPuttDistanceM ?? null,
                score.windDirection ?? null,
                score.windStrength ?? null,
              ],
            );

            // Recalculate total_score
            const totalR = await client.query<{ total: string | null }>(
              'SELECT COALESCE(SUM(strokes), 0)::text AS total FROM scores WHERE round_id = $1',
              [roundId],
            );
            const total = Number(totalR.rows[0]?.total ?? 0);
            await client.query(
              'UPDATE rounds SET total_score = $2 WHERE id = $1 AND user_id = current_user_id()::uuid',
              [roundId, total > 0 ? total : null],
            );
          });
          result.score = { success: true };
        } catch (err) {
          console.error('sync score failed:', err);
          result.score = { success: false, error: 'スコアの保存に失敗しました。' };
        }
      }

      // Save shots via RPC (atomic delete+insert)
      if (shots) {
        try {
          const shotsJson = shots.map((s) => ({
            client_id: s.clientId,
            shot_number: s.shotNumber,
            club: s.club,
            result: s.result,
            miss_type: s.missType,
            direction_lr: s.directionLr,
            direction_fb: s.directionFb,
            lie: s.lie,
            slope_fb: s.slopeFb,
            slope_lr: s.slopeLr,
            landing: s.landing,
            shot_type: s.shotType,
            remaining_distance: s.remainingDistance,
            note: s.note,
            advice_text: s.adviceText,
            wind_direction: s.windDirection,
            wind_strength: s.windStrength,
            elevation: s.elevation,
            latitude: s.latitude ?? null,
            longitude: s.longitude ?? null,
            gps_accuracy_m: s.gpsAccuracyM ?? null,
            captured_at: s.capturedAt ?? null,
            auto_lie: s.autoLie ?? null,
            remaining_to_green_m: s.remainingToGreenM ?? null,
            gps_source: s.gpsSource ?? 'gps',
            original_latitude: s.originalLatitude ?? null,
            original_longitude: s.originalLongitude ?? null,
            edited_at: s.editedAt ?? null,
            auto_lie_confidence: s.autoLieConfidence ?? null,
            position_revision: s.positionRevision ?? 0,
            auto_lie_calculated_at: s.autoLieCalculatedAt ?? null,
          }));
          await db.transaction(async (client) => {
            await client.query(
              'SELECT replace_shots_for_hole($1::uuid, $2::int, $3::jsonb)',
              [roundId, holeNumber, JSON.stringify(shotsJson)],
            );
          });
          result.shots = { success: true };
        } catch (err) {
          console.error('replace_shots_for_hole failed:', err);
          result.shots = {
            success: false,
            error: isForbiddenPgError(err)
              ? '権限がないか、対象ラウンドを編集できません。'
              : 'ショットの保存に失敗しました。',
          };
        }
      }

      // Save companion scores via RPC
      if (companions) {
        try {
          const scoresJson = companions.map((s) => ({
            companion_id: s.companionId,
            strokes: s.strokes,
            putts: s.putts,
          }));
          await db.transaction(async (client) => {
            await client.query(
              'SELECT replace_companion_scores_for_hole($1::uuid, $2::int, $3::jsonb)',
              [roundId, holeNumber, JSON.stringify(scoresJson)],
            );
          });
          result.companions = { success: true };
        } catch (err) {
          console.error('replace_companion_scores_for_hole failed:', err);
          result.companions = {
            success: false,
            error: isForbiddenPgError(err)
              ? '権限がないか、対象ラウンドを編集できません。'
              : '同伴者スコアの保存に失敗しました。',
          };
        }
      }

      return { result };
    }).catch((err) => {
      if (err instanceof Error && err.message.startsWith('unauthorized')) {
        return { error: 'unauthorized' as const };
      }
      throw err;
    });

    if ('error' in outcome) {
      if (outcome.error === 'unauthorized') {
        return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
      }
      if (outcome.error === 'round_not_found') {
        return NextResponse.json({ error: 'ラウンドが見つかりません。' }, { status: 404 });
      }
    }

    const result = (outcome as { result: SyncResult }).result;
    const anyFailed = Object.values(result).some((r) => !r.success);

    return NextResponse.json({ result }, { status: anyFailed ? 207 : 200 });
  } catch (err) {
    console.error('sync route error:', err);
    return NextResponse.json({ error: '予期しないエラーが発生しました。' }, { status: 500 });
  }
}
