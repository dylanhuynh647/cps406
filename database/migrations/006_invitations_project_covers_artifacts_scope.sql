CREATE TYPE public.assignment_invitation_status AS ENUM ('pending', 'accepted', 'declined');

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

ALTER TABLE public.artifacts
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS file_path TEXT,
    ADD COLUMN IF NOT EXISTS file_name TEXT,
    ADD COLUMN IF NOT EXISTS file_mime_type TEXT,
    ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS is_uploaded_file BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_artifacts_project_id ON public.artifacts(project_id);

CREATE TABLE IF NOT EXISTS public.bug_assignment_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bug_id UUID NOT NULL REFERENCES public.bugs(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    invited_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status public.assignment_invitation_status NOT NULL DEFAULT 'pending',
    response_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.bug_assignment_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage bug assignment invitations"
    ON public.bug_assignment_invitations
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Invited user can read own invitations"
    ON public.bug_assignment_invitations
    FOR SELECT
    USING (invited_user_id = auth.uid());

CREATE POLICY "Invited user can update own invitations"
    ON public.bug_assignment_invitations
    FOR UPDATE
    USING (invited_user_id = auth.uid())
    WITH CHECK (invited_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_bug_assignment_invites_user_status
    ON public.bug_assignment_invitations(invited_user_id, status);

CREATE INDEX IF NOT EXISTS idx_bug_assignment_invites_bug
    ON public.bug_assignment_invitations(bug_id);

CREATE TRIGGER update_bug_assignment_invitations_updated_at BEFORE UPDATE ON public.bug_assignment_invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
