-- ショットにclient_idカラムを追加（リトライ時の重複排除用）
ALTER TABLE shots ADD COLUMN IF NOT EXISTS client_id TEXT;

-- replace_shots_for_hole RPCを更新（client_idを含める）
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
      round_id, hole_number, shot_number, client_id, club, result,
      miss_type, direction_lr, direction_fb, lie,
      slope_fb, slope_lr, landing, shot_type,
      remaining_distance, note, advice_text,
      wind_direction, wind_strength, elevation
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
      s->>'elevation'
    FROM jsonb_array_elements(p_shots) AS s
    RETURNING *;
  END IF;
END;
$$;
