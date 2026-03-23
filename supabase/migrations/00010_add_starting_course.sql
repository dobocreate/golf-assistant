ALTER TABLE rounds ADD COLUMN starting_course text NOT NULL DEFAULT 'out' CHECK (starting_course IN ('out', 'in'));
