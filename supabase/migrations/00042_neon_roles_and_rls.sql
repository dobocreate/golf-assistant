-- ============================================================================
-- 00042_neon_roles_and_rls.sql
-- Phase 2 適用 (Section 4.1 + 4.3)
--
-- 目的:
--   1. assistant_app / assistant_app_readonly / mapper_admin の 3 ロール作成
--   2. current_user_id() ヘルパー関数を作成
--   3. 既存 14 user-scoped テーブルの ALL policy を 4 種類 (SELECT/INSERT/
--      UPDATE/DELETE) × 14 = 56 policy に置換
--
-- 適用順序: 00040 (RPC) → 00041 (clerk_user_id) → 00042 (この file、ロール+RLS)
--
-- 設計: neondb_owner をそのまま canonical owner として使用 (rename 不可のため)。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) ロール作成
-- ----------------------------------------------------------------------------

-- assistant_app (read+write、RLS 強制、BYPASSRLS なし)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assistant_app') THEN
    CREATE ROLE assistant_app WITH LOGIN PASSWORD 'PLACEHOLDER_assistant_password';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO assistant_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO assistant_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO assistant_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO assistant_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
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
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO assistant_app_readonly;

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
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO mapper_admin;

-- ----------------------------------------------------------------------------
-- (2) current_user_id() ヘルパー (Section 4.3)
--     戻り値は profiles.user_id (UUID 文字列)。app 層が SET LOCAL する。
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_user_id() RETURNS text AS $$
  SELECT current_setting('app.current_user_id', true);
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION current_user_id() TO assistant_app, assistant_app_readonly, mapper_admin;

-- 00040 で書き換えた SECURITY DEFINER RPC への EXECUTE GRANT
-- (00042 で assistant_app ロールが作成された後に再付与)
GRANT EXECUTE ON FUNCTION replace_shots_for_hole(UUID, INT, JSONB) TO assistant_app;
GRANT EXECUTE ON FUNCTION replace_companion_scores_for_hole(UUID, INT, JSONB) TO assistant_app;

-- ----------------------------------------------------------------------------
-- (3) RLS ポリシー全 14 user-scoped テーブル
-- 各テーブル 4 ポリシー = 56 ポリシー
-- ----------------------------------------------------------------------------

-- ============================================================================
-- 3.1 user_id 直接保持テーブル (5)
--     profiles, hole_notes, knowledge, game_plan_sets, practice_suggestions, rounds
-- ============================================================================

-- ---- profiles ----
DROP POLICY IF EXISTS "Users can CRUD own profiles" ON profiles;
CREATE POLICY "select_own" ON profiles FOR SELECT
  USING (current_user_id() IS NOT NULL AND current_user_id() = user_id::text);
CREATE POLICY "insert_own" ON profiles FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND current_user_id() = user_id::text);
CREATE POLICY "update_own" ON profiles FOR UPDATE
  USING (current_user_id() = user_id::text)
  WITH CHECK (current_user_id() = user_id::text);
CREATE POLICY "delete_own" ON profiles FOR DELETE
  USING (current_user_id() = user_id::text);

-- ---- hole_notes ----
DROP POLICY IF EXISTS "Users can CRUD own hole_notes" ON hole_notes;
CREATE POLICY "select_own" ON hole_notes FOR SELECT
  USING (current_user_id() IS NOT NULL AND current_user_id() = user_id::text);
CREATE POLICY "insert_own" ON hole_notes FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND current_user_id() = user_id::text);
CREATE POLICY "update_own" ON hole_notes FOR UPDATE
  USING (current_user_id() = user_id::text)
  WITH CHECK (current_user_id() = user_id::text);
CREATE POLICY "delete_own" ON hole_notes FOR DELETE
  USING (current_user_id() = user_id::text);

-- ---- knowledge ----
DROP POLICY IF EXISTS "Users can CRUD own knowledge" ON knowledge;
CREATE POLICY "select_own" ON knowledge FOR SELECT
  USING (current_user_id() IS NOT NULL AND current_user_id() = user_id::text);
