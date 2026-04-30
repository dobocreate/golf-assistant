-- rounds に使用グリーン選択カラムを追加
-- null = 1グリーンコース or 未設定
-- 'A' = Aグリーン使用
-- 'B' = Bグリーン使用
ALTER TABLE rounds
  ADD COLUMN active_green text CHECK (active_green IN ('A', 'B'));

COMMENT ON COLUMN rounds.active_green IS '使用グリーン (A=Aグリーン, B=Bグリーン, null=1グリーンまたは未設定)';
