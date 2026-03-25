-- Add phase lifecycle support for projects and phase assignment for bugs.

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS current_phase_number INTEGER,
    ADD COLUMN IF NOT EXISTS current_phase_started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS phase_auto_mode TEXT;

UPDATE public.projects
SET current_phase_number = 1
WHERE current_phase_number IS NULL;

UPDATE public.projects
SET current_phase_started_at = COALESCE(created_at, NOW())
WHERE current_phase_started_at IS NULL;

ALTER TABLE public.projects
    ALTER COLUMN current_phase_number SET DEFAULT 1,
    ALTER COLUMN current_phase_number SET NOT NULL,
    ALTER COLUMN current_phase_started_at SET DEFAULT NOW(),
    ALTER COLUMN current_phase_started_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_phase_auto_mode_check'
    ) THEN
        ALTER TABLE public.projects
            ADD CONSTRAINT projects_phase_auto_mode_check
            CHECK (phase_auto_mode IS NULL OR phase_auto_mode IN ('weekly', 'biweekly', 'monthly'));
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.project_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    phase_number INTEGER NOT NULL CHECK (phase_number > 0),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    transition_type TEXT NOT NULL DEFAULT 'manual' CHECK (transition_type IN ('initial', 'manual', 'auto')),
    changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, phase_number)
);

CREATE INDEX IF NOT EXISTS idx_project_phases_project_id ON public.project_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_project_phase ON public.project_phases(project_id, phase_number);

ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage project phases" ON public.project_phases;
CREATE POLICY "Service role can manage project phases"
    ON public.project_phases
    USING (true)
    WITH CHECK (true);

DROP TRIGGER IF EXISTS update_project_phases_updated_at ON public.project_phases;
CREATE TRIGGER update_project_phases_updated_at BEFORE UPDATE ON public.project_phases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.project_phases (project_id, phase_number, started_at, transition_type)
SELECT p.id, p.current_phase_number, p.current_phase_started_at, 'initial'
FROM public.projects p
ON CONFLICT (project_id, phase_number) DO NOTHING;

ALTER TABLE public.bugs
    ADD COLUMN IF NOT EXISTS phase_number INTEGER;

UPDATE public.bugs b
SET phase_number = p.current_phase_number
FROM public.projects p
WHERE b.project_id = p.id
  AND b.phase_number IS NULL;

UPDATE public.bugs
SET phase_number = 1
WHERE phase_number IS NULL;

ALTER TABLE public.bugs
    ALTER COLUMN phase_number SET DEFAULT 1,
    ALTER COLUMN phase_number SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bugs_project_phase_number ON public.bugs(project_id, phase_number);