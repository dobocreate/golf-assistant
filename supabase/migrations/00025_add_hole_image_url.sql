-- Add image_url column to holes table for hole layout images
ALTER TABLE holes ADD COLUMN image_url text
  CHECK (image_url IS NULL OR image_url LIKE '/courses/%' OR image_url ILIKE 'https://%');
