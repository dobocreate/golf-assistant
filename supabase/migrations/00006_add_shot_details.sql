-- ============================================================
-- ショット記録に方向・ライ・傾斜カラムを追加
-- ============================================================

ALTER TABLE shots ADD COLUMN direction_lr text
  CHECK (direction_lr IN ('left', 'center', 'right'));
ALTER TABLE shots ADD COLUMN direction_fb text
  CHECK (direction_fb IN ('short', 'center', 'long'));
ALTER TABLE shots ADD COLUMN lie text
  CHECK (lie IN ('tee', 'fairway', 'rough', 'bunker', 'woods'));
ALTER TABLE shots ADD COLUMN slope_fb text
  CHECK (slope_fb IN ('toe_up', 'toe_down'));
ALTER TABLE shots ADD COLUMN slope_lr text
  CHECK (slope_lr IN ('left_up', 'left_down'));
