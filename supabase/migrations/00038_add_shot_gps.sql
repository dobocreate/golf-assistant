-- shots テーブルに GPS ショット位置記録用のカラムを追加
-- Sprint 5 PR2 (S-1) — _bmad-output/planning-artifacts/sprint5-gps-shot-tracking.md Section 3.4
--
-- 設計方針:
-- - latitude/longitude は常に最新の確定値（lie 判定・距離計算はこちらを使う）
-- - 編集が入ったら original_* に元の GPS を退避（初回編集時のみ）
-- - gps_source で取得方法・編集状態を区別（gps / manual_edit / manual_pin）
-- - auto_lie/remaining_to_green_m は lie 判定と残距離の計算結果キャッシュ
-- - auto_lie_confidence は精度円とポリゴン境界の関係から決まる信頼度
-- - position_revision は楽観的ロック用（PR3 以降の単体 PATCH で使用予定）
-- - auto_lie_calculated_at は mapper でポリゴン更新後の stale 判定用

-- 位置情報
ALTER TABLE shots ADD COLUMN latitude double precision
  CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90));
ALTER TABLE shots ADD COLUMN longitude double precision
  CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180));
ALTER TABLE shots ADD COLUMN gps_accuracy_m real
  CHECK (gps_accuracy_m IS NULL OR gps_accuracy_m >= 0);
ALTER TABLE shots ADD COLUMN captured_at timestamptz
  CHECK (captured_at IS NULL OR captured_at <= now() + interval '1 minute');

-- ライ判定・残距離キャッシュ
ALTER TABLE shots ADD COLUMN auto_lie text
  CHECK (auto_lie IS NULL OR auto_lie IN ('fairway','rough','bunker','green','ob','water','tee','unknown'));
ALTER TABLE shots ADD COLUMN remaining_to_green_m integer
  CHECK (remaining_to_green_m IS NULL OR remaining_to_green_m >= 0);

-- 編集追跡
ALTER TABLE shots ADD COLUMN gps_source text
  CHECK (gps_source IN ('gps','manual_edit','manual_pin'))
  DEFAULT 'gps';
ALTER TABLE shots ADD COLUMN original_latitude double precision
  CHECK (original_latitude IS NULL OR (original_latitude BETWEEN -90 AND 90));
ALTER TABLE shots ADD COLUMN original_longitude double precision
  CHECK (original_longitude IS NULL OR (original_longitude BETWEEN -180 AND 180));
ALTER TABLE shots ADD COLUMN edited_at timestamptz;

-- AI 信頼度・再計算追跡
ALTER TABLE shots ADD COLUMN auto_lie_confidence text
  CHECK (auto_lie_confidence IS NULL OR auto_lie_confidence IN ('high','medium','low'));
ALTER TABLE shots ADD COLUMN position_revision integer NOT NULL DEFAULT 0;
ALTER TABLE shots ADD COLUMN auto_lie_calculated_at timestamptz;

-- 位置情報を持つ shot を効率的に引くためのパーシャルインデックス
CREATE INDEX shots_round_geo_idx ON shots(round_id) WHERE latitude IS NOT NULL;
