-- ゲームプラン（ホール別攻略プラン＋弱点アラート）
CREATE TABLE game_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid REFERENCES rounds(id) ON DELETE CASCADE NOT NULL,
  hole_number integer NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  plan_text text CHECK (length(plan_text) <= 2000),
  alert_text text CHECK (length(alert_text) <= 1000),
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high')),
  target_strokes integer CHECK (target_strokes >= 1 AND target_strokes <= 20),
  UNIQUE(round_id, hole_number)
);

-- RLS
ALTER TABLE game_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own game_plans" ON game_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM rounds WHERE rounds.id = game_plans.round_id AND rounds.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM rounds WHERE rounds.id = game_plans.round_id AND rounds.user_id = auth.uid())
  );

-- Index
CREATE INDEX idx_game_plans_round_id ON game_plans(round_id);

-- ラウンド目標スコア
ALTER TABLE rounds ADD COLUMN target_score integer CHECK (target_score >= 50 AND target_score <= 200);
