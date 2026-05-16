-- ============================================================================
-- 00043_add_object_key_to_hole_view_configs.sql
-- Phase 4 適用 (Section 4 Storage 移行 / Section 7.7 旧 URL 残置対策)
--
-- 目的: hole_view_configs に R2 object_key 列を追加する。
--      旧 cached_image_url* 列は遅延ロールバック期間 (Phase 8 まで) 保持し、
--      Phase 8 cutover 確認後に DROP する。
--
-- アプリ側は `${R2_PUBLIC_BASE_URL}/${object_key}` で URL を組み立てる。
-- ============================================================================

BEGIN;

-- Mapbox aerial 画像の R2 key (例: '14d6a442-...-9d7f_aerial_mapbox.jpg')
ALTER TABLE hole_view_configs
  ADD COLUMN IF NOT EXISTS object_key TEXT;

-- GSI aerial 画像の R2 key
ALTER TABLE hole_view_configs
  ADD COLUMN IF NOT EXISTS object_key_gsi TEXT;

COMMENT ON COLUMN hole_view_configs.object_key IS
  'R2 object key for mapbox aerial image. Bucket: golf-assistant-{env}. Public URL: ${R2_PUBLIC_BASE_URL}/${object_key} (Section 4 / Phase 4)';
COMMENT ON COLUMN hole_view_configs.object_key_gsi IS
  'R2 object key for GSI aerial image (Section 4 / Phase 4)';

-- 既存の cached_image_url / cached_image_url_gsi は Phase 8 で削除予定。
-- Phase 4-8 期間中は両方保持し、アプリは object_key 優先 (なければ
-- cached_image_url にフォールバック) で URL を生成する。

COMMIT;
