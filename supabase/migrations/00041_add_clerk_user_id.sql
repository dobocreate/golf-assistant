-- ============================================================================
-- 00041_add_clerk_user_id.sql
-- Phase 2 適用予定 (Phase 1 D-2 で骨組み作成、Round 6 Critical 1 / Section 4.0)
--
-- 目的: profiles に Clerk userId (text) を保持する列を追加する。
-- 既存の profiles.user_id (uuid) と RLS の UUID 設計はそのまま維持する。
--
-- 適用順序: 00040 (RPC 書き換え) より後、00042 (roles+RLS) より前。
--
-- **Phase 5 で必要な追加変更 (TODO)**:
--   現状 `profiles.user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE` の FK は
--   Supabase 専用 schema (`auth.users`) を参照している。Neon 側では `auth.users` が
--   存在しないため、以下のいずれかが必要:
--     (a) Phase 2 で別 migration (例: 00043) を追加し、FK 制約を DROP する
--     (b) 移行前に既存 FK を DROP した状態で Neon に restore する
--   Clerk webhook (`/api/webhooks/clerk` Section 11.1) が profiles 行を作る際に
--   `auth.users` への参照が無いと FK 違反するため、Phase 5 着手前に解消必須。
-- ============================================================================

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_profiles_clerk_user_id
  ON profiles(clerk_user_id)
  WHERE clerk_user_id IS NOT NULL;

COMMENT ON COLUMN profiles.clerk_user_id IS
  'Clerk userId (user_xxx 形式)。アプリ層で profiles.user_id への lookup に使用 (Section 4.0)';

COMMIT;
