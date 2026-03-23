-- ファーストパット距離（カテゴリ）をscoresテーブルに追加
ALTER TABLE scores ADD COLUMN first_putt_distance text CHECK (first_putt_distance IN ('short', 'mid', 'long', 'very_long'));
