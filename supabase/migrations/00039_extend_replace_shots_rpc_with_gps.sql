-- replace_shots_for_hole を GPS 列対応に再定義
-- Sprint 5 PR2 (S-1) — _bmad-output/planning-artifacts/sprint5-gps-shot-tracking.md Section 3.5
--
-- 00037 で導入したセキュリティガード（auth.uid() + status + JSON 検証 + ホール番号範囲）と
-- search_path 固定はすべて維持する。INSERT 列リストに GPS 関連 13 列を追加する。
--
-- 古い payload（GPS 列を持たない）を投げると関連列は NULL になるが、
-- migrate-local-shots.ts が起動時に旧 payload を破棄して IDB から再構築・再 enqueue するため、
-- 過渡期の GPS データロスは発生しない。

CREATE OR REPLACE FUNCTION replace_shots_for_hole(
  p_round_id UUID,
  p_hole_number INT,
  p_shots JSONB DEFAULT '[]'::JSONB
)
RETURNS SETOF shots
LANGUAGE plpgsql
SECURITY DEFINER
-- search_path 固定で SECURITY DEFINER 経由の schema name shadowing 攻撃を防止
SET search_path = public, pg_temp
AS $$
BEGIN
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
      AND user_id = auth.uid()
      AND status IN ('in_progress', 'completed')
  ) THEN
    RAISE EXCEPTION 'forbidden: round does not belong to current user or status not editable';
  END IF;

  -- (4) 既存ショット全削除
  DELETE FROM public.shots
  WHERE round_id = p_round_id AND hole_number = p_hole_number;

  -- (5) 新ショット挿入（既存 20 列 + GPS 13 列）
  IF jsonb_array_length(p_shots) > 0 THEN
    RETURN QUERY
    INSERT INTO public.shots (
      round_id, hole_number, shot_number, client_id, club, result,
      miss_type, direction_lr, direction_fb, lie,
      slope_fb, slope_lr, landing, shot_type,
      remaining_distance, note, advice_text,
      wind_direction, wind_strength, elevation,
      -- GPS 列（13）
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
      -- GPS 列（古い payload では NULL）
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

-- 権限調整: CREATE OR REPLACE は既存 ACL を保持するが、
-- 防御的に再宣言して将来の monorepo フェッチ・migration 巻き戻し・別 DB へのリプレイ時にも
-- anon/PUBLIC への EXECUTE が誤って残らないように担保する
REVOKE EXECUTE ON FUNCTION replace_shots_for_hole(UUID, INT, JSONB) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION replace_shots_for_hole(UUID, INT, JSONB) TO authenticated;
