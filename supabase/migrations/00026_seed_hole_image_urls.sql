-- Seed image_url for courses that have layout images in public/courses/
UPDATE holes
SET image_url = '/courses/aki-cc/images/hole' || LPAD(hole_number::text, 2, '0') || '.jpg'
WHERE course_id = 'aed7ebf7-5547-414a-a032-3c52ef7e36d1'
  AND image_url IS NULL;

UPDATE holes
SET image_url = '/courses/choyo-cc/images/hole' || LPAD(hole_number::text, 2, '0') || '.jpg'
WHERE course_id = '209d0de9-1b22-46db-a40e-2ff757f7bd3d'
  AND image_url IS NULL;

UPDATE holes
SET image_url = '/courses/ube72-mannenike-west/images/hole' || LPAD(hole_number::text, 2, '0') || '.jpg'
WHERE course_id = '3e405465-3785-4fb7-907c-22bfbf7b27de'
  AND image_url IS NULL;

UPDATE holes
SET image_url = '/courses/ube72-ajisu/images/hole' || LPAD(hole_number::text, 2, '0') || '.jpg'
WHERE course_id = '29960495-a5ff-4dd2-b2f3-03a0c802514c'
  AND image_url IS NULL;
