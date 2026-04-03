-- profiles拡張: 持ち球・スコアレベル
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shot_shape text
  CHECK (shot_shape IS NULL OR shot_shape IN ('straight', 'draw', 'fade'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS score_level text
  CHECK (score_level IS NULL OR score_level IN ('beginner', 'intermediate', 'advanced', 'expert'));

-- clubs拡張: ハーフショット飛距離・10球成功率
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS distance_half integer
  CHECK (distance_half IS NULL OR (distance_half >= 0 AND distance_half <= 400));
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS success_rate integer
  CHECK (success_rate IS NULL OR (success_rate >= 0 AND success_rate <= 10));
