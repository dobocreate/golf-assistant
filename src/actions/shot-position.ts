'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, db, type PoolClient } from '@/lib/db/neon';
import { isValidUUID } from '@/lib/utils';
import { detectLie, type AutoLie, type AutoLieConfidence } from '@/lib/geolocation/lie-detection';
import type { HoleArea } from '@/lib/geo';
import type { Shot, GpsSource } from '@/features/score/types';

export interface ComputeShotPositionInput {
  roundId: string;
  holeNumber: number;
  latitude: number;
  longitude: number;
  accuracyM: number;
}

export interface ComputeShotPositionResult {
  autoLie: AutoLie;
  autoLieConfidence: AutoLieConfidence;
  remainingToGreenM: number | null;
}

interface RoundOwnerRow {
  id: string;
  course_id: string;
  active_green: 'A' | 'B' | null;
}

async function getOwnedRound(client: PoolClient, roundId: string): Promise<RoundOwnerRow | null> {
  const r = await client.query<RoundOwnerRow>(
    `SELECT id, course_id, active_green
       FROM rounds
      WHERE id = $1 AND user_id = current_user_id()::uuid`,
    [roundId],
  );
  return r.rows[0] ?? null;
}

async function getHoleAreas(client: PoolClient, holeId: string): Promise<HoleArea[]> {
  const r = await client.query<HoleArea>(
    `SELECT * FROM hole_areas WHERE hole_id = $1 ORDER BY sort_order`,
    [holeId],
  );
  return r.rows;
}

/**
 * GPS 座標と holes/hole_areas/active_green から auto_lie / 信頼度 / 残距離を算出する
 */
export async function computeShotPosition(
  input: ComputeShotPositionInput,
): Promise<{ error?: string; result?: ComputeShotPositionResult }> {
  if (!isValidUUID(input.roundId)) return { error: 'ラウンドIDが不正です。' };
  if (!Number.isInteger(input.holeNumber) || input.holeNumber < 1 || input.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    return { error: '緯度が不正です。' };
  }
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    return { error: '経度が不正です。' };
  }
  if (!Number.isFinite(input.accuracyM) || input.accuracyM < 0) {
    return { error: '精度値が不正です。' };
  }

  try {
    return await requireUser(async () => {
      return db.userRead(async (client) => {
        const round = await getOwnedRound(client, input.roundId);
        if (!round) return { error: 'ラウンドが見つかりません。' };

        const holeR = await client.query<{ id: string }>(
          'SELECT id FROM holes WHERE course_id = $1 AND hole_number = $2',
          [round.course_id, input.holeNumber],
        );
        if (holeR.rowCount === 0) {
          return {
            result: { autoLie: 'unknown' as AutoLie, autoLieConfidence: 'low' as AutoLieConfidence, remainingToGreenM: null },
          };
        }

        const areas = await getHoleAreas(client, holeR.rows[0].id);
        const result = detectLie({
          point: { lat: input.latitude, lng: input.longitude },
          accuracyM: input.accuracyM,
          areas,
          activeGreen: round.active_green,
        });

        return {
          result: {
            autoLie: result.autoLie,
            autoLieConfidence: result.confidence,
            remainingToGreenM: result.remainingToGreenM,
          },
        };
      });
    });
  } catch (err) {
    console.error('computeShotPosition failed:', err);
    return { error: '位置情報の計算に失敗しました。' };
  }
}

export interface UpdateShotPositionInput {
  shotId: string;
  latitude: number;
  longitude: number;
  gpsSource: GpsSource;
  accuracyM?: number | null;
  expectedRevision?: number;
}

export interface UpdateShotPositionResult {
  error?: string;
  shot?: Shot;
  latestShot?: Shot;
}

interface ShotWithRoundRow extends Shot {
  round_user_id: string;
  round_course_id: string;
  round_active_green: 'A' | 'B' | null;
}

async function getOwnedShot(client: PoolClient, shotId: string): Promise<ShotWithRoundRow | null> {
  const r = await client.query<ShotWithRoundRow>(
    `SELECT s.*,
            r.user_id AS round_user_id,
            r.course_id AS round_course_id,
            r.active_green AS round_active_green
       FROM shots s
       JOIN rounds r ON r.id = s.round_id
      WHERE s.id = $1 AND r.user_id = current_user_id()::uuid`,
    [shotId],
  );
  return r.rows[0] ?? null;
}

