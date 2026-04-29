CREATE TABLE hole_elevation_grids (
  hole_id           uuid PRIMARY KEY REFERENCES holes(id) ON DELETE CASCADE,
  bbox_min_lat      decimal(10,7) NOT NULL,
  bbox_max_lat      decimal(10,7) NOT NULL,
  bbox_min_lng      decimal(10,7) NOT NULL,
  bbox_max_lng      decimal(10,7) NOT NULL,
  grid_data         jsonb NOT NULL,
  -- grid_data shape: { origin_lat, origin_lng, rows, cols, cell_size_m, elevations: number[], hsrc_summary }
  schema_version    integer NOT NULL DEFAULT 1,
  fetched_at        timestamptz DEFAULT now()
);

ALTER TABLE hole_elevation_grids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hole_elevation_grids readable by all"
  ON hole_elevation_grids FOR SELECT USING (true);
