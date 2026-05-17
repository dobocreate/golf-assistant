-- Phase 8 cleanup: 旧 Supabase Storage URL 列を撤去
--
-- 経緯:
--   - 00031 で hole_view_configs に cached_image_url (Supabase Storage の URL) を追加
--   - 00043 で object_key 列を追加し、R2 移行と並行運用
--   - 00044 で cached_image_url から object_key へ backfill 完了
--   - Phase 4 で R2 オブジェクト 71 件コピー完了、全行 object_key 設定済
--   - Phase 7 で Supabase Auth 撤去、Supabase project 自体も削除
--
-- Phase 8 cleanup の本マイグレーションで旧 URL 列を撤去:
--   - cached_image_url       (mapbox 衛星画像 URL、object_key で完全代替済)
--   - cached_image_url_gsi   (国土地理院画像 URL、object_key_gsi で完全代替済)
--
-- 事前確認 (2026-05-18 実施):
--   SELECT COUNT(*) FILTER (WHERE object_key IS NULL AND cached_image_url IS NOT NULL)
--     FROM hole_view_configs;  -- => 0 (フォールバック不要)

ALTER TABLE hole_view_configs
  DROP COLUMN IF EXISTS cached_image_url,
  DROP COLUMN IF EXISTS cached_image_url_gsi;