export async function updateShotPosition(
  input: UpdateShotPositionInput,
): Promise<UpdateShotPositionResult> {
  if (!isValidUUID(input.shotId)) return { error: 'ショットIDが不正です。' };
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    return { error: '緯度が不正です。' };
  }
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    return { error: '経度が不正です。' };
  }
  if (input.accuracyM != null && (!Number.isFinite(input.accuracyM) || input.accuracyM < 0)) {
    return { error: '精度値が不正です。' };
  }

  try {
    return await requireUser(async () => {
      return db.transaction(async (client): Promise<UpdateShotPositionResult> => {
        const shotRow = await getOwnedShot(client, input.shotId);
        if (!shotRow) return { error: 'ショットが見つかりません。' };

        if (
          input.expectedRevision !== undefined &&
          input.expectedRevision !== shotRow.position_revision
        ) {
          return { error: 'conflict', latestShot: shotRow };
        }

        // hole_id 取得 → hole_areas → detectLie
        const holeR = await client.query<{ id: string }>(
          'SELECT id FROM holes WHERE course_id = $1 AND hole_number = $2',
          [shotRow.round_course_id, shotRow.hole_number],
        );
        let autoLie: AutoLie = 'unknown';
        let autoLieConfidence: AutoLieConfidence = 'low';
        let remainingToGreenM: number | null = null;
        const hasHole = (holeR.rowCount ?? 0) > 0;
        if (hasHole) {
          const areas = await getHoleAreas(client, holeR.rows[0].id);
          const detected = detectLie({
            point: { lat: input.latitude, lng: input.longitude },
            accuracyM: input.accuracyM ?? 0,
            areas,
            activeGreen: shotRow.round_active_green,
          });
          autoLie = detected.autoLie;
          remainingToGreenM = detected.remainingToGreenM;
          if (input.gpsSource === 'manual_edit') {
            autoLieConfidence = 'medium';
          } else if (input.gpsSource === 'manual_pin') {
            autoLieConfidence = 'low';
          } else {
            autoLieConfidence = detected.confidence;
          }
        }

        const originalLatitude = shotRow.original_latitude ?? shotRow.latitude;
        const originalLongitude = shotRow.original_longitude ?? shotRow.longitude;
        const nowIso = new Date().toISOString();

        // Atomic 楽観的ロック: WHERE 句に position_revision を含める
        let sql = `
          UPDATE shots SET
            latitude = $2,
            longitude = $3,
            gps_accuracy_m = $4,
            captured_at = $5,
            auto_lie = $6,
            auto_lie_confidence = $7,
            remaining_to_green_m = $8,
            auto_lie_calculated_at = $9,
            gps_source = $10,
            original_latitude = $11,
            original_longitude = $12,
            edited_at = $13,
            position_revision = position_revision + 1
          WHERE id = $1`;
        const params: unknown[] = [
          input.shotId,
          input.latitude,
          input.longitude,
          input.accuracyM ?? null,
          input.gpsSource === 'gps' ? nowIso : shotRow.captured_at,
          autoLie,
          autoLieConfidence,
          remainingToGreenM,
          hasHole ? nowIso : null,
          input.gpsSource,
          originalLatitude,
          originalLongitude,
          input.gpsSource === 'gps' ? null : nowIso,
        ];
        if (input.expectedRevision !== undefined) {
          sql += ` AND position_revision = $${params.length + 1}`;
          params.push(input.expectedRevision);
        }
        sql += ' RETURNING *';

        const updR = await client.query<Shot>(sql, params);
        if (updR.rowCount === 0) {
          // 0 行 = revision 不一致。最新を返す
          const latestR = await client.query<Shot>(
            'SELECT * FROM shots WHERE id = $1',
            [input.shotId],
          );
          return { error: 'conflict', latestShot: latestR.rows[0] };
        }

        return { shot: updR.rows[0], _roundId: shotRow.round_id } as UpdateShotPositionResult & {
          _roundId?: string;
        };
      });
    }).then((result) => {
      const r = result as UpdateShotPositionResult & { _roundId?: string };
      if (r.shot && r._roundId) {
        revalidatePath(`/play/${r._roundId}/score`);
        revalidatePath(`/rounds/${r._roundId}`);
      }
      const { _roundId: _omit, ...clean } = r;
      void _omit;
      return clean;
    });
  } catch (err) {
    console.error('updateShotPosition failed:', err);
    return { error: '位置情報の更新に失敗しました。' };
  }
}

