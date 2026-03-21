-- ============================================================
-- Task2: scores テーブルにティーショット・カウント系カラムを追加
-- ============================================================

ALTER TABLE scores ADD COLUMN tee_shot_lr text
  CHECK (tee_shot_lr IN ('left', 'center', 'right'));
ALTER TABLE scores ADD COLUMN tee_shot_fb text
  CHECK (tee_shot_fb IN ('short', 'center', 'long'));
ALTER TABLE scores ADD COLUMN ob_count integer DEFAULT 0
  CHECK (ob_count BETWEEN 0 AND 10);
ALTER TABLE scores ADD COLUMN bunker_count integer DEFAULT 0
  CHECK (bunker_count BETWEEN 0 AND 10);
ALTER TABLE scores ADD COLUMN penalty_count integer DEFAULT 0
  CHECK (penalty_count BETWEEN 0 AND 10);
