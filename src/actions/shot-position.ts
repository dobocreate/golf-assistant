'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { isValidUUID } from '@/lib/utils';
import { detectLie, type AutoLie, type AutoLieConfidence } from '@/lib/geolocation/lie-detection';
import type { HoleArea } from '@/lib/geo';

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

/**
 * GPS 座標と holes/hole_areas/active_green から auto_lie / 信頼度 / 残距離を算出する
 *
 * Sprint 5 PR5 (S-5b 改) — ShotPositionRecorder で「📍 位置を記録」直後に呼び出し、
 * 結果を form state に格納してユーザー入力欄を pre-fill + AI コンテキストに利用する。
 *
 * 入力検証:
 *   - 認証必須（ラウンド所有確認）
 *   - lat/lng は範囲チェック
 *   - hole_number は 1..18
 */
export async function computeShotPosition(
  input: ComputeShotPositionInput,
): Promise<{ error?: string; result?: ComputeShotPositionResult }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

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

  const supabase = await createClient();

  // ラウンド所有確認 + active_green + course_id 取得
  const { data: round } = await supabase
    .from('rounds')
    .select('id, course_id, active_green')
    .eq('id', input.roundId)
    .eq('user_id', user.id)
    .single();
  if (!round) return { error: 'ラウンドが見つかりません。' };

  // hole_id を取得
  const { data: hole } = await supabase
    .from('holes')
    .select('id')
    .eq('course_id', round.course_id)
    .eq('hole_number', input.holeNumber)
    .single();
  if (!hole) {
    // ホール定義がないコースでは判定不能として unknown / null を返す（エラーではない）
    return {
      result: { autoLie: 'unknown', autoLieConfidence: 'low', remainingToGreenM: null },
    };
  }

  // hole_areas を取得（lie 判定用）
  const { data: areasRaw } = await supabase
    .from('hole_areas')
    .select('*')
    .eq('hole_id', hole.id)
    .order('sort_order');
  const areas = (areasRaw ?? []) as HoleArea[];

  const result = detectLie({
    point: { lat: input.latitude, lng: input.longitude },
    accuracyM: input.accuracyM,
    areas,
    activeGreen: (round.active_green as 'A' | 'B' | null) ?? null,
  });

  return {
    result: {
      autoLie: result.autoLie,
      autoLieConfidence: result.confidence,
      remainingToGreenM: result.remainingToGreenM,
    },
  };
}
