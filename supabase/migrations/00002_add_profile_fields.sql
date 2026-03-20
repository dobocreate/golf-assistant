-- STORY-004: プロファイルに得意ショット・距離帯・状況別傾向フィールドを追加
alter table profiles add column if not exists favorite_shot text;
alter table profiles add column if not exists favorite_distance text;
alter table profiles add column if not exists situation_notes text;
