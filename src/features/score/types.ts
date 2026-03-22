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
}
