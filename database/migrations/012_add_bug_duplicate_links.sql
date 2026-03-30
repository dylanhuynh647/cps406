-- Add duplicate bug linkage support.

ALTER TABLE public.bugs
    ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES public.bugs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bugs_project_duplicate_of ON public.bugs(project_id, duplicate_of);
