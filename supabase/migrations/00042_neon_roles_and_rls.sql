-- ============================================================================
-- 00042_neon_roles_and_rls.sql
-- Phase 2 適用予定 (Phase 1 D-2 で骨組み作成、Section 4.1 + 4.3)
--
-- 目的:
--   1. neondb_owner を migration_owner に rename (Round 6 Major 2 確定方式)
--   2. assistant_app / assistant_app_readonly / mapper_admin の 3 ロール作成
--   3. current_user_id() ヘルパー関数を作成
--   4. 既存 36 ポリシーを 4 種類 (SELECT/INSERT/UPDATE/DELETE) × 14 user-scoped
--      テーブル = 約 56 ポリシーに置換 (詳細は Phase 2 で埋める)
--
-- 適用順序: 00040 (RPC) → 00041 (clerk_user_id) → 00042 (この file、ロール+RLS)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) ロール rename + 作成
-- ----------------------------------------------------------------------------
-- TODO (Phase 2): rename は migration runner ではなく Neon SQL editor / psql で
--                 migration_owner 接続切替前に手動実行する。CI には含めない。
--                 ここでは設計記録としてコメントブロック化。
/*
ALTER ROLE neondb_owner RENAME TO migration_owner;
-- これ以後、全マイグレーションは psql -U migration_owner で実行する
*/

-- assistant_app (read+write、RLS 強制、BYPASSRLS なし)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assistant_app') THEN
    -- TODO (Phase 2): :'assistant_password' は psql -v 経由で外部から渡す
    CREATE ROLE assistant_app WITH LOGIN PASSWORD 'PLACEHOLDER_assistant_password';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO assistant_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO assistant_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO assistant_app;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO assistant_app;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO assistant_app;

-- assistant_app_readonly (Round 4 Major 2: db.read の物理 read-only)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assistant_app_readonly') THEN
    CREATE ROLE assistant_app_readonly WITH LOGIN PASSWORD 'PLACEHOLDER_readonly_password';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO assistant_app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO assistant_app_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO assistant_app_readonly;
-- 重要: INSERT/UPDATE/DELETE は付与しない (Section 4.1)

-- mapper_admin (BYPASSRLS、必要テーブルのみ明示 GRANT)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mapper_admin') THEN
    CREATE ROLE mapper_admin WITH LOGIN PASSWORD 'PLACEHOLDER_mapper_password' BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO mapper_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  hole_view_configs, hole_areas, hole_map_points, hole_elevation_grids, courses, holes
  TO mapper_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mapper_admin;
-- mapper_admin にはテーブル GRANT の default privileges を付与しない (Round 5 Major 2)
ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO mapper_admin;

-- ----------------------------------------------------------------------------
-- (2) current_user_id() ヘルパー (Section 4.3)
--     戻り値は profiles.user_id (UUID 文字列)。app 層が SET LOCAL する。
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_user_id() RETURNS text AS $$
  SELECT current_setting('app.current_user_id', true);
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION current_user_id() TO assistant_app, assistant_app_readonly, mapper_admin;

-- ----------------------------------------------------------------------------
-- (3) RLS ポリシー書き換え
--
-- 対象テーブル (14、user_id 直接 or 間接):
--   profiles, clubs (via profile_id), hole_notes, rounds, scores (via round_id),
--   shots (via round_id), memos, knowledge, companions (via round_id),
--   companion_scores (via companion_id), game_plans (via round_id),
--   game_plan_sets, game_plan_holes (via set_id), practice_suggestions
--
-- 各テーブル 4 ポリシー = 約 56 ポリシー。
-- TODO (Phase 2): rounds は下記の参考実装、残り 13 テーブルは同パターンで生成する。
--                 join が必要なテーブル (scores, shots, companion_scores 等) は
--                 EXISTS (SELECT 1 FROM rounds WHERE ...) で所有権チェックする。
-- ----------------------------------------------------------------------------

-- ---- rounds (参考実装、Section 4.3 抜粋) ----
DROP POLICY IF EXISTS "Users can view own rounds" ON rounds;
DROP POLICY IF EXISTS "Users can insert own rounds" ON rounds;
DROP POLICY IF EXISTS "Users can update own rounds" ON rounds;
DROP POLICY IF EXISTS "Users can delete own rounds" ON rounds;

CREATE POLICY "select_own" ON rounds FOR SELECT
  USING (current_user_id() IS NOT NULL AND current_user_id() = user_id::text);

CREATE POLICY "insert_own" ON rounds FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND current_user_id() = user_id::text);

CREATE POLICY "update_own" ON rounds FOR UPDATE
  USING (current_user_id() = user_id::text)
  WITH CHECK (current_user_id() = user_id::text);

CREATE POLICY "delete_own" ON rounds FOR DELETE
  USING (current_user_id() = user_id::text);

-- ---- 残り 13 テーブル: TODO (Phase 2) ----
-- profiles / clubs / hole_notes / scores / shots / memos / knowledge /
-- companions / companion_scores / game_plans / game_plan_sets /
-- game_plan_holes / practice_suggestions
--
-- 上の rounds パターンに従い、user_id 直接保持テーブルは current_user_id() = user_id::text、
-- join テーブルは EXISTS (SELECT 1 FROM rounds r WHERE r.id = round_id AND r.user_id::text = current_user_id())
-- などで所有権チェックする。

-- 共有テーブル (courses, holes, hole_areas, hole_map_points, hole_elevation_grids,
-- hole_view_configs) は RLS 不要 or 全 SELECT 許可で維持。Phase 2 で確認のみ。
