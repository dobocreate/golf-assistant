import { createClient } from '@/lib/supabase/server';
import { lieToJapanese, metersToYards } from '@/lib/geolocation/lie-detection';
import type { Shot } from '@/features/score/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 指定ラウンド・ホールの「現在地コンテキスト」を AI プロンプト用テキストとして構築
 *
 * Sprint 5 PR5 (S-5f) — 静的 context_snapshot とは独立した動的コンテキスト。
 * GPS タグ付きで最新の shot を 1 件取得し、auto_lie / remaining_to_green_m から
 * 「現在位置: フェアウェイ、グリーンまで145y」のようなテキストを返す。
 *
 * 該当ショットがない場合（GPS 未取得）は null を返し、呼び出し側で連結時に
 * セクションを省略する。
 *
 * 信頼度別表現（設計書 Section 6.3 をベースに「、低信頼」の冗長表現は削除）:
 *   - high: 「現在位置: フェアウェイ（精度 8m）」
 *   - medium: 「現在位置: フェアウェイ推定（精度 15m）」
 *   - low: 「現在位置: フェアウェイ推定（精度 25m）」
 *   - manual_pin: 「現在位置: フェアウェイ推定（手動配置、GPS未取得）」
 *   - manual_edit: 「現在位置: フェアウェイ（手動補正済）」
 *   - lie 不明 (unknown/null): 「現在位置: 推定不能」（精度 m と矛盾しない表現）
 *
 * 距離は high の場合だけ「グリーンまで Xy」、それ以外は「グリーンまで 約Xy」（含意で示す）。
 */
export async function buildCurrentPositionContext(
  roundId: string,
  userId: string,
  holeNumber: number,
): Promise<string | null> {
  if (!UUID_RE.test(roundId)) return null;
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) return null;

  const supabase = await createClient();

  // 所有確認 + 最新の GPS タグ付き shot を 1 件取得（shot_number 降順 = 直近）
  // rounds!inner で user_id 制約を JOIN 内で適用
  // 必要列のみを SELECT して advice_text/note 等の重いカラムを避ける（パフォーマンス対策）
  const { data } = await supabase
    .from('shots')
    .select('auto_lie, gps_accuracy_m, remaining_to_green_m, auto_lie_confidence, gps_source, captured_at, rounds!inner(user_id)')
    .eq('rounds.user_id', userId)
    .eq('round_id', roundId)
    .eq('hole_number', holeNumber)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('shot_number', { ascending: false })
    .limit(1);

  type LatestShot = Pick<
    Shot,
    'auto_lie' | 'gps_accuracy_m' | 'remaining_to_green_m' | 'auto_lie_confidence' | 'gps_source' | 'captured_at'
  >;
  const latest = ((data ?? []) as Array<LatestShot & { rounds?: unknown }>)[0];
  if (!latest) return null;

  // staleness ガード: 10 分以上前の GPS 記録は「現在地」として扱わない。
  // ティーショット位置が approach 時にもそのまま AI に渡るのを防ぐ。
  // 直近で再取得していれば常にこの閾値内に収まる。
  if (latest.captured_at) {
    const ageMs = Date.now() - new Date(latest.captured_at).getTime();
    // NaN（壊れた timestamp）は安全側に倒して stale 扱い
    if (!Number.isFinite(ageMs) || ageMs > 10 * 60 * 1000) return null;
  }

  const lie = latest.auto_lie;
  const accuracyM = latest.gps_accuracy_m;
  const remainingM = latest.remaining_to_green_m;
  const confidence = latest.auto_lie_confidence;
  const source = latest.gps_source;

  // 位置記述
  // lie が unknown / null の場合は「精度XXm」を付けると矛盾するため、それぞれ専用表現
  const isLieKnown = lie != null && lie !== 'unknown';
  const lieLabel = isLieKnown ? lieToJapanese(lie) : null;
  let positionPhrase: string;
  if (!isLieKnown) {
    // ライ未確定 — source 別に簡潔に表現
    positionPhrase =
      source === 'manual_pin'
        ? '推定不能（手動配置、GPS未取得）'
        : '推定不能';
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

  // 距離記述（メートル → ヤード）
  // confidence != high の場合は「約」プレフィックスで含意を示す（「推定」二重表現を回避）
  const distancePhrase = (() => {
    if (remainingM == null) return null;
    const yards = metersToYards(remainingM);
    return confidence === 'high'
      ? `グリーンまで ${yards}y`
      : `グリーンまで 約${yards}y`;
  })();

  const parts = ['【現在地】', `現在位置: ${positionPhrase}`];
  if (distancePhrase) parts.push(distancePhrase);

  return parts.join('\n');
}
