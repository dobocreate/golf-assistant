-- hole_areas: OBライン・バンカー・ハザード・グリーンA/Bの形状データ
CREATE TABLE hole_areas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_id      uuid REFERENCES holes(id) ON DELETE CASCADE NOT NULL,
  area_type    text NOT NULL CHECK (
                 area_type IN ('ob_line', 'bunker', 'hazard', 'green_a', 'green_b')
               ),
  coordinates  jsonb NOT NULL,
  name         text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_hole_areas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hole_areas_updated_at
  BEFORE UPDATE ON hole_areas
  FOR EACH ROW EXECUTE FUNCTION update_hole_areas_updated_at();

-- インデックス
CREATE INDEX ON hole_areas (hole_id);
CREATE INDEX ON hole_areas (hole_id, area_type);

-- green_a / green_b は1ホールに1件のみ（Partial Unique Index）
CREATE UNIQUE INDEX hole_areas_unique_green_a
  ON hole_areas (hole_id) WHERE area_type = 'green_a';

CREATE UNIQUE INDEX hole_areas_unique_green_b
  ON hole_areas (hole_id) WHERE area_type = 'green_b';

-- RLS: 全員読み取り可、書き込みはサービスロールキーのみ
ALTER TABLE hole_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hole_areas readable by all"
  ON hole_areas FOR SELECT USING (true);
