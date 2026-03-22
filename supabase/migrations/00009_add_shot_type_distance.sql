-- ショット記録にショット種別と残り距離を追加
ALTER TABLE shots ADD COLUMN shot_type text
  CHECK (shot_type IN ('tee_shot', 'second', 'approach', 'putt'));
ALTER TABLE shots ADD COLUMN remaining_distance integer
  CHECK (remaining_distance BETWEEN 0 AND 700);
