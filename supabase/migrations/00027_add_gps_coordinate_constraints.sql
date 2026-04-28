ALTER TABLE holes
  ADD CONSTRAINT holes_tee_lat_range CHECK (tee_lat IS NULL OR (tee_lat >= -90 AND tee_lat <= 90)),
  ADD CONSTRAINT holes_tee_lng_range CHECK (tee_lng IS NULL OR (tee_lng >= -180 AND tee_lng <= 180)),
  ADD CONSTRAINT holes_green_lat_range CHECK (green_lat IS NULL OR (green_lat >= -90 AND green_lat <= 90)),
  ADD CONSTRAINT holes_green_lng_range CHECK (green_lng IS NULL OR (green_lng >= -180 AND green_lng <= 180));
