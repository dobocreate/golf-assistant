ALTER TABLE holes
  ADD COLUMN ref_lat double precision,
  ADD COLUMN ref_lng double precision,
  ADD CONSTRAINT holes_ref_lat_range CHECK (ref_lat IS NULL OR (ref_lat >= -90 AND ref_lat <= 90)),
  ADD CONSTRAINT holes_ref_lng_range CHECK (ref_lng IS NULL OR (ref_lng >= -180 AND ref_lng <= 180));
