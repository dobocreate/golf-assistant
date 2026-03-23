-- 同伴者
CREATE TABLE companions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid REFERENCES rounds(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (round_id, name)
);

-- 同伴者スコア
CREATE TABLE companion_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  companion_id uuid REFERENCES companions(id) ON DELETE CASCADE NOT NULL,
  hole_number integer NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  strokes integer CHECK (strokes BETWEEN 1 AND 20),
  putts integer CHECK (putts BETWEEN 0 AND 10),
  UNIQUE (companion_id, hole_number)
);

-- RLS
ALTER TABLE companions ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own companions" ON companions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM rounds WHERE rounds.id = companions.round_id AND rounds.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM rounds WHERE rounds.id = companions.round_id AND rounds.user_id = auth.uid())
  );

CREATE POLICY "Users can CRUD own companion_scores" ON companion_scores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM companions
      JOIN rounds ON rounds.id = companions.round_id
      WHERE companions.id = companion_scores.companion_id AND rounds.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM companions
      JOIN rounds ON rounds.id = companions.round_id
      WHERE companions.id = companion_scores.companion_id AND rounds.user_id = auth.uid()
    )
  );

-- Index
CREATE INDEX idx_companions_round_id ON companions(round_id);
CREATE INDEX idx_companion_scores_companion_id ON companion_scores(companion_id);
