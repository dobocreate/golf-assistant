-- ラウンド単位の天候・風
ALTER TABLE rounds ADD COLUMN weather text CHECK (weather IN ('sunny', 'cloudy', 'light_rain', 'rain'));
ALTER TABLE rounds ADD COLUMN wind text CHECK (wind IN ('calm', 'light', 'moderate', 'strong'));

-- ショット単位の風向き・風の強さ
ALTER TABLE shots ADD COLUMN wind_direction text CHECK (wind_direction IN ('head', 'tail', 'left', 'right'));
ALTER TABLE shots ADD COLUMN wind_strength text CHECK (wind_strength IN ('calm', 'light', 'moderate', 'strong'));
