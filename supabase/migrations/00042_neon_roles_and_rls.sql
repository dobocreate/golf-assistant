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
--
-- 適用方法 (psql 変数で password を注入):
--   psql "$NEON_DATABASE_URL_DIRECT" \
--     -v assistant_password="$(cat /tmp/assistant_pw)" \
--     -v readonly_password="$(cat /tmp/readonly_pw)" \
--     -v mapper_password="$(cat /tmp/mapper_pw)" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/migrations/00042_neon_roles_and_rls.sql
--
-- 変数が未指定だと psql は ":'var' is undefined" でエラーになり apply されない
-- (Gemini PR#237 High 指摘対応、ハードコード回避)。
-- 既に role が存在する場合 (IF NOT EXISTS で skip) はパスワード未使用なので
-- 空文字渡しでも安全。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) ロール作成 (psql `:'var'` 変数 + `\gexec` で動的 SQL 生成)
--
-- psql の `:'var'` 展開は dollar-quoted block (`$$ ... $$`) 内では発生しない
-- 既知の制限があるため、`SELECT format(...) \gexec` パターンで動的 SQL を組み立てる。
-- 既にロールが存在する場合は WHERE NOT EXISTS で空集合 → \gexec は何も実行しない。
-- ----------------------------------------------------------------------------

-- assistant_app (read+write、RLS 強制、BYPASSRLS なし)
SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L', 'assistant_app', :'assistant_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assistant_app')
\gexec

GRANT USAGE ON SCHEMA public TO assistant_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO assistant_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO assistant_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO assistant_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO assistant_app;

-- assistant_app_readonly (Round 4 Major 2: db.read の物理 read-only)
SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L', 'assistant_app_readonly', :'readonly_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assistant_app_readonly')
\gexec

GRANT USAGE ON SCHEMA public TO assistant_app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO assistant_app_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO assistant_app_readonly;

-- mapper_admin (BYPASSRLS、必要テーブルのみ明示 GRANT)
SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L BYPASSRLS', 'mapper_admin', :'mapper_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mapper_admin')
\gexec

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
--
-- 再実行時 (idempotent) のため、新ポリシー名も含めて全 DROP してから CREATE
-- ----------------------------------------------------------------------------

-- 14 user-scoped テーブル × 4 ポリシー名 を全削除 (再実行時の重複回避)
DO $$
DECLARE
  tbl text;
  pol text;
BEGIN
  FOR tbl IN VALUES
    ('profiles'), ('hole_notes'), ('knowledge'), ('game_plan_sets'),
    ('practice_suggestions'), ('rounds'), ('scores'), ('shots'),
    ('companions'), ('game_plans'), ('memos'), ('clubs'),
    ('companion_scores'), ('game_plan_holes')
  LOOP
    FOR pol IN VALUES ('select_own'), ('insert_own'), ('update_own'), ('delete_own')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, tbl);
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 3.1 user_id 直接保持テーブル (5)
--     profiles, hole_notes, knowledge, game_plan_sets, practice_suggestions, rounds
-- ============================================================================

-- ---- profiles ----
DROP POLICY IF EXISTS "Users can CRUD own profiles" ON profiles;
CREATE POLICY "select_own" ON profiles FOR SELECT
  USING (current_user_id() IS NOT NULL AND user_id = current_user_id()::uuid);
CREATE POLICY "insert_own" ON profiles FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND user_id = current_user_id()::uuid);
CREATE POLICY "update_own" ON profiles FOR UPDATE
  USING (user_id = current_user_id()::uuid)
  WITH CHECK (user_id = current_user_id()::uuid);
CREATE POLICY "delete_own" ON profiles FOR DELETE
  USING (user_id = current_user_id()::uuid);

-- ---- hole_notes ----
DROP POLICY IF EXISTS "Users can CRUD own hole_notes" ON hole_notes;
CREATE POLICY "select_own" ON hole_notes FOR SELECT
  USING (current_user_id() IS NOT NULL AND user_id = current_user_id()::uuid);
CREATE POLICY "insert_own" ON hole_notes FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND user_id = current_user_id()::uuid);
CREATE POLICY "update_own" ON hole_notes FOR UPDATE
  USING (user_id = current_user_id()::uuid)
  WITH CHECK (user_id = current_user_id()::uuid);
CREATE POLICY "delete_own" ON hole_notes FOR DELETE
  USING (user_id = current_user_id()::uuid);

