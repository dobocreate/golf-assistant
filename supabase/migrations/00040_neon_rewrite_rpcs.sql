-- ============================================================================
-- 00040_neon_rewrite_rpcs.sql
-- Phase 2 適用予定 (Phase 1 D-2 で骨組み作成、Round 5 Critical 1 / Section 4.6)
--
-- 目的: 既存の SECURITY DEFINER RPC が依存する auth.uid() (Supabase 専用) を
--      current_user_id()::UUID に書き換え、Neon でも動作させる。
--      function owner を migration_owner に明示し、EXECUTE GRANT を assistant_app
--      に限定する (PUBLIC からは REVOKE)。
--
-- 対象 RPC (Section 4.6 表):
--   - replace_shots_for_hole(UUID, INT, JSONB)        : ホール内ショット全置換
--   - replace_companion_scores_for_hole(UUID, INT, JSONB) : 同伴者スコア全置換
--
-- 適用順序 (Phase 2):
--   1. **手動**: `ALTER ROLE neondb_owner RENAME TO migration_owner` を Neon SQL editor で実行
--      (この時点で migration_owner ロールが存在することが本ファイル適用の前提)
--   2. 00040 (本ファイル、auth.uid() 書き換え + OWNER 明示)
--   3. 00041 (clerk_user_id 列追加)
--   4. 00042 (assistant_app / readonly / mapper_admin ロール作成 + RLS 書き換え)
--
-- Phase 8.1 freeze-start.sql で対応 RPC の EXECUTE を REVOKE する点に注意。
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 前提チェック: migration_owner ロールが存在することを assert
-- (手動 rename 漏れの safety net、Phase 2 適用時に即 fail させる)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_owner') THEN
    RAISE EXCEPTION 'migration_owner role not found. 先に `ALTER ROLE neondb_owner RENAME TO migration_owner` を実行してください (00040 適用前提)';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- ownership の明示化
-- ----------------------------------------------------------------------------
ALTER FUNCTION replace_shots_for_hole(UUID, INT, JSONB)
  OWNER TO migration_owner;
ALTER FUNCTION replace_companion_scores_for_hole(UUID, INT, JSONB)
  OWNER TO migration_owner;

-- ----------------------------------------------------------------------------
-- replace_shots_for_hole: auth.uid() → current_user_id()::UUID
--
-- TODO (Phase 2): 既存の 00039_extend_replace_shots_rpc_with_gps.sql の本文を
--                 ベースに、auth.uid() を v_user_id に置換した完全版を貼り付ける。
--                 ここでは設計意図のみ記載。
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION replace_shots_for_hole(
  p_round_id     UUID,
  p_hole_number  INT,
  p_shots        JSONB DEFAULT '[]'::JSONB
)
RETURNS SETOF shots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := current_user_id()::UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no user context';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM rounds
    WHERE id = p_round_id
      AND user_id = v_user_id
      AND status IN ('in_progress', 'completed')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- TODO (Phase 2): 00039 から DELETE + INSERT 本体を移植する。
  RAISE EXCEPTION 'replace_shots_for_hole body not yet ported (Phase 2)';
END;
$$;

-- ----------------------------------------------------------------------------
-- replace_companion_scores_for_hole: 同様に auth.uid() → current_user_id()::UUID
-- TODO (Phase 2): 00037_secure_existing_rpcs.sql の本文を移植する。
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION replace_companion_scores_for_hole(
  p_round_id     UUID,
  p_hole_number  INT,
  p_scores       JSONB DEFAULT '[]'::JSONB
)
RETURNS SETOF companion_scores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := current_user_id()::UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no user context';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM rounds
    WHERE id = p_round_id
      AND user_id = v_user_id
      AND status IN ('in_progress', 'completed')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RAISE EXCEPTION 'replace_companion_scores_for_hole body not yet ported (Phase 2)';
END;
$$;

-- ----------------------------------------------------------------------------
-- EXECUTE 権限: PUBLIC REVOKE → assistant_app だけに GRANT
-- (freeze-start.sql で REVOKE、freeze-end.sql で復旧する)
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION replace_shots_for_hole(UUID, INT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION replace_companion_scores_for_hole(UUID, INT, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION replace_shots_for_hole(UUID, INT, JSONB)
  TO assistant_app;
GRANT EXECUTE ON FUNCTION replace_companion_scores_for_hole(UUID, INT, JSONB)
  TO assistant_app;

COMMIT;
