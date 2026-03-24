CREATE TABLE IF NOT EXISTS public.project_member_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    invited_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role public.project_member_role NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    response_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.project_member_invitations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'project_member_invitations'
          AND policyname = 'Service role can manage project member invitations'
    ) THEN
        CREATE POLICY "Service role can manage project member invitations"
            ON public.project_member_invitations
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'project_member_invitations'
          AND policyname = 'Invited user can read own project member invitations'
    ) THEN
        CREATE POLICY "Invited user can read own project member invitations"
            ON public.project_member_invitations
            FOR SELECT
            USING (invited_user_id = auth.uid());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'project_member_invitations'
          AND policyname = 'Invited user can update own project member invitations'
    ) THEN
        CREATE POLICY "Invited user can update own project member invitations"
            ON public.project_member_invitations
            FOR UPDATE
            USING (invited_user_id = auth.uid())
            WITH CHECK (invited_user_id = auth.uid());
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_member_invites_user_status
    ON public.project_member_invitations(invited_user_id, status);

CREATE INDEX IF NOT EXISTS idx_project_member_invites_project
    ON public.project_member_invitations(project_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_project_member_invitations_updated_at'
          AND tgrelid = 'public.project_member_invitations'::regclass
    ) THEN
        CREATE TRIGGER update_project_member_invitations_updated_at
            BEFORE UPDATE ON public.project_member_invitations
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
