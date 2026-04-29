CREATE TABLE hole_map_points (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_id            uuid REFERENCES holes(id) ON DELETE CASCADE NOT NULL,
  point_kind         text NOT NULL CHECK (point_kind IN ('tee', 'green', 'hazard', 'ob', 'bunker', 'water')),
  name               text NOT NULL,
  lat                decimal(10,7) NOT NULL,
  lng                decimal(10,7) NOT NULL,
  elevation_m        decimal(7,2),
  hsrc               text,
  is_tee_reference   boolean NOT NULL DEFAULT false,
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX ON hole_map_points (hole_id);
CREATE INDEX ON hole_map_points (hole_id, point_kind);
CREATE UNIQUE INDEX hole_map_points_tee_reference_per_hole
  ON hole_map_points (hole_id)
  WHERE is_tee_reference = true;

ALTER TABLE hole_map_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hole_map_points readable by all"
  ON hole_map_points FOR SELECT USING (true);