/**
 * 編集された位置を元の GPS 値に復元する（atomic）
 */
export async function revertShotPositionToOriginal(
  shotId: string,
  expectedRevision?: number,
): Promise<{ error?: string; shot?: Shot; latestShot?: Shot }> {
  if (!isValidUUID(shotId)) return { error: 'ショットIDが不正です。' };

  try {
    return await requireUser(async () => {
      return db.transaction(async (client): Promise<{ error?: string; shot?: Shot; latestShot?: Shot; _roundId?: string }> => {
        const shotRow = await getOwnedShot(client, shotId);
        if (!shotRow) return { error: 'ショットが見つかりません。' };

        if (expectedRevision !== undefined && expectedRevision !== shotRow.position_revision) {
          return { error: 'conflict', latestShot: shotRow };
        }

        if (shotRow.original_latitude == null || shotRow.original_longitude == null) {
          return { shot: shotRow, _roundId: shotRow.round_id };
        }

        const holeR = await client.query<{ id: string }>(
          'SELECT id FROM holes WHERE course_id = $1 AND hole_number = $2',
          [shotRow.round_course_id, shotRow.hole_number],
        );
        let autoLie: AutoLie = 'unknown';
        let autoLieConfidence: AutoLieConfidence = 'low';
        let remainingToGreenM: number | null = null;
        const hasHole = (holeR.rowCount ?? 0) > 0;
        if (hasHole) {
          const areas = await getHoleAreas(client, holeR.rows[0].id);
          const detected = detectLie({
            point: { lat: shotRow.original_latitude, lng: shotRow.original_longitude },
            accuracyM: 0,
            areas,
            activeGreen: shotRow.round_active_green,
          });
          autoLie = detected.autoLie;
          remainingToGreenM = detected.remainingToGreenM;
          autoLieConfidence = detected.confidence;
        }

        const nowIso = new Date().toISOString();
        let sql = `
          UPDATE shots SET
            latitude = $2,
            longitude = $3,
            auto_lie = $4,
            auto_lie_confidence = $5,
            remaining_to_green_m = $6,
            auto_lie_calculated_at = $7,
            gps_source = 'gps',
            original_latitude = NULL,
            original_longitude = NULL,
            edited_at = NULL,
            position_revision = position_revision + 1
          WHERE id = $1`;
        const params: unknown[] = [
          shotId,
          shotRow.original_latitude,
          shotRow.original_longitude,
          autoLie,
          autoLieConfidence,
          remainingToGreenM,
          hasHole ? nowIso : null,
        ];
        if (expectedRevision !== undefined) {
          sql += ` AND position_revision = $${params.length + 1}`;
          params.push(expectedRevision);
        }
        sql += ' RETURNING *';

        const updR = await client.query<Shot>(sql, params);
        if (updR.rowCount === 0) {
          const latestR = await client.query<Shot>(
            'SELECT * FROM shots WHERE id = $1',
            [shotId],
          );
          return { error: 'conflict', latestShot: latestR.rows[0] };
        }

        return { shot: updR.rows[0], _roundId: shotRow.round_id };
      });
    }).then((result) => {
      if (result.shot && result._roundId) {
        revalidatePath(`/rounds/${result._roundId}`);
        revalidatePath(`/play/${result._roundId}/score`);
      }
      const { _roundId: _omit, ...clean } = result;
      void _omit;
      return clean;
    });
  } catch (err) {
    console.error('revertShotPositionToOriginal failed:', err);
    return { error: '元の GPS 値に戻せませんでした。' };
  }
}
