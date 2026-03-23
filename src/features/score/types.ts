export type TeeShotLR = 'left' | 'center' | 'right';
export type TeeShotFB = 'short' | 'center' | 'long';

export interface Score {
  id: string;
  round_id: string;
  hole_number: number;
  strokes: number;
  putts: number | null;
  fairway_hit: boolean | null;
  green_in_reg: boolean | null;
  tee_shot_lr: TeeShotLR | null;
  tee_shot_fb: TeeShotFB | null;
  ob_count: number;
  bunker_count: number;
  penalty_count: number;
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