CREATE POLICY "insert_own" ON knowledge FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND current_user_id() = user_id::text);
CREATE POLICY "update_own" ON knowledge FOR UPDATE
  USING (current_user_id() = user_id::text)
  WITH CHECK (current_user_id() = user_id::text);
CREATE POLICY "delete_own" ON knowledge FOR DELETE
  USING (current_user_id() = user_id::text);

-- ---- game_plan_sets ----
DROP POLICY IF EXISTS "Users can CRUD own game_plan_sets" ON game_plan_sets;
CREATE POLICY "select_own" ON game_plan_sets FOR SELECT
  USING (current_user_id() IS NOT NULL AND current_user_id() = user_id::text);
CREATE POLICY "insert_own" ON game_plan_sets FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND current_user_id() = user_id::text);
CREATE POLICY "update_own" ON game_plan_sets FOR UPDATE
  USING (current_user_id() = user_id::text)
  WITH CHECK (current_user_id() = user_id::text);
CREATE POLICY "delete_own" ON game_plan_sets FOR DELETE
  USING (current_user_id() = user_id::text);

-- ---- practice_suggestions ----
DROP POLICY IF EXISTS "Users can CRUD own practice_suggestions" ON practice_suggestions;
CREATE POLICY "select_own" ON practice_suggestions FOR SELECT
  USING (current_user_id() IS NOT NULL AND current_user_id() = user_id::text);
CREATE POLICY "insert_own" ON practice_suggestions FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND current_user_id() = user_id::text);
CREATE POLICY "update_own" ON practice_suggestions FOR UPDATE
  USING (current_user_id() = user_id::text)
  WITH CHECK (current_user_id() = user_id::text);
CREATE POLICY "delete_own" ON practice_suggestions FOR DELETE
  USING (current_user_id() = user_id::text);

-- ---- rounds ----
DROP POLICY IF EXISTS "Users can CRUD own rounds" ON rounds;
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

-- ============================================================================
-- 3.2 rounds 経由テーブル (5)
--     scores, shots, companions, game_plans, memos
-- ============================================================================

-- ---- scores ----
DROP POLICY IF EXISTS "Users can CRUD own scores" ON scores;
CREATE POLICY "select_own" ON scores FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = scores.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "insert_own" ON scores FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = scores.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "update_own" ON scores FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = scores.round_id AND rounds.user_id::text = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = scores.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "delete_own" ON scores FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = scores.round_id AND rounds.user_id::text = current_user_id()
  ));

-- ---- shots ----
DROP POLICY IF EXISTS "Users can CRUD own shots" ON shots;
CREATE POLICY "select_own" ON shots FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = shots.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "insert_own" ON shots FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = shots.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "update_own" ON shots FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = shots.round_id AND rounds.user_id::text = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = shots.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "delete_own" ON shots FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = shots.round_id AND rounds.user_id::text = current_user_id()
  ));

-- ---- companions ----
DROP POLICY IF EXISTS "Users can CRUD own companions" ON companions;
CREATE POLICY "select_own" ON companions FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = companions.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "insert_own" ON companions FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = companions.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "update_own" ON companions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = companions.round_id AND rounds.user_id::text = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = companions.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "delete_own" ON companions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = companions.round_id AND rounds.user_id::text = current_user_id()
  ));

-- ---- game_plans ----
DROP POLICY IF EXISTS "Users can CRUD own game_plans" ON game_plans;
CREATE POLICY "select_own" ON game_plans FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = game_plans.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "insert_own" ON game_plans FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = game_plans.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "update_own" ON game_plans FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = game_plans.round_id AND rounds.user_id::text = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = game_plans.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "delete_own" ON game_plans FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = game_plans.round_id AND rounds.user_id::text = current_user_id()
  ));

-- ---- memos ----
DROP POLICY IF EXISTS "Users can CRUD own memos" ON memos;
CREATE POLICY "select_own" ON memos FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = memos.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "insert_own" ON memos FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = memos.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "update_own" ON memos FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = memos.round_id AND rounds.user_id::text = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = memos.round_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "delete_own" ON memos FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = memos.round_id AND rounds.user_id::text = current_user_id()
  ));

