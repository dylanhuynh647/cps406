-- Patch migration for environments that already applied 006 before invitation RLS updates.
-- Safe to run multiple times.

DO $$
BEGIN
    IF to_regclass('public.bug_assignment_invitations') IS NULL THEN
        RAISE EXCEPTION 'Table public.bug_assignment_invitations does not exist. Apply migration 006 first.';
    END IF;
END $$;

ALTER TABLE public.bug_assignment_invitations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'bug_assignment_invitations'
          AND policyname = 'Service role can manage bug assignment invitations'
    ) THEN
        CREATE POLICY "Service role can manage bug assignment invitations"
            ON public.bug_assignment_invitations
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
          AND tablename = 'bug_assignment_invitations'
          AND policyname = 'Invited user can read own invitations'
    ) THEN
        CREATE POLICY "Invited user can read own invitations"
            ON public.bug_assignment_invitations
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
          AND tablename = 'bug_assignment_invitations'
          AND policyname = 'Invited user can update own invitations'
    ) THEN
        CREATE POLICY "Invited user can update own invitations"
            ON public.bug_assignment_invitations
            FOR UPDATE
            USING (invited_user_id = auth.uid())
            WITH CHECK (invited_user_id = auth.uid());
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bug_assignment_invites_user_status
    ON public.bug_assignment_invitations(invited_user_id, status);

CREATE INDEX IF NOT EXISTS idx_bug_assignment_invites_bug
    ON public.bug_assignment_invitations(bug_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_bug_assignment_invitations_updated_at'
          AND tgrelid = 'public.bug_assignment_invitations'::regclass
    ) THEN
        CREATE TRIGGER update_bug_assignment_invitations_updated_at
            BEFORE UPDATE ON public.bug_assignment_invitations
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
