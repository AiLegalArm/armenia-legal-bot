
-- =============================================================================
-- Add structured precedent intelligence fields to legal_practice_kb
-- =============================================================================

-- Core precedent fields
ALTER TABLE public.legal_practice_kb
  ADD COLUMN IF NOT EXISTS ratio_decidendi text,
  ADD COLUMN IF NOT EXISTS interpreted_norms jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS legal_principle text,
  ADD COLUMN IF NOT EXISTS procedural_aspect text,
  ADD COLUMN IF NOT EXISTS application_scope text,
  ADD COLUMN IF NOT EXISTS limitations_of_application text,
  ADD COLUMN IF NOT EXISTS precedent_authority_level text,
  ADD COLUMN IF NOT EXISTS keywords text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS related_cases text[] DEFAULT '{}'::text[];

-- ECHR-specific fields
ALTER TABLE public.legal_practice_kb
  ADD COLUMN IF NOT EXISTS echr_article text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS violation_type text,
  ADD COLUMN IF NOT EXISTS echr_test_applied text,
  ADD COLUMN IF NOT EXISTS echr_principle_formula text;

-- Add check constraint for procedural_aspect enum
ALTER TABLE public.legal_practice_kb
  ADD CONSTRAINT chk_procedural_aspect
  CHECK (procedural_aspect IS NULL OR procedural_aspect IN ('material_law', 'procedural_law', 'mixed'));

-- Add check constraint for precedent_authority_level enum
ALTER TABLE public.legal_practice_kb
  ADD CONSTRAINT chk_precedent_authority_level
  CHECK (precedent_authority_level IS NULL OR precedent_authority_level IN ('binding_position', 'guiding_practice', 'individual_case'));

-- GIN index on keywords for fast array search
CREATE INDEX IF NOT EXISTS idx_lpk_keywords ON public.legal_practice_kb USING GIN (keywords);

-- GIN index on interpreted_norms for JSONB containment queries
CREATE INDEX IF NOT EXISTS idx_lpk_interpreted_norms ON public.legal_practice_kb USING GIN (interpreted_norms);

-- GIN index on echr_article
CREATE INDEX IF NOT EXISTS idx_lpk_echr_article ON public.legal_practice_kb USING GIN (echr_article);

-- Index on procedural_aspect for filtered queries
CREATE INDEX IF NOT EXISTS idx_lpk_procedural_aspect ON public.legal_practice_kb (procedural_aspect) WHERE procedural_aspect IS NOT NULL;

-- Index on precedent_authority_level for priority sorting
CREATE INDEX IF NOT EXISTS idx_lpk_authority_level ON public.legal_practice_kb (precedent_authority_level) WHERE precedent_authority_level IS NOT NULL;
