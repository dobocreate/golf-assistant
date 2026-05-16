-- ============================================================================
-- 00044_backfill_hole_view_config_object_keys.sql
-- Phase 4 適用: cached_image_url から R2 object_key を backfill する。
--
-- 前提:
--   Supabase Storage から R2 へのコピーでは、旧 object 名と同じ key を使う。
--   例: https://.../storage/v1/object/public/hole-thumbnails/foo.jpg
--       → object_key = 'foo.jpg'
--
-- 旧 cached_image_url* は Phase 8 まで保持する。
-- ============================================================================

BEGIN;

UPDATE hole_view_configs
SET object_key = regexp_replace(
  regexp_replace(cached_image_url, '\?.*$', ''),
  '^.*/',
  ''
)
WHERE object_key IS NULL
  AND cached_image_url IS NOT NULL
  AND regexp_replace(regexp_replace(cached_image_url, '\?.*$', ''), '^.*/', '') <> '';

UPDATE hole_view_configs
SET object_key_gsi = regexp_replace(
  regexp_replace(cached_image_url_gsi, '\?.*$', ''),
  '^.*/',
  ''
)
WHERE object_key_gsi IS NULL
  AND cached_image_url_gsi IS NOT NULL
  AND regexp_replace(regexp_replace(cached_image_url_gsi, '\?.*$', ''), '^.*/', '') <> '';

COMMIT;
