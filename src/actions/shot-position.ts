'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
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

export interface UpdateShotPositionInput {
  shotId: string;
  latitude: number;
  longitude: number;
  /** 'manual_edit' (ドラッグ補正) / 'gps' (再 GPS 取得) / 'manual_pin' (手動再配置) */
  gpsSource: GpsSource;
  /** 再 GPS 取得時のみ。manual_edit/manual_pin では null */
  accuracyM?: number | null;
  /** 楽観的ロック用。指定時は revision 不一致で 'conflict' エラーを返す */
  expectedRevision?: number;
}

/** updateShotPosition の戻り値 */
export interface UpdateShotPositionResult {
  error?: string;
  shot?: Shot;
  /** conflict 時の最新 shot（呼び出し側で cache/form を同期するため） */
  latestShot?: Shot;
}

/**
 * 既存ショットの GPS 位置を単体 PATCH で更新する
 *
 * Sprint 5 PR7 (S-5c) — ラウンド中の位置補正フロー（ドラッグ + 再 GPS 取得）。
 *
 * 副作用:
 *   - latitude/longitude/gps_source/edited_at を更新
 *   - 初回編集時 (original_latitude IS NULL) は元の lat/lng を original_* に退避
 *   - position_revision を +1
 *   - hole_areas を再フェッチして auto_lie / auto_lie_confidence /
 *     remaining_to_green_m / auto_lie_calculated_at を再計算
 *
 * 楽観的ロック:
 *   - expectedRevision を渡せば DB の position_revision と一致時のみ更新
 *   - 不一致時は { error: 'conflict' } を返し、UI 側で「他の編集が入りました」を表示
 *
 * gps_source 別の挙動:
 *   - 'manual_edit': accuracyM=null、auto_lie_confidence='medium' （手動補正は GPS 精度ベースでないが、ユーザー意図の精度として中庸）
 *   - 'gps': accuracyM 必須、detectLie の confidence をそのまま使用
 *   - 'manual_pin': accuracyM=null、auto_lie_confidence='low'
 */
export async function updateShotPosition(
  input: UpdateShotPositionInput,
): Promise<UpdateShotPositionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

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

  const supabase = await createClient();

  // ショット + ラウンド所有確認 + 既存 lat/lng/revision 取得
  const { data: shot } = await supabase
    .from('shots')
    .select('*, rounds!inner(user_id, course_id, active_green)')
    .eq('id', input.shotId)
    .eq('rounds.user_id', user.id)
    .single();
  if (!shot) return { error: 'ショットが見つかりません。' };

  const shotRow = shot as Shot & { rounds: { user_id: string; course_id: string; active_green: 'A' | 'B' | null } };

  // 早期チェック: SELECT 時点で revision 不一致なら、UPDATE まで進まずに conflict
  // （ただし最終判定は UPDATE 内の .eq('position_revision', ...) で atomic に行う）
  // latestShot を返すことで呼び出し側が cache/form を最新値に同期できる
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== shotRow.position_revision
  ) {
    return { error: 'conflict', latestShot: shotRow };
  }

  // hole_id 取得（auto_lie 再計算用）
  const { data: hole } = await supabase
    .from('holes')
    .select('id')
    .eq('course_id', shotRow.rounds.course_id)
    .eq('hole_number', shotRow.hole_number)
    .single();

  // hole_areas 取得 → detectLie
  let autoLie: AutoLie = 'unknown';
  let autoLieConfidence: AutoLieConfidence = 'low';
  let remainingToGreenM: number | null = null;
  if (hole) {
    const { data: areasRaw } = await supabase
      .from('hole_areas')
      .select('*')
      .eq('hole_id', hole.id)
      .order('sort_order');
    const areas = (areasRaw ?? []) as HoleArea[];
    const detected = detectLie({
      point: { lat: input.latitude, lng: input.longitude },
      accuracyM: input.accuracyM ?? 0,
      areas,
      activeGreen: shotRow.rounds.active_green,
    });
    autoLie = detected.autoLie;
    remainingToGreenM = detected.remainingToGreenM;
    // gps_source ごとに confidence を上書き（手動操作は GPS 精度ベースでないため）
    if (input.gpsSource === 'manual_edit') {
      autoLieConfidence = 'medium';
    } else if (input.gpsSource === 'manual_pin') {
      autoLieConfidence = 'low';
    } else {
      autoLieConfidence = detected.confidence;
    }
  }

  // 初回編集時 (original_latitude IS NULL) のみ元値を退避
  const originalLatitude = shotRow.original_latitude ?? shotRow.latitude;
  const originalLongitude = shotRow.original_longitude ?? shotRow.longitude;

  const nowIso = new Date().toISOString();
  // Atomic 楽観的ロック: UPDATE の WHERE に position_revision を含めることで、
  // 並行クライアントが同じ expectedRevision で同時更新しても片方しか成功しない
  let updateQuery = supabase
    .from('shots')
    .update({
      latitude: input.latitude,
      longitude: input.longitude,
      gps_accuracy_m: input.accuracyM ?? null,
      captured_at: input.gpsSource === 'gps' ? nowIso : shotRow.captured_at,
      auto_lie: autoLie,
      auto_lie_confidence: autoLieConfidence,
      remaining_to_green_m: remainingToGreenM,
      // hole 定義がないコース（lie 判定スキップ）では unknown 上書きと整合性を取り null に
      auto_lie_calculated_at: hole ? nowIso : null,
      gps_source: input.gpsSource,
      original_latitude: originalLatitude,
      original_longitude: originalLongitude,
      edited_at: input.gpsSource === 'gps' ? shotRow.edited_at : nowIso,
      position_revision: shotRow.position_revision + 1,
    })
    .eq('id', input.shotId);

  // expectedRevision が指定されている場合のみ atomic な revision check を追加
  if (input.expectedRevision !== undefined) {
    updateQuery = updateQuery.eq('position_revision', input.expectedRevision);
  }

  const { data: updated, error: updateErr } = await updateQuery.select('*').maybeSingle();

  if (updateErr) {
    console.error('updateShotPosition failed:', updateErr);
    return { error: '位置情報の更新に失敗しました。' };
  }
  if (!updated) {
    // .maybeSingle() で 0 行返却 = revision 不一致（並行更新が先に走った）
    // 並行更新後の最新値を取得して返す（呼び出し側で cache/form を同期）
    const { data: latest } = await supabase
      .from('shots')
      .select('*')
      .eq('id', input.shotId)
      .maybeSingle();
    return { error: 'conflict', latestShot: latest as Shot | undefined };
  }

  revalidatePath(`/play/${shotRow.round_id}/score`);
  return { shot: updated as Shot };
}

// 注: revertShotPositionToOriginal は中間状態リスク + UI 未配線のため、
// Sprint 5 PR8（事後補正）で正しく実装する。original_gps_accuracy_m カラム追加 or
// 単一 SQL UPDATE への統合のいずれかで原子性を担保する想定。
