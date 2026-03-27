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
