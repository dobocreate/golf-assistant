import type { Shot, ShotResult, DirectionLR, DirectionFB, ShotLanding, ShotFormState } from '@/features/score/types';

export interface ClubOption {
  name: string;
}

export const RESULT_OPTIONS: { value: ShotResult; label: string; color: string; activeColor: string }[] = [
  { value: 'excellent', label: '\u25CE', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-yellow-600 text-white' },
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

export function landingColor(value: ShotLanding): string {
  switch (value) {
    case 'ob': return 'bg-red-600 text-white';
    case 'water': return 'bg-blue-600 text-white';
    case 'bunker': return 'bg-yellow-600 text-white';
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
    windDirection: null,
    windStrength: null,
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
    windDirection: shot.wind_direction,
    windStrength: shot.wind_strength,
  };
}

export function hasFormChanged(form: ShotFormState, shot: Shot): boolean {
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
    form.puttDistanceCategory !== null // puttDistanceCategoryが設定されていれば変更あり
  );
}

/** 全フィールドnullのフォームは保存しない */
export function shouldSaveForm(form: ShotFormState): boolean {
  return !!(form.club || form.result || form.shotType || form.lie || form.remainingDistance != null || form.directionLr || form.note || form.puttDistanceCategory || form.windDirection || form.windStrength);
}
