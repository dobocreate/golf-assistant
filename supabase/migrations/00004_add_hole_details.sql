-- ============================================================
-- Task1: holes テーブルに詳細カラムを追加
-- ============================================================

ALTER TABLE holes ADD COLUMN hdcp integer CHECK (hdcp BETWEEN 1 AND 18);
ALTER TABLE holes ADD COLUMN dogleg text CHECK (dogleg IN ('straight', 'left', 'right'));
ALTER TABLE holes ADD COLUMN elevation text CHECK (elevation IN ('flat', 'uphill', 'downhill'));
ALTER TABLE holes ADD COLUMN distance_back integer CHECK (distance_back BETWEEN 0 AND 700);
ALTER TABLE holes ADD COLUMN distance_front integer CHECK (distance_front BETWEEN 0 AND 700);
ALTER TABLE holes ADD COLUMN distance_ladies integer CHECK (distance_ladies BETWEEN 0 AND 700);
ALTER TABLE holes ADD COLUMN hazard text;
ALTER TABLE holes ADD COLUMN ob text;