-- ---- knowledge ----
DROP POLICY IF EXISTS "Users can CRUD own knowledge" ON knowledge;
CREATE POLICY "select_own" ON knowledge FOR SELECT
  USING (current_user_id() IS NOT NULL AND user_id = current_user_id()::uuid);
CREATE POLICY "insert_own" ON knowledge FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND user_id = current_user_id()::uuid);
CREATE POLICY "update_own" ON knowledge FOR UPDATE
  USING (user_id = current_user_id()::uuid)
  WITH CHECK (user_id = current_user_id()::uuid);
CREATE POLICY "delete_own" ON knowledge FOR DELETE
  USING (user_id = current_user_id()::uuid);

-- ---- game_plan_sets ----
DROP POLICY IF EXISTS "Users can CRUD own game_plan_sets" ON game_plan_sets;
CREATE POLICY "select_own" ON game_plan_sets FOR SELECT
  USING (current_user_id() IS NOT NULL AND user_id = current_user_id()::uuid);
CREATE POLICY "insert_own" ON game_plan_sets FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND user_id = current_user_id()::uuid);
CREATE POLICY "update_own" ON game_plan_sets FOR UPDATE
  USING (user_id = current_user_id()::uuid)
  WITH CHECK (user_id = current_user_id()::uuid);
CREATE POLICY "delete_own" ON game_plan_sets FOR DELETE
  USING (user_id = current_user_id()::uuid);

-- ---- practice_suggestions ----
DROP POLICY IF EXISTS "Users can CRUD own practice_suggestions" ON practice_suggestions;
CREATE POLICY "select_own" ON practice_suggestions FOR SELECT
  USING (current_user_id() IS NOT NULL AND user_id = current_user_id()::uuid);
CREATE POLICY "insert_own" ON practice_suggestions FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND user_id = current_user_id()::uuid);
CREATE POLICY "update_own" ON practice_suggestions FOR UPDATE
  USING (user_id = current_user_id()::uuid)
  WITH CHECK (user_id = current_user_id()::uuid);
CREATE POLICY "delete_own" ON practice_suggestions FOR DELETE
  USING (user_id = current_user_id()::uuid);

-- ---- rounds ----
DROP POLICY IF EXISTS "Users can CRUD own rounds" ON rounds;
DROP POLICY IF EXISTS "Users can view own rounds" ON rounds;
DROP POLICY IF EXISTS "Users can insert own rounds" ON rounds;
DROP POLICY IF EXISTS "Users can update own rounds" ON rounds;
DROP POLICY IF EXISTS "Users can delete own rounds" ON rounds;
CREATE POLICY "select_own" ON rounds FOR SELECT
  USING (current_user_id() IS NOT NULL AND user_id = current_user_id()::uuid);
CREATE POLICY "insert_own" ON rounds FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND user_id = current_user_id()::uuid);
CREATE POLICY "update_own" ON rounds FOR UPDATE
  USING (user_id = current_user_id()::uuid)
  WITH CHECK (user_id = current_user_id()::uuid);
CREATE POLICY "delete_own" ON rounds FOR DELETE
  USING (user_id = current_user_id()::uuid);

-- ============================================================================
-- 3.2 rounds 経由テーブル (5)
--     scores, shots, companions, game_plans, memos
-- ============================================================================

-- ---- scores ----
DROP POLICY IF EXISTS "Users can CRUD own scores" ON scores;
CREATE POLICY "select_own" ON scores FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = scores.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "insert_own" ON scores FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = scores.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "update_own" ON scores FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = scores.round_id AND rounds.user_id = current_user_id()::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = scores.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "delete_own" ON scores FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = scores.round_id AND rounds.user_id = current_user_id()::uuid
  ));

-- ---- shots ----
DROP POLICY IF EXISTS "Users can CRUD own shots" ON shots;
CREATE POLICY "select_own" ON shots FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = shots.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "insert_own" ON shots FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = shots.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "update_own" ON shots FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = shots.round_id AND rounds.user_id = current_user_id()::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = shots.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "delete_own" ON shots FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = shots.round_id AND rounds.user_id = current_user_id()::uuid
  ));

-- ---- companions ----
DROP POLICY IF EXISTS "Users can CRUD own companions" ON companions;
CREATE POLICY "select_own" ON companions FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = companions.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "insert_own" ON companions FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = companions.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "update_own" ON companions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = companions.round_id AND rounds.user_id = current_user_id()::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = companions.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "delete_own" ON companions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = companions.round_id AND rounds.user_id = current_user_id()::uuid
  ));

