-- SECURITY DEFINER RPC のセキュリティホールを修正
-- 既存の replace_shots_for_hole / replace_companion_scores_for_hole は
-- 関数内に auth.uid() による所有権確認がなく、anon ロールにも EXECUTE 権限が付与されていた。
-- そのため anon キーだけで他人のラウンドのショット/同伴者スコアを破壊可能だった。
--
-- 本マイグレーションは GPS 列導入前の既存 19 列のみで RPC を再定義し、
-- 所有権 + status + JSON 形式 + ホール番号範囲のガードを追加する。
-- 加えて anon と PUBLIC からの EXECUTE を剥奪し、authenticated ロールのみに許可する。
--
-- 監査結果: PR1 着手時点で本番に同名関数のオーバーロードは存在しないことを確認済み
-- （Sprint 5 設計書 _bmad-output/planning-artifacts/sprint5-gps-shot-tracking.md S-0c）。
-- そのため CREATE OR REPLACE で十分。
--
-- status 条件: Server Action `replaceShotsForHole` は in_progress のみを許可（事前検証で弾く）が、
-- /api/sync ルートは in_progress + completed の両方を許可しているため、RPC は両方を許容する。
-- これにより /api/sync 経由でラウンド完了後のオフライン同期が引き続き機能する。
--
-- GPS 列対応 RPC は Sprint 5 PR2 の 00039 で再定義予定（GPS 列追加後）。

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

  -- (5) 新ショット挿入（既存 19 列のみ）
  IF jsonb_array_length(p_shots) > 0 THEN
    RETURN QUERY
    INSERT INTO public.shots (
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


CREATE OR REPLACE FUNCTION replace_companion_scores_for_hole(
  p_round_id UUID,
  p_hole_number INT,
  p_scores JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
-- search_path 固定で SECURITY DEFINER 経由の schema name shadowing 攻撃を防止
SET search_path = public, pg_temp
AS $$
DECLARE
  v_companion_ids UUID[];
BEGIN
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
      AND user_id = auth.uid()
      AND status IN ('in_progress', 'completed')
  ) THEN
    RAISE EXCEPTION 'forbidden: round does not belong to current user or status not editable';
  END IF;

  -- (4) 当該ラウンドの companion_id を取得（所属保証）
  SELECT array_agg(id) INTO v_companion_ids
  FROM public.companions
  WHERE round_id = p_round_id;

  IF v_companion_ids IS NULL THEN
    RETURN;
  END IF;

  -- (5) 不正な companion_id（当該ラウンドに属さない）が混入していたら拒否
  -- 静かに WHERE で弾くのではなく、明示エラーで呼び出し元のバグや攻撃を可視化する
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

  -- (7) 新スコア挿入（(5) で混入チェック済み）
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


-- 権限調整: anon と PUBLIC からの EXECUTE を剥奪し、authenticated のみに許可
REVOKE EXECUTE ON FUNCTION replace_shots_for_hole(UUID, INT, JSONB) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION replace_companion_scores_for_hole(UUID, INT, JSONB) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION replace_shots_for_hole(UUID, INT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION replace_companion_scores_for_hole(UUID, INT, JSONB) TO authenticated;
