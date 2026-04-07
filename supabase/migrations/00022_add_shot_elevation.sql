-- ショットごとの高低差（打ち上げ/平坦/打ち下ろし）
ALTER TABLE shots ADD COLUMN elevation text CHECK (elevation IN ('uphill', 'flat', 'downhill'));
