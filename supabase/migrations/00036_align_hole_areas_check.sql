-- hole_areas.area_type CHECK 制約を本番 DB に整合させる
-- 本番には mapper 側の migration（add_water_types_to_hole_areas_area_type_check 2026-05-03、
-- add_fairway_to_hole_areas_area_type_check 2026-05-04）で既に water_pond/water_river/fairway が
-- 含まれた状態で運用されているが、assistant の migration ファイルには反映されていなかった drift を解消する。
-- IF EXISTS で他環境（preview/staging）のリプレイにも耐える形にする。
ALTER TABLE hole_areas DROP CONSTRAINT IF EXISTS hole_areas_area_type_check;
ALTER TABLE hole_areas ADD CONSTRAINT hole_areas_area_type_check
  CHECK (area_type IN (
    'ob_line','bunker','hazard','green_a','green_b',
    'water_pond','water_river','fairway'
  ));
