-- holesテーブルにグリーン情報を追加
ALTER TABLE holes ADD COLUMN IF NOT EXISTS green_speed text
  CHECK (green_speed IS NULL OR green_speed IN ('slow', 'normal', 'fast'));
ALTER TABLE holes ADD COLUMN IF NOT EXISTS green_undulation text
  CHECK (green_undulation IS NULL OR green_undulation IN ('flat', 'moderate', 'severe'));
