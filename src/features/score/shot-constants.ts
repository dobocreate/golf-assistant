import type { Shot, ShotResult, DirectionLR, DirectionFB, ShotLanding, ShotElevation, ShotFormState } from '@/features/score/types';

export interface ClubOption {
  name: string;
}

export const RESULT_OPTIONS: { value: ShotResult; label: string; color: string; activeColor: string }[] = [
  { value: 'excellent', label: '\u25CE', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-amber-500 text-white' },
  { value: 'good', label: '\u25CB', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-green-600 text-white' },
  { value: 'fair', label: '\u25B3', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-orange-600 text-white' },
  { value: 'poor', label: '\u2715', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-red-600 text-white' },
];

export const MISS_TYPES = ['フック', 'スライス', 'ダフリ', 'トップ', 'シャンク'];

export const LANDINGS: { value: ShotLanding; label: string }[] = [
  { value: 'ob', label: 'OB' },
  { value: 'water', label: '池' },
  { value: 'bunker', label: 'バンカー' },
];

export const ELEVATIONS: { value: ShotElevation; label: string; shortLabel: string }[] = [
  { value: 'uphill', label: '打ち上げ', shortLabel: '↑打上げ' },
  { value: 'flat', label: '平坦', shortLabel: '→平坦' },
  { value: 'downhill', label: '打ち下ろし', shortLabel: '↓打下し' },
];

export function landingColor(value: ShotLanding): string {
  switch (value) {
    case 'ob': return 'bg-red-600 text-white';
    case 'water': return 'bg-blue-600 text-white';
    case 'bunker': return 'bg-amber-500 text-white';
  }
}

export const DIRECTION_GRID: { lr: DirectionLR; fb: DirectionFB; label: string }[] = [
  { lr: 'left', fb: 'long', label: '↖' },
  { lr: 'center', fb: 'long', label: '↑' },
  { lr: 'right', fb: 'long', label: '↗' },
  { lr: 'left', fb: 'center', label: '←' },
  { lr: 'center', fb: 'center', label: '○' },
  { lr: 'right', fb: 'center', label: '→' },
  { lr: 'left', fb: 'short', label: '↙' },
  { lr: 'center', fb: 'short', label: '↓' },
  { lr: 'right', fb: 'short', label: '↘' },
];

export function emptyShotForm(): ShotFormState {
  return {
    club: null,
    result: null,
    missType: null,
    directionLr: null,
    directionFb: null,
    lie: null,
    slopeFb: null,
    slopeLr: null,
    landing: null,
    shotType: null,
    remainingDistance: null,
    note: null,
    puttDistanceCategory: null,
    puttDistanceMeters: null,
    windDirection: null,
    windStrength: null,
    elevation: null,
    // GPS ショット位置記録（Sprint 5 PR2）
    latitude: null,
    longitude: null,
    gpsAccuracyM: null,
    capturedAt: null,
    autoLie: null,
    remainingToGreenM: null,
    gpsSource: null,
    originalLatitude: null,
    originalLongitude: null,
    editedAt: null,
    autoLieConfidence: null,
    positionRevision: 0,
    autoLieCalculatedAt: null,
  };
}

export function shotToForm(shot: Shot): ShotFormState {
  return {
    club: shot.club,
    result: shot.result,
    missType: shot.miss_type,
    directionLr: shot.direction_lr,
    directionFb: shot.direction_fb,
    lie: shot.lie,
    slopeFb: shot.slope_fb,
    slopeLr: shot.slope_lr,
    landing: shot.landing,
    shotType: shot.shot_type,
    remainingDistance: shot.remaining_distance,
    note: shot.note,
    puttDistanceCategory: null,
    puttDistanceMeters: null,
    windDirection: shot.wind_direction,
    windStrength: shot.wind_strength,
    elevation: shot.elevation,
    // GPS ショット位置記録（Sprint 5 PR2）
    latitude: shot.latitude,
    longitude: shot.longitude,
    gpsAccuracyM: shot.gps_accuracy_m,
    capturedAt: shot.captured_at,
    autoLie: shot.auto_lie,
    remainingToGreenM: shot.remaining_to_green_m,
    gpsSource: shot.gps_source,
    originalLatitude: shot.original_latitude,
    originalLongitude: shot.original_longitude,
    editedAt: shot.edited_at,
    autoLieConfidence: shot.auto_lie_confidence,
    positionRevision: shot.position_revision,
    autoLieCalculatedAt: shot.auto_lie_calculated_at,
  };
}

export function hasFormChanged(form: ShotFormState, shot: Shot): boolean {
  // puttDistance* は scores.first_putt_distance(_m) に別経路で保存されるため、
  // shot レコードとの差分判定には含めない（確定直後に「編集中」が残留する問題の回避）
  return (
    form.club !== shot.club ||
    form.result !== shot.result ||
    form.missType !== shot.miss_type ||
    form.directionLr !== shot.direction_lr ||
    form.directionFb !== shot.direction_fb ||
    form.lie !== shot.lie ||
    form.slopeFb !== shot.slope_fb ||
    form.slopeLr !== shot.slope_lr ||
    form.landing !== shot.landing ||
    form.shotType !== shot.shot_type ||
    form.remainingDistance !== shot.remaining_distance ||
    form.note !== shot.note ||
    form.windDirection !== shot.wind_direction ||
    form.windStrength !== shot.wind_strength ||
    form.elevation !== shot.elevation ||
    // GPS ショット位置記録（Sprint 5 PR2）
    form.latitude !== shot.latitude ||
    form.longitude !== shot.longitude ||
    form.gpsAccuracyM !== shot.gps_accuracy_m ||
    form.capturedAt !== shot.captured_at ||
    form.autoLie !== shot.auto_lie ||
    form.remainingToGreenM !== shot.remaining_to_green_m ||
    form.gpsSource !== shot.gps_source ||
    form.originalLatitude !== shot.original_latitude ||
    form.originalLongitude !== shot.original_longitude ||
    form.editedAt !== shot.edited_at ||
    form.autoLieConfidence !== shot.auto_lie_confidence ||
    form.positionRevision !== shot.position_revision ||
    form.autoLieCalculatedAt !== shot.auto_lie_calculated_at
  );
}

/** 全フィールドnullのフォームは保存しない（位置情報のみあるケースも保存対象） */
export function shouldSaveForm(form: ShotFormState): boolean {
  return !!(
    form.club || form.result || form.shotType || form.lie ||
    form.remainingDistance != null || form.directionLr || form.note ||
    form.puttDistanceCategory || form.puttDistanceMeters != null ||
    form.windDirection || form.windStrength || form.elevation ||
    // GPS 位置だけでも保存対象（「ここから打った」だけ押した状態）
    form.latitude != null || form.longitude != null
  );
}
