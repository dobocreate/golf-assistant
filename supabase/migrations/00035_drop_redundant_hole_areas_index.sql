-- hole_id 単体インデックスは (hole_id, area_type) 複合インデックスでカバーされるため削除
DROP INDEX IF EXISTS hole_areas_hole_id_idx;
