'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { Shot, ShotResult, DirectionLR, DirectionFB, ShotLie, ShotSlopeFB, ShotSlopeLR, ShotLanding, ShotElevation, AdviceHistoryItem } from '@/features/score/types';
import { isValidUUID } from '@/lib/utils';

/** 認証 + ラウンド所有権確認の共通ヘルパー */
async function verifyRoundOwnership(roundId: string, statusFilter?: string) {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' as const, supabase: null, user: null };
  if (!isValidUUID(roundId)) return { error: 'ラウンドIDが不正です。' as const, supabase: null, user: null };

  const supabase = await createClient();
  let query = supabase.from('rounds').select('id').eq('id', roundId).eq('user_id', user.id);
  if (statusFilter) query = query.eq('status', statusFilter);
  const { data: round } = await query.single();
  if (!round) return { error: 'ラウンドが見つかりません。' as const, supabase: null, user: null };

  return { error: null, supabase, user };
}

const VALID_RESULTS: ShotResult[] = ['excellent', 'good', 'fair', 'poor'];
const VALID_MISS_TYPES = ['フック', 'スライス', 'ダフリ', 'トップ', 'シャンク'];
const VALID_DIRECTION_LR: DirectionLR[] = ['left', 'center', 'right'];
const VALID_DIRECTION_FB: DirectionFB[] = ['short', 'center', 'long'];
import { VALID_LIES, VALID_SLOPE_FB, VALID_SLOPE_LR, VALID_SHOT_TYPES, VALID_ELEVATIONS, SHOT_NOTE_MAX_LENGTH } from '@/lib/golf-constants';
import type { ShotType } from '@/features/score/types';
const VALID_LANDINGS: ShotLanding[] = ['ob', 'water', 'bunker'];

function validateShotFields(data: {
  club?: string | null;
  result: ShotResult | null;
  missType: string | null;
  directionLr: string | null;
  directionFb: string | null;
  lie: string | null;
  slopeFb: string | null;
  slopeLr: string | null;
  landing: string | null;
  shotType?: string | null;
  remainingDistance?: number | null;
  elevation?: string | null;
}): string | null {
  if (data.club !== undefined && data.club !== null && (typeof data.club !== 'string' || data.club.length > 20)) {
    return 'クラブ名が不正です。';
  }
  if (data.result !== null && !VALID_RESULTS.includes(data.result)) {
    return 'ショット結果が不正です。';
  }
  if (data.missType !== null && !VALID_MISS_TYPES.includes(data.missType)) {
    return 'ミスタイプが不正です。';
  }
  if (data.directionLr !== null && !VALID_DIRECTION_LR.includes(data.directionLr as DirectionLR)) {
    return '左右方向が不正です。';
  }
  if (data.directionFb !== null && !VALID_DIRECTION_FB.includes(data.directionFb as DirectionFB)) {
    return '前後方向が不正です。';
  }
  if (data.lie !== null && !VALID_LIES.includes(data.lie as ShotLie)) {
    return 'ライが不正です。';
  }
  if (data.slopeFb !== null && !VALID_SLOPE_FB.includes(data.slopeFb as ShotSlopeFB)) {
    return '前後傾斜が不正です。';
  }
  if (data.slopeLr !== null && !VALID_SLOPE_LR.includes(data.slopeLr as ShotSlopeLR)) {
    return '左右傾斜が不正です。';
  }
  if (data.landing !== null && !VALID_LANDINGS.includes(data.landing as ShotLanding)) {
    return '着地状況が不正です。';
  }
  if (data.shotType != null && !VALID_SHOT_TYPES.includes(data.shotType as ShotType)) {
    return 'ショット種別が不正です。';
  }
  if (data.remainingDistance != null && (!Number.isInteger(data.remainingDistance) || data.remainingDistance < 0 || data.remainingDistance > 700)) {
    return '残り距離が不正です。';
  }
  if (data.elevation != null && !VALID_ELEVATIONS.includes(data.elevation as ShotElevation)) {
    return '高低差が不正です。';
  }
  return null;
}

