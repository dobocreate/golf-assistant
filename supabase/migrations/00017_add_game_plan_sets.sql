-- ゲームプランセット（コース×ユーザーの複数プラン）
CREATE TABLE game_plan_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL CHECK (length(name) <= 100),
  target_score integer CHECK (target_score >= 50 AND target_score <= 200),
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE game_plan_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own game_plan_sets" ON game_plan_sets
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_game_plan_sets_user_course ON game_plan_sets(user_id, course_id);

-- ゲームプランホール詳細
CREATE TABLE game_plan_holes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_plan_set_id uuid REFERENCES game_plan_sets(id) ON DELETE CASCADE NOT NULL,
  hole_number integer NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  plan_text text CHECK (length(plan_text) <= 2000),
  alert_text text CHECK (length(alert_text) <= 1000),
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high')),
  target_strokes integer CHECK (target_strokes >= 1 AND target_strokes <= 20),
  UNIQUE(game_plan_set_id, hole_number)
);

ALTER TABLE game_plan_holes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own game_plan_holes" ON game_plan_holes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM game_plan_sets WHERE game_plan_sets.id = game_plan_holes.game_plan_set_id AND game_plan_sets.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM game_plan_sets WHERE game_plan_sets.id = game_plan_holes.game_plan_set_id AND game_plan_sets.user_id = auth.uid())
  );

CREATE INDEX idx_game_plan_holes_set_id ON game_plan_holes(game_plan_set_id);
