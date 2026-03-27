export type RiskLevel = 'low' | 'medium' | 'high';

export const RISK_LEVEL_VALUES: RiskLevel[] = ['low', 'medium', 'high'];

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

export interface GamePlan {
  id: string;
  round_id: string;
  hole_number: number;
  plan_text: string | null;
  alert_text: string | null;
  risk_level: RiskLevel | null;
  target_strokes: number | null;
}
