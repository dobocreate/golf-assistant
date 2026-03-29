-- 総括メモ（ラウンド本体の属性）
ALTER TABLE rounds ADD COLUMN review_note text;

-- 練習提案（AI生成物は別テーブル）
CREATE TABLE practice_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid REFERENCES rounds(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id)
);

ALTER TABLE practice_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own practice_suggestions"
  ON practice_suggestions FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_practice_suggestions_round ON practice_suggestions(round_id);
