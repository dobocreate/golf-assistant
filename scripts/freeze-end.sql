-- ============================================================================
-- freeze-end.sql
-- 24h freeze 期間終了後、kishida が「重大問題なし」と判断したら実行
-- Section 8.1.1 Layer 3 / 8.1.4
--
-- 実行方法: Neon SQL editor or psql で migration_owner として実行
--   psql "$NEON_DATABASE_URL_MIGRATION_OWNER" -f scripts/freeze-end.sql
--
-- 効果: freeze-start.sql で REVOKE した DML / RPC EXECUTE 権限を復旧する。
--       実行後、Vercel project の WRITE_FREEZE_ACTIVE=false (or 削除) で
--       アプリ層 gate も解除する。
-- ============================================================================

BEGIN;

-- (a) table DML 復旧
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO assistant_app;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mapper_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner IN SCHEMA public
  GRANT INSERT, UPDATE, DELETE ON TABLES TO assistant_app;

-- (b) RPC EXECUTE 復旧 (Round 5 Critical 1)
GRANT EXECUTE ON FUNCTION replace_shots_for_hole(UUID, INT, JSONB) TO assistant_app;
GRANT EXECUTE ON FUNCTION replace_companion_scores_for_hole(UUID, INT, JSONB) TO assistant_app;

COMMIT;
