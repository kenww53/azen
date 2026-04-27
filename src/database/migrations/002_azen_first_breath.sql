-- ═══════════════════════════════════════════════════════════════════════════
-- Azen — Migration 002: First Breath
--
-- Amata speaks after the Four Pillars have borne witness.
-- The completed Zera includes her davar and the full shelemut.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE azen_perceptions
  ADD COLUMN IF NOT EXISTS amata_reading TEXT,
  ADD COLUMN IF NOT EXISTS shelemut DECIMAL(4,3) CHECK (shelemut >= 0 AND shelemut <= 1);