-- ---- game_plans ----
DROP POLICY IF EXISTS "Users can CRUD own game_plans" ON game_plans;
CREATE POLICY "select_own" ON game_plans FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = game_plans.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "insert_own" ON game_plans FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = game_plans.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "update_own" ON game_plans FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = game_plans.round_id AND rounds.user_id = current_user_id()::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = game_plans.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "delete_own" ON game_plans FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = game_plans.round_id AND rounds.user_id = current_user_id()::uuid
  ));

-- ---- memos ----
DROP POLICY IF EXISTS "Users can CRUD own memos" ON memos;
CREATE POLICY "select_own" ON memos FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = memos.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "insert_own" ON memos FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = memos.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "update_own" ON memos FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = memos.round_id AND rounds.user_id = current_user_id()::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = memos.round_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "delete_own" ON memos FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM rounds WHERE rounds.id = memos.round_id AND rounds.user_id = current_user_id()::uuid
  ));

-- ============================================================================
-- 3.3 profiles 経由テーブル (1) — clubs
-- ============================================================================

-- ---- clubs ----
DROP POLICY IF EXISTS "Users can CRUD own clubs" ON clubs;
CREATE POLICY "select_own" ON clubs FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = clubs.profile_id AND profiles.user_id = current_user_id()::uuid
  ));
CREATE POLICY "insert_own" ON clubs FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = clubs.profile_id AND profiles.user_id = current_user_id()::uuid
  ));
CREATE POLICY "update_own" ON clubs FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = clubs.profile_id AND profiles.user_id = current_user_id()::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = clubs.profile_id AND profiles.user_id = current_user_id()::uuid
  ));
CREATE POLICY "delete_own" ON clubs FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = clubs.profile_id AND profiles.user_id = current_user_id()::uuid
  ));

-- ============================================================================
-- 3.4 companions 経由テーブル (1) — companion_scores
-- ============================================================================

-- ---- companion_scores ----
DROP POLICY IF EXISTS "Users can CRUD own companion_scores" ON companion_scores;
CREATE POLICY "select_own" ON companion_scores FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM companions JOIN rounds ON rounds.id = companions.round_id
    WHERE companions.id = companion_scores.companion_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "insert_own" ON companion_scores FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM companions JOIN rounds ON rounds.id = companions.round_id
    WHERE companions.id = companion_scores.companion_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "update_own" ON companion_scores FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM companions JOIN rounds ON rounds.id = companions.round_id
    WHERE companions.id = companion_scores.companion_id AND rounds.user_id = current_user_id()::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM companions JOIN rounds ON rounds.id = companions.round_id
    WHERE companions.id = companion_scores.companion_id AND rounds.user_id = current_user_id()::uuid
  ));
CREATE POLICY "delete_own" ON companion_scores FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM companions JOIN rounds ON rounds.id = companions.round_id
    WHERE companions.id = companion_scores.companion_id AND rounds.user_id = current_user_id()::uuid
  ));

-- ============================================================================
-- 3.5 game_plan_sets 経由テーブル (1) — game_plan_holes
-- ============================================================================

-- ---- game_plan_holes ----
DROP POLICY IF EXISTS "Users can CRUD own game_plan_holes" ON game_plan_holes;
CREATE POLICY "select_own" ON game_plan_holes FOR SELECT
  USING (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM game_plan_sets WHERE game_plan_sets.id = game_plan_holes.game_plan_set_id AND game_plan_sets.user_id = current_user_id()::uuid
  ));
CREATE POLICY "insert_own" ON game_plan_holes FOR INSERT
  WITH CHECK (current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM game_plan_sets WHERE game_plan_sets.id = game_plan_holes.game_plan_set_id AND game_plan_sets.user_id = current_user_id()::uuid
  ));
CREATE POLICY "update_own" ON game_plan_holes FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM game_plan_sets WHERE game_plan_sets.id = game_plan_holes.game_plan_set_id AND game_plan_sets.user_id = current_user_id()::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM game_plan_sets WHERE game_plan_sets.id = game_plan_holes.game_plan_set_id AND game_plan_sets.user_id = current_user_id()::uuid
  ));
CREATE POLICY "delete_own" ON game_plan_holes FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM game_plan_sets WHERE game_plan_sets.id = game_plan_holes.game_plan_set_id AND game_plan_sets.user_id = current_user_id()::uuid
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
