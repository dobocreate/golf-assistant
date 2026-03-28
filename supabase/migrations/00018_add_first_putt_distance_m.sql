-- ファーストパット距離（メートル数値）をscoresテーブルに追加
-- SG: Putting 計算のため、カテゴリ（text）から数値（numeric）に移行
-- 旧 first_putt_distance カラムはデュアルライトで維持

ALTER TABLE scores
  ADD COLUMN first_putt_distance_m numeric(4,1)
  CHECK (first_putt_distance_m >= 0 AND first_putt_distance_m <= 100);
