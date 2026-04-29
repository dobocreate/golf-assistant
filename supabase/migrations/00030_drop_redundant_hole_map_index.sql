-- Remove redundant single-column index on hole_id.
-- The composite index (hole_id, point_kind) already covers hole_id-only lookups
-- as the leading column, making this index unnecessary.
DROP INDEX IF EXISTS hole_map_points_hole_id_idx;