-- ============================================================================
-- 3.3 profiles 経由テーブル (1) — clubs
-- ============================================================================

-- ---- clubs ----
DROP POLICY IF EXISTS "Users can CRUD own clubs" ON clubs;
CREATE POLICY "select_own" ON clubs FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = clubs.profile_id AND profiles.user_id::text = current_user_id()
  ));
CREATE POLICY "insert_own" ON clubs FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = clubs.profile_id AND profiles.user_id::text = current_user_id()
  ));
CREATE POLICY "update_own" ON clubs FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = clubs.profile_id AND profiles.user_id::text = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = clubs.profile_id AND profiles.user_id::text = current_user_id()
  ));
CREATE POLICY "delete_own" ON clubs FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = clubs.profile_id AND profiles.user_id::text = current_user_id()
  ));

-- ============================================================================
-- 3.4 companions 経由テーブル (1) — companion_scores
-- ============================================================================

-- ---- companion_scores ----
DROP POLICY IF EXISTS "Users can CRUD own companion_scores" ON companion_scores;
CREATE POLICY "select_own" ON companion_scores FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM companions JOIN rounds ON rounds.id = companions.round_id
    WHERE companions.id = companion_scores.companion_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "insert_own" ON companion_scores FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM companions JOIN rounds ON rounds.id = companions.round_id
    WHERE companions.id = companion_scores.companion_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "update_own" ON companion_scores FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM companions JOIN rounds ON rounds.id = companions.round_id
    WHERE companions.id = companion_scores.companion_id AND rounds.user_id::text = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM companions JOIN rounds ON rounds.id = companions.round_id
    WHERE companions.id = companion_scores.companion_id AND rounds.user_id::text = current_user_id()
  ));
CREATE POLICY "delete_own" ON companion_scores FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM companions JOIN rounds ON rounds.id = companions.round_id
    WHERE companions.id = companion_scores.companion_id AND rounds.user_id::text = current_user_id()
  ));

-- ============================================================================
-- 3.5 game_plan_sets 経由テーブル (1) — game_plan_holes
-- ============================================================================

-- ---- game_plan_holes ----
DROP POLICY IF EXISTS "Users can CRUD own game_plan_holes" ON game_plan_holes;
CREATE POLICY "select_own" ON game_plan_holes FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM game_plan_sets WHERE game_plan_sets.id = game_plan_holes.game_plan_set_id AND game_plan_sets.user_id::text = current_user_id()
  ));
CREATE POLICY "insert_own" ON game_plan_holes FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM game_plan_sets WHERE game_plan_sets.id = game_plan_holes.game_plan_set_id AND game_plan_sets.user_id::text = current_user_id()
  ));
CREATE POLICY "update_own" ON game_plan_holes FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM game_plan_sets WHERE game_plan_sets.id = game_plan_holes.game_plan_set_id AND game_plan_sets.user_id::text = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM game_plan_sets WHERE game_plan_sets.id = game_plan_holes.game_plan_set_id AND game_plan_sets.user_id::text = current_user_id()
  ));
CREATE POLICY "delete_own" ON game_plan_holes FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM game_plan_sets WHERE game_plan_sets.id = game_plan_holes.game_plan_set_id AND game_plan_sets.user_id::text = current_user_id()
  ));

-- ============================================================================
-- 3.6 共有 (read 全許可) テーブルのポリシー調整 — courses, holes
--   auth.role() = 'authenticated' check は Supabase 固有なので削除し、
--   read は public、write は role grant ベース (mapper_admin / migrations) に委ねる
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can insert courses" ON courses;
DROP POLICY IF EXISTS "Authenticated users can update courses" ON courses;
-- "Courses are readable by all" は維持 (USING true)

DROP POLICY IF EXISTS "Authenticated users can insert holes" ON holes;
DROP POLICY IF EXISTS "Authenticated users can update holes" ON holes;
-- "Holes are readable by all" は維持 (USING true)

-- hole_view_configs, hole_areas, hole_elevation_grids, hole_map_points は
-- 全 SELECT 許可ポリシーを維持 (共有データ、write は mapper_admin)
