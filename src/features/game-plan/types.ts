export const RISK_LEVEL_LABELS = {
  low: '低',
  medium: '中',
  high: '高',
} as const;

export type RiskLevel = keyof typeof RISK_LEVEL_LABELS;

export const RISK_LEVEL_VALUES = Object.keys(RISK_LEVEL_LABELS) as RiskLevel[];

export interface GamePlan {
  id: string;
  round_id: string;
  hole_number: number;
  plan_text: string | null;
  alert_text: string | null;
  risk_level: RiskLevel | null;
  target_strokes: number | null;
}

export interface GamePlanSet {
  id: string;
  user_id: string;
  course_id: string;
  name: string;
  target_score: number | null;
  created_at: string;
}

export interface GamePlanHole {
  id: string;
  game_plan_set_id: string;
  hole_number: number;
  plan_text: string | null;
  alert_text: string | null;
  risk_level: RiskLevel | null;
  target_strokes: number | null;
}

export interface GamePlanSetWithHoles extends GamePlanSet {
  holes: GamePlanHole[];
}
