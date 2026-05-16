import { db, type PoolClient } from '@/lib/db/neon';
import { lieToJapanese, metersToYards } from '@/lib/geolocation/lie-detection';
import type { Shot } from '@/features/score/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LatestShot = Pick<
  Shot,
  'auto_lie' | 'gps_accuracy_m' | 'remaining_to_green_m' | 'auto_lie_confidence' | 'gps_source' | 'captured_at'
>;

/**
 * 指定ラウンド・ホールの「現在地コンテキスト」を AI プロンプト用テキストとして構築。
 *
 * 呼び出し側で `requireUser()` のコンテキストが必要 (db.userRead が
 * `current_user_id()::uuid` を期待する RLS 経路を通るため)。
 *
 * 既存 GPS タグ付き shot を 1 件取得し、auto_lie / remaining_to_green_m から
 * 「現在位置: フェアウェイ、グリーンまで145y」のようなテキストを返す。
 *
 * 該当ショットがない場合（GPS 未取得 / stale）は null を返し、呼び出し側で連結時に
 * セクションを省略する。
 */
export async function buildCurrentPositionContext(
  roundId: string,
  holeNumber: number,
  client?: PoolClient,
): Promise<string | null> {
  if (!UUID_RE.test(roundId)) return null;
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) return null;

  const fetcher = async (c: PoolClient): Promise<LatestShot | null> => {
    const r = await c.query<LatestShot>(
      `SELECT s.auto_lie, s.gps_accuracy_m, s.remaining_to_green_m,
              s.auto_lie_confidence, s.gps_source, s.captured_at
         FROM shots s
         JOIN rounds r ON r.id = s.round_id
        WHERE r.user_id = current_user_id()::uuid
          AND s.round_id = $1
          AND s.hole_number = $2
          AND s.latitude IS NOT NULL
          AND s.longitude IS NOT NULL
        ORDER BY s.shot_number DESC
        LIMIT 1`,
      [roundId, holeNumber],
    );
    return r.rows[0] ?? null;
  };

  const latest = client ? await fetcher(client) : await db.userRead(fetcher);
  if (!latest) return null;

  // staleness ガード: 10 分以上前の GPS 記録は「現在地」として扱わない。
  if (latest.captured_at) {
    const ageMs = Date.now() - new Date(latest.captured_at).getTime();
    if (!Number.isFinite(ageMs) || ageMs > 10 * 60 * 1000) return null;
  }

  const lie = latest.auto_lie;
  const accuracyM = latest.gps_accuracy_m;
  const remainingM = latest.remaining_to_green_m;
  const confidence = latest.auto_lie_confidence;
  const source = latest.gps_source;

  const isLieKnown = lie != null && lie !== 'unknown';
  const lieLabel = isLieKnown ? lieToJapanese(lie) : null;
  let positionPhrase: string;
  if (!isLieKnown) {
    positionPhrase = source === 'manual_pin' ? '推定不能（手動配置、GPS未取得）' : '推定不能';
  } else if (source === 'manual_pin') {
    positionPhrase = `${lieLabel}推定（手動配置、GPS未取得）`;
  } else if (source === 'manual_edit') {
    positionPhrase = `${lieLabel}（手動補正済）`;
  } else if (confidence === 'high' && accuracyM != null) {
    positionPhrase = `${lieLabel}（精度 ${Math.round(accuracyM)}m）`;
  } else if (confidence === 'medium' && accuracyM != null) {
    positionPhrase = `${lieLabel}推定（精度 ${Math.round(accuracyM)}m）`;
  } else if (confidence === 'low' && accuracyM != null) {
    positionPhrase = `${lieLabel}推定（精度 ${Math.round(accuracyM)}m）`;
  } else {
    positionPhrase = lieLabel as string;
  }

  const distancePhrase = (() => {
    if (remainingM == null) return null;
    const yards = metersToYards(remainingM);
    return confidence === 'high' ? `グリーンまで ${yards}y` : `グリーンまで 約${yards}y`;
  })();

  const parts = ['【現在地】', `現在位置: ${positionPhrase}`];
  if (distancePhrase) parts.push(distancePhrase);

  return parts.join('\n');
}