export async function recordShot(data: {
  roundId: string;
  holeNumber: number;
  shotNumber: number;
  club: string | null;
  result: ShotResult | null;
  missType: string | null;
  directionLr: string | null;
  directionFb: string | null;
  lie: string | null;
  slopeFb: string | null;
  slopeLr: string | null;
  landing: string | null;
  shotType: string | null;
  remainingDistance: number | null;
  note?: string | null;
  elevation?: string | null;
  // GPS ショット位置記録（Sprint 5 PR2）
  latitude?: number | null;
  longitude?: number | null;
  gpsAccuracyM?: number | null;
  capturedAt?: string | null;
  autoLie?: string | null;
  remainingToGreenM?: number | null;
  gpsSource?: string | null;
  autoLieConfidence?: string | null;
  autoLieCalculatedAt?: string | null;
}): Promise<{ error?: string; shot?: Shot }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }
  if (!Number.isInteger(data.shotNumber) || data.shotNumber < 1 || data.shotNumber > 20) {
    return { error: 'ショット番号が不正です。' };
  }

  const validationError = validateShotFields(data);
  if (validationError) return { error: validationError };

  const supabase = await createClient();

  // ラウンドの所有確認
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', data.roundId)
    .eq('user_id', user.id)
    .eq('status', 'in_progress')
    .single();

  if (!round) return { error: 'ラウンドが見つかりません。' };

  const note = data.note?.trim() || null;
  if (note !== null && note.length > SHOT_NOTE_MAX_LENGTH) return { error: `メモは${SHOT_NOTE_MAX_LENGTH}文字以内で入力してください。` };

  const { data: shot, error } = await supabase
    .from('shots')
    .insert({
      round_id: data.roundId,
      hole_number: data.holeNumber,
      shot_number: data.shotNumber,
      club: data.club,
      result: data.result,
      miss_type: data.missType,
      direction_lr: data.directionLr,
      direction_fb: data.directionFb,
      lie: data.lie,
      slope_fb: data.slopeFb,
      slope_lr: data.slopeLr,
      landing: data.landing,
      shot_type: data.shotType,
      remaining_distance: data.remainingDistance,
      note,
      elevation: data.elevation ?? null,
      // GPS ショット位置記録（Sprint 5 PR2）
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      gps_accuracy_m: data.gpsAccuracyM ?? null,
      captured_at: data.capturedAt ?? null,
      auto_lie: data.autoLie ?? null,
      remaining_to_green_m: data.remainingToGreenM ?? null,
      gps_source: data.gpsSource ?? 'gps',
      auto_lie_confidence: data.autoLieConfidence ?? null,
      auto_lie_calculated_at: data.autoLieCalculatedAt ?? null,
    })
    .select('*')
    .single();

  if (error) return { error: 'ショットの保存に失敗しました。' };

  revalidatePath(`/play/${data.roundId}/score`);
  return { shot: shot as Shot };
}

