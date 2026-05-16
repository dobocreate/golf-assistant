-- ============================================================================
-- 00040_neon_rewrite_rpcs.sql
-- Phase 2 適用 (Round 5 Critical 1 / Section 4.6)
--
-- 目的: 既存の SECURITY DEFINER RPC が依存する auth.uid() (Supabase 専用) を
--      current_user_id()::UUID に書き換え、Neon でも動作させる。
--      function owner を neondb_owner に明示し、EXECUTE GRANT を assistant_app
--      に限定する (PUBLIC からは REVOKE)。
--
-- 対象 RPC (Section 4.6 表):
--   - replace_shots_for_hole(UUID, INT, JSONB)        : ホール内ショット全置換
--   - replace_companion_scores_for_hole(UUID, INT, JSONB) : 同伴者スコア全置換
--
-- 適用順序 (Phase 2):
--   1. 00040 (本ファイル、auth.uid() 書き換え + OWNER 明示)
--   2. 00041 (clerk_user_id 列追加)
--   3. 00042 (assistant_app / readonly / mapper_admin ロール作成 + RLS 書き換え)
--
-- 設計変更 (2026-05-16): 当初は `ALTER ROLE neondb_owner RENAME TO migration_owner`
-- を予定していたが、Neon が "session user cannot be renamed" を返すため不可。
-- 代替として neondb_owner をそのまま canonical owner として使用する。
--
-- Phase 8.1 freeze-start.sql で対応 RPC の EXECUTE を REVOKE する点に注意。
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ownership の明示化
-- ----------------------------------------------------------------------------
ALTER FUNCTION replace_shots_for_hole(UUID, INT, JSONB)
  OWNER TO neondb_owner;
ALTER FUNCTION replace_companion_scores_for_hole(UUID, INT, JSONB)
  OWNER TO neondb_owner;

