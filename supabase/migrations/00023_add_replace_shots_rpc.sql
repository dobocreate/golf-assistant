-- ホール単位のショット全件入れ替え（アトミック）
CREATE OR REPLACE FUNCTION replace_shots_for_hole(
  p_round_id UUID,
  p_hole_number INT,
  p_shots JSONB DEFAULT '[]'::JSONB
)
RETURNS SETOF shots
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 既存ショットを全削除
  DELETE FROM shots
  WHERE round_id = p_round_id AND hole_number = p_hole_number;

  -- 新しいショットを全挿入（空配列なら何もしない）
  IF jsonb_array_length(p_shots) > 0 THEN
    RETURN QUERY
    INSERT INTO shots (
      round_id, hole_number, shot_number, club, result,
      miss_type, direction_lr, direction_fb, lie,
      slope_fb, slope_lr, landing, shot_type,
      remaining_distance, note, advice_text,
      wind_direction, wind_strength, elevation
    )
    SELECT
      p_round_id,
      p_hole_number,
      (s->>'shot_number')::INT,
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
      s->>'elevation'
    FROM jsonb_array_elements(p_shots) AS s
    RETURNING *;
  END IF;
END;
$$;

-- ホール単位の同伴者スコア全件入れ替え（アトミック）
CREATE OR REPLACE FUNCTION replace_companion_scores_for_hole(
  p_round_id UUID,
  p_hole_number INT,
  p_scores JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_companion_ids UUID[];
BEGIN
  -- このラウンドに属する同伴者IDを取得
  SELECT array_agg(id) INTO v_companion_ids
  FROM companions
  WHERE round_id = p_round_id;

  IF v_companion_ids IS NULL THEN
    RETURN;
  END IF;

  -- 既存スコアを全削除
  DELETE FROM companion_scores
  WHERE companion_id = ANY(v_companion_ids)
    AND hole_number = p_hole_number;

  -- 新しいスコアを全挿入
  IF jsonb_array_length(p_scores) > 0 THEN
    INSERT INTO companion_scores (companion_id, hole_number, strokes, putts)
    SELECT
      (s->>'companion_id')::UUID,
      p_hole_number,
      (s->>'strokes')::INT,
      (s->>'putts')::INT
    FROM jsonb_array_elements(p_scores) AS s
    WHERE (s->>'companion_id')::UUID = ANY(v_companion_ids);
  END IF;
END;
$$;
