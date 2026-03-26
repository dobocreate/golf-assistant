-- ホール単位の風向き・風の強さをscoresテーブルに追加
ALTER TABLE scores ADD COLUMN wind_direction text CHECK (wind_direction IN ('head', 'tail', 'left', 'right'));
ALTER TABLE scores ADD COLUMN wind_strength text CHECK (wind_strength IN ('calm', 'light', 'moderate', 'strong'));