export async function updateShot(data: {
  shotId: string;
  roundId: string;
  club: string | null;
  result: ShotResult | null;
  missType: string | null;
  directionLr: string | null;
  directionFb: string | null;
  lie: string | null;
  slopeFb: string | null;
  slopeLr: string | null;
  landing: string | null;
  shotType: string | null;
  remainingDistance: number | null;
  note?: string | null;
  elevation?: string | null;
  // GPS ショット位置記録（Sprint 5 PR2）— undefined は「変更なし」、null は「明示的にクリア」
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
  autoLieCalculatedAt?: string | null;
}): Promise<{ error?: string; shot?: Shot }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  if (!isValidUUID(data.shotId)) return { error: 'ショットIDが不正です。' };
  if (!isValidUUID(data.roundId)) return { error: 'ラウンドIDが不正です。' };

  const validationError = validateShotFields(data);
  if (validationError) return { error: validationError };

  const supabase = await createClient();

  // ラウンドの所有確認（in_progress のみ許可）
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', data.roundId)
    .eq('user_id', user.id)
    .eq('status', 'in_progress')
    .single();

  if (!round) return { error: 'ラウンドが見つかりません。' };

  const note = data.note?.trim() || null;
  if (note !== null && note.length > SHOT_NOTE_MAX_LENGTH) return { error: `メモは${SHOT_NOTE_MAX_LENGTH}文字以内で入力してください。` };

  // GPS 関連フィールドは undefined（=送信なし）のキーは update から除外する
  // これにより GPS を意図的にクリアする場合は明示 null を送れる
  const updatePayload: Record<string, unknown> = {
    club: data.club,
    result: data.result,
    miss_type: data.missType,
    direction_lr: data.directionLr,
    direction_fb: data.directionFb,
    lie: data.lie,
    slope_fb: data.slopeFb,
    slope_lr: data.slopeLr,
    landing: data.landing,
    shot_type: data.shotType,
    remaining_distance: data.remainingDistance,
    note,
    elevation: data.elevation ?? null,
  };
  if (data.latitude !== undefined) updatePayload.latitude = data.latitude;
  if (data.longitude !== undefined) updatePayload.longitude = data.longitude;
  if (data.gpsAccuracyM !== undefined) updatePayload.gps_accuracy_m = data.gpsAccuracyM;
  if (data.capturedAt !== undefined) updatePayload.captured_at = data.capturedAt;
  if (data.autoLie !== undefined) updatePayload.auto_lie = data.autoLie;
  if (data.remainingToGreenM !== undefined) updatePayload.remaining_to_green_m = data.remainingToGreenM;
  if (data.gpsSource !== undefined) updatePayload.gps_source = data.gpsSource;
  if (data.originalLatitude !== undefined) updatePayload.original_latitude = data.originalLatitude;
  if (data.originalLongitude !== undefined) updatePayload.original_longitude = data.originalLongitude;
  if (data.editedAt !== undefined) updatePayload.edited_at = data.editedAt;
  if (data.autoLieConfidence !== undefined) updatePayload.auto_lie_confidence = data.autoLieConfidence;
  if (data.autoLieCalculatedAt !== undefined) updatePayload.auto_lie_calculated_at = data.autoLieCalculatedAt;

  const { data: shot, error } = await supabase
    .from('shots')
    .update(updatePayload)
    .eq('id', data.shotId)
    .eq('round_id', data.roundId)
    .select('*')
    .single();

  if (error) return { error: 'ショットの更新に失敗しました。' };

  revalidatePath(`/play/${data.roundId}/score`);
  return { shot: shot as Shot };
}

export async function getShot(roundId: string, holeNumber: number, shotNumber: number): Promise<Shot | null> {
  const { error, supabase } = await verifyRoundOwnership(roundId);
  if (error || !supabase) return null;
  const { data, error: queryError } = await supabase
    .from('shots')
    .select('*')
    .eq('round_id', roundId)
    .eq('hole_number', holeNumber)
    .eq('shot_number', shotNumber)
    .single();
  if (queryError) {
    console.error('Error fetching shot:', queryError);
    return null;
  }
  return (data as Shot) ?? null;
}

export async function getShots(roundId: string, holeNumber: number): Promise<Shot[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];
  if (!isValidUUID(roundId)) return [];

  const supabase = await createClient();

  // ラウンドの所有確認
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .single();
  if (!round) return [];

  const { data } = await supabase
    .from('shots')
    .select('*')
    .eq('round_id', roundId)
    .eq('hole_number', holeNumber)
    .order('shot_number');

  return (data as Shot[]) ?? [];
}

/** ラウンド全体のショットを一括取得（クライアントサイドキャッシュ用） */
/**
 * 指定コースの全ホールについて、認証ユーザーの GPS タグ付きショットを
 * hole_number ごとにグループ化して取得する。
 *
 * Sprint 5 PR4 (S-3b) — コース詳細ページで全 18 ホール分のショットマーカーを
 * 一度に取得するための効率化版。
 *
 * TODO(PR5+): ユーザーが同一コースで多数（数十〜数百）ラウンドを蓄積した場合、
 * IN 句が膨らむため `.order('played_at', desc).limit(N)` で直近 N ラウンドに
 * 絞るオプションを検討。
 */
export async function getShotsWithGpsByHoleForCourse(
  courseId: string,
): Promise<Map<number, Shot[]>> {
  const empty = new Map<number, Shot[]>();
  const user = await getAuthenticatedUser();
  if (!user) return empty;
  if (!isValidUUID(courseId)) return empty;

  const supabase = await createClient();

  const { data: rounds } = await supabase
    .from('rounds')
    .select('id')
    .eq('user_id', user.id)
    .eq('course_id', courseId);

  const roundIds = (rounds ?? []).map((r) => r.id as string);
  if (roundIds.length === 0) return empty;

  const { data } = await supabase
    .from('shots')
    .select('*')
    .in('round_id', roundIds)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('round_id')
    .order('shot_number');

  const grouped = new Map<number, Shot[]>();
  for (const s of (data ?? []) as Shot[]) {
    const arr = grouped.get(s.hole_number) ?? [];
    arr.push(s);
    grouped.set(s.hole_number, arr);
  }
  return grouped;
}