-- ----------------------------------------------------------------------------
-- replace_shots_for_hole: auth.uid() → current_user_id()::UUID
-- 本文は 00039 (GPS 13 列対応版) を移植
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION replace_shots_for_hole(
  p_round_id UUID,
  p_hole_number INT,
  p_shots JSONB DEFAULT '[]'::JSONB
)
RETURNS SETOF shots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := current_user_id()::UUID;
BEGIN
  -- (0) 認証チェック
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no user context';
  END IF;

  -- (1) JSON 形式検証
  IF jsonb_typeof(p_shots) <> 'array' THEN
    RAISE EXCEPTION 'invalid p_shots: expected JSON array';
  END IF;

  -- (2) ホール番号範囲検証
  IF p_hole_number < 1 OR p_hole_number > 18 THEN
    RAISE EXCEPTION 'invalid p_hole_number: must be 1..18';
  END IF;

  -- (3) 所有権 + status ガード
  IF NOT EXISTS (
    SELECT 1 FROM public.rounds
    WHERE id = p_round_id
      AND user_id = v_user_id
      AND status IN ('in_progress', 'completed')
  ) THEN
    RAISE EXCEPTION 'forbidden: round does not belong to current user or status not editable';
  END IF;

  -- (4) 既存ショット全削除
  DELETE FROM public.shots
  WHERE round_id = p_round_id AND hole_number = p_hole_number;

  -- (5) 新ショット挿入 (既存 20 列 + GPS 13 列)
  IF jsonb_array_length(p_shots) > 0 THEN
    RETURN QUERY
    INSERT INTO public.shots (
      round_id, hole_number, shot_number, client_id, club, result,
      miss_type, direction_lr, direction_fb, lie,
      slope_fb, slope_lr, landing, shot_type,
      remaining_distance, note, advice_text,
      wind_direction, wind_strength, elevation,
      -- GPS 列 (13)
      latitude, longitude, gps_accuracy_m, captured_at,
      auto_lie, remaining_to_green_m, gps_source,
      original_latitude, original_longitude, edited_at,
      auto_lie_confidence, position_revision, auto_lie_calculated_at
    )
    SELECT
      p_round_id,
      p_hole_number,
      (s->>'shot_number')::INT,
      s->>'client_id',
      s->>'club',
      s->>'result',
      s->>'miss_type',
      s->>'direction_lr',
      s->>'direction_fb',
      s->>'lie',
      s->>'slope_fb',
      s->>'slope_lr',
      s->>'landing',
      s->>'shot_type',
      (s->>'remaining_distance')::NUMERIC,
      s->>'note',
      s->>'advice_text',
      s->>'wind_direction',
      s->>'wind_strength',
      s->>'elevation',
      -- GPS 列 (古い payload では NULL)
      (s->>'latitude')::DOUBLE PRECISION,
      (s->>'longitude')::DOUBLE PRECISION,
      (s->>'gps_accuracy_m')::REAL,
      (s->>'captured_at')::TIMESTAMPTZ,
      s->>'auto_lie',
      (s->>'remaining_to_green_m')::INT,
      COALESCE(s->>'gps_source', 'gps'),
      (s->>'original_latitude')::DOUBLE PRECISION,
      (s->>'original_longitude')::DOUBLE PRECISION,
      (s->>'edited_at')::TIMESTAMPTZ,
      s->>'auto_lie_confidence',
      COALESCE((s->>'position_revision')::INT, 0),
      (s->>'auto_lie_calculated_at')::TIMESTAMPTZ
    FROM jsonb_array_elements(p_shots) AS s
    RETURNING *;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- replace_companion_scores_for_hole: 本文は 00037 を移植
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION replace_companion_scores_for_hole(
  p_round_id UUID,
  p_hole_number INT,
  p_scores JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := current_user_id()::UUID;
  v_companion_ids UUID[];
BEGIN
  -- (0) 認証チェック
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no user context';
  END IF;

  -- (1) JSON 形式検証
  IF jsonb_typeof(p_scores) <> 'array' THEN
    RAISE EXCEPTION 'invalid p_scores: expected JSON array';
  END IF;

  -- (2) ホール番号範囲検証
  IF p_hole_number < 1 OR p_hole_number > 18 THEN
    RAISE EXCEPTION 'invalid p_hole_number: must be 1..18';
  END IF;

  -- (3) 所有権 + status ガード
  IF NOT EXISTS (
    SELECT 1 FROM public.rounds
    WHERE id = p_round_id
      AND user_id = v_user_id
      AND status IN ('in_progress', 'completed')
  ) THEN
    RAISE EXCEPTION 'forbidden: round does not belong to current user or status not editable';
  END IF;

  -- (4) 当該ラウンドの companion_id を取得 (所属保証)
  SELECT array_agg(id) INTO v_companion_ids
  FROM public.companions
  WHERE round_id = p_round_id;

  IF v_companion_ids IS NULL THEN
    RETURN;
  END IF;

  -- (5) 不正な companion_id が混入していたら拒否
  IF jsonb_array_length(p_scores) > 0 AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_scores) AS s
    WHERE (s->>'companion_id')::UUID <> ALL(v_companion_ids)
  ) THEN
    RAISE EXCEPTION 'forbidden: companion does not belong to this round';
  END IF;

  -- (6) 既存スコア削除
  DELETE FROM public.companion_scores
  WHERE companion_id = ANY(v_companion_ids)
    AND hole_number = p_hole_number;

  -- (7) 新スコア挿入
  IF jsonb_array_length(p_scores) > 0 THEN
    INSERT INTO public.companion_scores (companion_id, hole_number, strokes, putts)
    SELECT
      (s->>'companion_id')::UUID,
      p_hole_number,
      (s->>'strokes')::INT,
      (s->>'putts')::INT
    FROM jsonb_array_elements(p_scores) AS s;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- EXECUTE 権限: PUBLIC REVOKE → assistant_app だけに GRANT
-- (00042 で assistant_app ロール作成後に再 GRANT する形にする)
-- ここでは PUBLIC と Supabase 用 anon/authenticated から REVOKE するだけ
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION replace_shots_for_hole(UUID, INT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION replace_companion_scores_for_hole(UUID, INT, JSONB) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION replace_shots_for_hole(UUID, INT, JSONB) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION replace_companion_scores_for_hole(UUID, INT, JSONB) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION replace_shots_for_hole(UUID, INT, JSONB) FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION replace_companion_scores_for_hole(UUID, INT, JSONB) FROM authenticated';
  END IF;
END $$;

-- assistant_app への GRANT は 00042 でロール作成後に実行する (順序依存回避)

COMMIT;
