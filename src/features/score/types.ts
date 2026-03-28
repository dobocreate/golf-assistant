import type { WindDirection, WindStrength } from '@/features/round/types';

export interface HoleInfo {
  hole_number: number;
  par: number;
  distance: number | null;
}

export type TeeShotLR = 'left' | 'center' | 'right';
export type TeeShotFB = 'short' | 'center' | 'long';
export type FirstPuttDistance = 'short' | 'mid' | 'long' | 'very_long';

export const FIRST_PUTT_DISTANCE_LABELS: Record<FirstPuttDistance, string> = {
  short: '〜2m',
  mid: '2〜5m',
  long: '5〜10m',
  very_long: '10m〜',
};

/** 数値（メートル）からカテゴリに変換
 * short: < 2m, mid: 2m〜5m未満, long: 5m〜10m未満, very_long: 10m以上 */
export function distanceToCategory(meters: number): FirstPuttDistance {
  if (meters >= 10) return 'very_long';
  if (meters >= 5) return 'long';
  if (meters >= 2) return 'mid';
  return 'short';
}

/** カテゴリから中央値（メートル）に変換（旧データのフォールバック用） */
export const FIRST_PUTT_DISTANCE_MIDPOINTS: Record<FirstPuttDistance, number> = {
  short: 1.0,
  mid: 3.5,
  long: 7.5,
  very_long: 12.0,
};

export interface Score {
  id: string;
  round_id: string;
  hole_number: number;
  strokes: number;
  putts: number | null;
  first_putt_distance: FirstPuttDistance | null;
  first_putt_distance_m: number | null;
  fairway_hit: boolean | null;
  green_in_reg: boolean | null;
  tee_shot_lr: TeeShotLR | null;
  tee_shot_fb: TeeShotFB | null;
  ob_count: number;
  bunker_count: number;
  penalty_count: number;
  wind_direction: WindDirection | null;
  wind_strength: WindStrength | null;
}

export type ShotResult = 'excellent' | 'good' | 'fair' | 'poor';
export type DirectionLR = 'left' | 'center' | 'right';
export type DirectionFB = 'short' | 'center' | 'long';
export type ShotLie = 'tee' | 'fairway' | 'rough' | 'bunker' | 'woods';
export type ShotSlopeFB = 'toe_up' | 'toe_down';
export type ShotSlopeLR = 'left_up' | 'left_down';

export type ShotLanding = 'ob' | 'water' | 'bunker';
export type ShotType = 'tee_shot' | 'second' | 'approach' | 'putt';

export interface Shot {
  id: string;
  round_id: string;
  hole_number: number;
  shot_number: number;
  club: string | null;
  result: ShotResult | null;
  miss_type: string | null;
  direction_lr: DirectionLR | null;
  direction_fb: DirectionFB | null;
  lie: ShotLie | null;
  slope_fb: ShotSlopeFB | null;
  slope_lr: ShotSlopeLR | null;
  landing: ShotLanding | null;
  shot_type: ShotType | null;
  remaining_distance: number | null;
  advice_text: string | null;
  note: string | null;
  wind_direction: WindDirection | null;
  wind_strength: WindStrength | null;
}

export interface ShotFormState {
  club: string | null;
  result: ShotResult | null;
  missType: string | null;
  directionLr: DirectionLR | null;
  directionFb: DirectionFB | null;
  lie: ShotLie | null;
  slopeFb: ShotSlopeFB | null;
  slopeLr: ShotSlopeLR | null;
  landing: ShotLanding | null;
  shotType: ShotType | null;
  remainingDistance: number | null;
  note: string | null;
  puttDistanceCategory: FirstPuttDistance | null;
  puttDistanceMeters: number | null;
  windDirection: WindDirection | null;
  windStrength: WindStrength | null;
}

export interface Companion {
  id: string;
  round_id: string;
  name: string;
  sort_order: number;
}

export interface CompanionScore {
  id: string;
  companion_id: string;
  hole_number: number;
  strokes: number | null;
  putts: number | null;
}

export interface CompanionWithScores {
  companion: Companion;
  scores: CompanionScore[];
}

export interface AdviceHistoryItem {
  hole_number: number;
  shot_number: number;
  advice_text: string;
  club: string | null;
  lie: ShotLie | null;
  remaining_distance: number | null;
  shot_type: ShotType | null;
  slope_fb: ShotSlopeFB | null;
  slope_lr: ShotSlopeLR | null;
}
