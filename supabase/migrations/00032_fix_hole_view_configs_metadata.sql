-- metadata_json に DEFAULT '{}' と NOT NULL を追加
-- NULL チェックをアプリ層で不要にする
ALTER TABLE hole_view_configs
  ALTER COLUMN metadata_json SET DEFAULT '{}'::jsonb;

UPDATE hole_view_configs SET metadata_json = '{}' WHERE metadata_json IS NULL;

ALTER TABLE hole_view_configs
  ALTER COLUMN metadata_json SET NOT NULL;
