-- hole_view_configs: ホールごとの航空写真ビュー設定
-- スタート地点（画像下）・エンド地点（画像上）の基準点と生成済み画像URLを保存する

CREATE TABLE hole_view_configs (
  hole_id          uuid PRIMARY KEY REFERENCES holes(id) ON DELETE CASCADE,
  ref_start_lat    double precision NOT NULL CHECK (ref_start_lat BETWEEN -90 AND 90),
  ref_start_lng    double precision NOT NULL CHECK (ref_start_lng BETWEEN -180 AND 180),
  ref_end_lat      double precision NOT NULL CHECK (ref_end_lat BETWEEN -90 AND 90),
  ref_end_lng      double precision NOT NULL CHECK (ref_end_lng BETWEEN -180 AND 180),
  cached_image_url text,
  metadata_json    jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- updated_at 自動更新トリガー（既存の update_updated_at 関数を流用）
CREATE TRIGGER set_updated_at_hole_view_configs
  BEFORE UPDATE ON hole_view_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: 読み取りは全員可、書き込みはサービスロールキーのみ
-- INSERT/UPDATE/DELETE はポリシーを意図的に設けない
-- （ポリシー未定義 = authenticated/anon ロールからの書き込みは拒否）
-- サービスロールキーは RLS をバイパスするため書き込み可能
ALTER TABLE hole_view_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hole_view_configs_select"
  ON hole_view_configs FOR SELECT
  USING (true);