export async function getShotsForRound(roundId: string): Promise<Shot[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];
  if (!isValidUUID(roundId)) return [];

  const supabase = await createClient();

  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .single();
  if (!round) return [];

  const { data } = await supabase
    .from('shots')
    .select('*')
    .eq('round_id', roundId)
    .order('hole_number')
    .order('shot_number');

  return (data as Shot[]) ?? [];
}

export async function updateShotAdvice(data: {
  roundId: string;
  holeNumber: number;
  shotNumber: number;
  adviceText: string;
}): Promise<{ error?: string }> {
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) return { error: 'ホール番号が不正です。' };
  if (!Number.isInteger(data.shotNumber) || data.shotNumber < 1 || data.shotNumber > 20) return { error: 'ショット番号が不正です。' };
  if (!data.adviceText.trim()) return { error: 'アドバイスが空です。' };
  if (data.adviceText.length > 5000) return { error: 'アドバイスが長すぎます。' };

  const { error: authError, supabase } = await verifyRoundOwnership(data.roundId);
  if (authError || !supabase) return { error: authError ?? 'エラーが発生しました。' };

  const { error } = await supabase
    .from('shots')
    .update({ advice_text: data.adviceText })
    .eq('round_id', data.roundId)
    .eq('hole_number', data.holeNumber)
    .eq('shot_number', data.shotNumber);

  if (error) return { error: 'アドバイスの保存に失敗しました。' };
  return {};
}

export async function getAdviceHistory(roundId: string): Promise<AdviceHistoryItem[]> {
  const { error, supabase } = await verifyRoundOwnership(roundId);
  if (error || !supabase) return [];

  const { data } = await supabase
    .from('shots')
    .select('hole_number, shot_number, advice_text, club, lie, remaining_distance, shot_type, slope_fb, slope_lr')
    .eq('round_id', roundId)
    .not('advice_text', 'is', null)
    .order('hole_number', { ascending: false })
    .order('shot_number', { ascending: false })
    .limit(20);

  return (data ?? []) as AdviceHistoryItem[];
}

export async function deleteShot(shotId: string, roundId: string): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!isValidUUID(shotId) || !isValidUUID(roundId)) return { error: 'IDが不正です。' };

  const supabase = await createClient();

  // ラウンドの所有確認
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .single();
  if (!round) return { error: 'ラウンドが見つかりません。' };

  const { error } = await supabase
    .from('shots')
    .delete()
    .eq('id', shotId)
    .eq('round_id', roundId);

  if (error) return { error: 'ショットの削除に失敗しました。' };

  revalidatePath(`/play/${roundId}/score`);
  return {};
}

