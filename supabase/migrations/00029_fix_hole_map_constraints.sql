-- Fix: add NOT NULL to timestamp columns (matches project convention)
ALTER TABLE hole_map_points
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE hole_elevation_grids
  ALTER COLUMN fetched_at SET NOT NULL;

-- Fix: add updated_at trigger to hole_map_points
-- update_updated_at() was defined in 00001_initial_schema.sql
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON hole_map_points
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Fix: refresh fetched_at on update for hole_elevation_grids
-- Uses a simple trigger that sets fetched_at = now() on every UPDATE
CREATE OR REPLACE FUNCTION update_fetched_at()
RETURNS trigger AS $$
BEGIN
  NEW.fetched_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_fetched_at
  BEFORE UPDATE ON hole_elevation_grids
  FOR EACH ROW EXECUTE FUNCTION update_fetched_at();

-- Fix: add comment to partial unique index documenting zero-reference-tee behavior
COMMENT ON INDEX hole_map_points_tee_reference_per_hole IS
  'At most one reference tee per hole. A hole may have zero reference tees (GPS not yet registered). Application code must guard against this case.';
