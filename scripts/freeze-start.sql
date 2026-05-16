-- ============================================================================
-- freeze-start.sql
-- Phase 7 cutover の最後、Phase 8.1 (即時ロールバック準備) の DB 層 gate
-- Section 8.1.1 Layer 3 / Round 4 Major 1
--
-- 実行方法: Neon SQL editor or psql で migration_owner として実行
--   psql "$NEON_DATABASE_URL_MIGRATION_OWNER" -f scripts/freeze-start.sql
--
-- 効果: assistant_app / mapper_admin の DML 権限と、SECURITY DEFINER mutating
--       RPC の EXECUTE 権限を REVOKE する。これにより 24h 期間中の writes は
--       経路 (assistant / mapper / 手動 SQL) を問わず DB に到達しない。
-- ============================================================================

BEGIN;

-- (a) 既存 table 上の DML GRANT を REVOKE
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM assistant_app;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM mapper_admin;

-- (b) 将来テーブル分の default privileges を REVOKE (FOR ROLE 限定、Round 5 Major 2)
ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE ON TABLES FROM assistant_app;
-- mapper_admin には default DML grant が無いため REVOKE 対象なし

-- (c) SECURITY DEFINER mutating RPC の EXECUTE を REVOKE (Round 5 Critical 1)
-- ※ SECURITY DEFINER のため caller の table 権限を bypass する経路。必須。
-- 新規 mutating SECURITY DEFINER RPC を追加する際はここに行を追加すること
-- (Section 4.6 の運用 checklist / scripts/check-freeze-rpc-whitelist.sh で CI 検査)
REVOKE EXECUTE ON FUNCTION replace_shots_for_hole(UUID, INT, JSONB)
  FROM assistant_app, PUBLIC;
REVOKE EXECUTE ON FUNCTION replace_companion_scores_for_hole(UUID, INT, JSONB)
  FROM assistant_app, PUBLIC;

COMMIT;

-- assistant_app_readonly は SELECT only なので無変更 (read paths は freeze 中も動く)