/** ホール単位のバッチ保存（ホール切替時に一括保存） */
export async function saveShotsForHole(data: {
  roundId: string;
  holeNumber: number;
  shots: Array<{
    id?: string;
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
    // GPS ショット位置記録（Sprint 5 PR2）
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
  skipRevalidate?: boolean;
}): Promise<{ error?: string; shots?: Shot[] }> {
  if (data.shots.length === 0) return { shots: [] };
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }

  const { error: authError, supabase } = await verifyRoundOwnership(data.roundId, 'in_progress');
  if (authError || !supabase) return { error: authError ?? 'エラー' };

  // 全ショットをバリデーション
  for (const shot of data.shots) {
    if (!Number.isInteger(shot.shotNumber) || shot.shotNumber < 1 || shot.shotNumber > 20) {
      return { error: `ショット番号 ${shot.shotNumber} が不正です。` };
    }
    if (shot.note && shot.note.length > SHOT_NOTE_MAX_LENGTH) {
      return { error: `第${shot.shotNumber}打: メモが長すぎます。` };
    }
    const validationError = validateShotFields({
      club: shot.club,
      result: shot.result as ShotResult | null,
      missType: shot.missType,
      directionLr: shot.directionLr,
      directionFb: shot.directionFb,
      lie: shot.lie,
      slopeFb: shot.slopeFb,
      slopeLr: shot.slopeLr,
      landing: shot.landing,
      shotType: shot.shotType,
      remainingDistance: shot.remainingDistance,
      elevation: shot.elevation,
    });
    if (validationError) return { error: `第${shot.shotNumber}打: ${validationError}` };
  }

  // 全ショットを1回のupsertでアトミックに保存（INSERT+UPDATE）
  const upsertRows = data.shots.map(s => ({
    ...(s.id ? { id: s.id } : {}),
    round_id: data.roundId,
    hole_number: data.holeNumber,
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
    wind_direction: s.windDirection ?? null,
    wind_strength: s.windStrength ?? null,
    elevation: s.elevation ?? null,
    // GPS ショット位置記録（Sprint 5 PR2）
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

  const { error: upsertErr } = await supabase
    .from('shots')
    .upsert(upsertRows, { onConflict: 'id' });

  if (upsertErr) return { error: 'ショットの保存に失敗しました。' };

  // 保存後の全ショットを返却（revalidatePathは呼ばない）
  const { data: savedShots } = await supabase
    .from('shots')
    .select('*')
    .eq('round_id', data.roundId)
    .eq('hole_number', data.holeNumber)
    .order('shot_number');

  return { shots: (savedShots as Shot[]) ?? [] };
}

/** ホール単位の全件入れ替え（delete all + insert all）— オフライン同期用 */
export async function replaceShotsForHole(data: {
  roundId: string;
  holeNumber: number;
  shots: Array<{
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
    // GPS ショット位置記録（Sprint 5 PR2）
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
  skipRevalidate?: boolean;
}): Promise<{ error?: string; shots?: Shot[] }> {
  if (!Number.isInteger(data.holeNumber) || data.holeNumber < 1 || data.holeNumber > 18) {
    return { error: 'ホール番号が不正です。' };
  }

  const { error: authError, supabase } = await verifyRoundOwnership(data.roundId, 'in_progress');
  if (authError || !supabase) return { error: authError ?? 'エラー' };

  // 全ショットをバリデーション
  for (const shot of data.shots) {
    if (!shot.clientId || typeof shot.clientId !== 'string') {
      return { error: 'clientIdが不正です。' };
    }
    if (!Number.isInteger(shot.shotNumber) || shot.shotNumber < 1 || shot.shotNumber > 20) {
      return { error: `ショット番号 ${shot.shotNumber} が不正です。` };
    }
    if (shot.note && shot.note.length > SHOT_NOTE_MAX_LENGTH) {
      return { error: `第${shot.shotNumber}打: メモが長すぎます。` };
    }
    const validationError = validateShotFields({
      club: shot.club,
      result: shot.result as ShotResult | null,
      missType: shot.missType,
      directionLr: shot.directionLr,
      directionFb: shot.directionFb,
      lie: shot.lie,
      slopeFb: shot.slopeFb,
      slopeLr: shot.slopeLr,
      landing: shot.landing,
      shotType: shot.shotType,
      remainingDistance: shot.remainingDistance,
      elevation: shot.elevation,
    });
    if (validationError) return { error: `第${shot.shotNumber}打: ${validationError}` };
  }

  // RPC でアトミックに delete + insert（トランザクション保証）
  const shotsJson = data.shots.map(s => ({
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
    wind_direction: s.windDirection ?? null,
    wind_strength: s.windStrength ?? null,
    elevation: s.elevation ?? null,
    // GPS ショット位置記録（Sprint 5 PR2）
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

  const { data: insertedShots, error: rpcErr } = await supabase
    .rpc('replace_shots_for_hole', {
      p_round_id: data.roundId,
      p_hole_number: data.holeNumber,
      p_shots: shotsJson,
    });

  if (rpcErr) {
    console.error('replace_shots_for_hole RPC failed:', rpcErr);
    if (rpcErr.code === 'P0001' && rpcErr.message?.startsWith('forbidden')) {
      return { error: '権限がないか、対象ラウンドを編集できません。' };
    }
    return { error: 'ショットの保存に失敗しました。' };
  }

  if (!data.skipRevalidate) {
    revalidatePath(`/play/${data.roundId}/score`);
  }

  return { shots: (insertedShots as Shot[]) ?? [] };
}
