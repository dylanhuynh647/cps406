-- Consolidated migration script
-- Contains all migrations in repository execution order
-- Generated on 2026-03-27

-- =====================================================================
-- BEGIN: 001_initial_schema.sql
-- =====================================================================

-- Create ENUM types
CREATE TYPE public.user_role AS ENUM ('reporter', 'developer', 'admin');
CREATE TYPE public.artifact_type AS ENUM ('product_backlog', 'design_document', 'diagram', 'formal_spec', 'source_file', 'test_source_file', 'binary', 'data_file', 'other');
CREATE TYPE public.bug_category AS ENUM ('logic', 'syntax', 'performance', 'documentation', 'ui/ux', 'security', 'data', 'other');
CREATE TYPE public.bug_status AS ENUM ('open', 'in_progress', 'resolved');

-- Create users table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role public.user_role DEFAULT 'reporter' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    full_name TEXT,
    avatar_url TEXT
);

-- Create artifacts table
CREATE TABLE IF NOT EXISTS public.artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type public.artifact_type DEFAULT 'other' NOT NULL,
    description TEXT,
    reference TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create bugs table
CREATE TABLE IF NOT EXISTS public.bugs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    bug_type public.bug_category DEFAULT 'other' NOT NULL,
    status public.bug_status DEFAULT 'open' NOT NULL,
    found_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    fixed_at TIMESTAMP WITH TIME ZONE,
    reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create bug_artifacts join table
CREATE TABLE IF NOT EXISTS public.bug_artifacts (
    bug_id UUID NOT NULL REFERENCES public.bugs(id) ON DELETE CASCADE,
    artifact_id UUID NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    PRIMARY KEY (bug_id, artifact_id)
);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bug_artifacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Allow individual access" ON public.users
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Allow individual update" ON public.users
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Allow service role to select
create policy "Service role can select users"
  on public.users
  for select
  using (true);

-- Allow service role to insert
create policy "Service role can insert users"
  on public.users
  for insert
  with check (true);

-- Function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_r public.user_role;
BEGIN
    SELECT role INTO user_r FROM public.users WHERE id = user_id;
    RETURN user_r;
END;
$$;

-- RLS Policy for admins to view all users
CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT
    USING (get_user_role(auth.uid()) = 'admin');

-- RLS Policies for artifacts table
CREATE POLICY "Allow all authenticated users to read artifacts" ON public.artifacts
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow reporters/developers to create artifacts" ON public.artifacts
    FOR INSERT
    WITH CHECK (get_user_role(auth.uid()) IN ('reporter', 'developer', 'admin'));

CREATE POLICY "Allow admins to update any artifact" ON public.artifacts
    FOR UPDATE
    USING (get_user_role(auth.uid()) = 'admin')
    WITH CHECK (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Allow reporters/developers to update their own artifacts" ON public.artifacts
    FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Allow admins to delete artifacts" ON public.artifacts
    FOR DELETE
    USING (get_user_role(auth.uid()) = 'admin');

-- RLS Policies for bugs table
CREATE POLICY "Allow all authenticated users to read bugs" ON public.bugs
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow reporters/developers/admins to create bugs" ON public.bugs
    FOR INSERT
    WITH CHECK (get_user_role(auth.uid()) IN ('reporter', 'developer', 'admin'));

CREATE POLICY "Allow developers/admins to update bugs" ON public.bugs
    FOR UPDATE
    USING (get_user_role(auth.uid()) IN ('developer', 'admin'))
    WITH CHECK (get_user_role(auth.uid()) IN ('developer', 'admin'));

CREATE POLICY "Allow admins to delete bugs" ON public.bugs
    FOR DELETE
    USING (get_user_role(auth.uid()) = 'admin');

-- RLS Policies for bug_artifacts table
CREATE POLICY "Allow all authenticated users to read bug_artifacts" ON public.bug_artifacts
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow reporters/developers/admins to add relations" ON public.bug_artifacts
    FOR INSERT
    WITH CHECK (get_user_role(auth.uid()) IN ('reporter', 'developer', 'admin'));

CREATE POLICY "Allow admins to delete relations" ON public.bug_artifacts
    FOR DELETE
    USING (get_user_role(auth.uid()) = 'admin');

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_artifacts_updated_at BEFORE UPDATE ON public.artifacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bugs_updated_at BEFORE UPDATE ON public.bugs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to handle fixed_at based on status
CREATE OR REPLACE FUNCTION handle_bug_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status != 'resolved') THEN
        NEW.fixed_at = NOW();
    ELSIF NEW.status != 'resolved' AND OLD.status = 'resolved' THEN
        NEW.fixed_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER handle_bug_status_trigger BEFORE UPDATE ON public.bugs
    FOR EACH ROW EXECUTE FUNCTION handle_bug_status_change();

-- END: 001_initial_schema.sql

-- =====================================================================
-- BEGIN: 002_update_bug_statuses.sql
-- =====================================================================

-- Migrate bug status enum values to: open, in_progress, resolved.
-- This version is transaction-safe for Supabase SQL editor.

-- 1) Build a replacement enum type.
CREATE TYPE public.bug_status_new AS ENUM ('open', 'in_progress', 'resolved');

-- 2) Convert column to new enum and remap legacy values in one cast.
ALTER TABLE public.bugs
    ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.bugs
    ALTER COLUMN status TYPE public.bug_status_new
    USING (
        CASE status::text
            WHEN 'fixed' THEN 'resolved'
            WHEN 'closed' THEN 'resolved'
            ELSE status::text
        END
    )::public.bug_status_new;

-- 3) Swap types so application code continues using public.bug_status.
DROP TYPE public.bug_status;
ALTER TYPE public.bug_status_new RENAME TO bug_status;

ALTER TABLE public.bugs
    ALTER COLUMN status SET DEFAULT 'open';

-- 4) Ensure historical rows converted from fixed/closed have fixed_at set.
UPDATE public.bugs
SET fixed_at = NOW()
WHERE status = 'resolved' AND fixed_at IS NULL;

-- 5) Update trigger function to use resolved transitions.
CREATE OR REPLACE FUNCTION handle_bug_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status != 'resolved') THEN
        NEW.fixed_at = NOW();
    ELSIF NEW.status != 'resolved' AND OLD.status = 'resolved' THEN
        NEW.fixed_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- END: 002_update_bug_statuses.sql

-- =====================================================================
-- BEGIN: 003_add_bug_severity.sql
-- =====================================================================

-- Add severity support to bugs and allow all roles to update bugs via API workflows.

-- 1) Create enum for bug severity when it doesn't exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'bug_severity' AND n.nspname = 'public'
    ) THEN
        CREATE TYPE public.bug_severity AS ENUM ('low', 'medium', 'high', 'critical');
    END IF;
END
$$;

-- 2) Add severity column with default and backfill existing rows.
ALTER TABLE public.bugs
    ADD COLUMN IF NOT EXISTS severity public.bug_severity;

UPDATE public.bugs
SET severity = 'medium'
WHERE severity IS NULL;

ALTER TABLE public.bugs
    ALTER COLUMN severity SET DEFAULT 'medium',
    ALTER COLUMN severity SET NOT NULL;

-- 3) Let all platform roles update bugs (needed for severity quick actions).
DROP POLICY IF EXISTS "Allow developers/admins to update bugs" ON public.bugs;

CREATE POLICY "Allow reporters/developers/admins to update bugs" ON public.bugs
    FOR UPDATE
    USING (get_user_role(auth.uid()) IN ('reporter', 'developer', 'admin'))
    WITH CHECK (get_user_role(auth.uid()) IN ('reporter', 'developer', 'admin'));

-- END: 003_add_bug_severity.sql

-- =====================================================================
-- BEGIN: 004_add_user_dark_mode.sql
-- =====================================================================

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN DEFAULT FALSE NOT NULL;

-- END: 004_add_user_dark_mode.sql

-- =====================================================================
-- BEGIN: 005_add_projects_and_memberships.sql
-- =====================================================================

CREATE TYPE public.project_member_role AS ENUM ('owner', 'admin', 'developer', 'reporter');

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_members (
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role public.project_member_role NOT NULL DEFAULT 'reporter',
    added_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    PRIMARY KEY (project_id, user_id)
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage projects"
    ON public.projects
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role can manage project members"
    ON public.project_members
    USING (true)
    WITH CHECK (true);

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_members_updated_at BEFORE UPDATE ON public.project_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.bugs
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_bugs_project_id ON public.bugs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);

-- END: 005_add_projects_and_memberships.sql

-- =====================================================================
-- BEGIN: 006_invitations_project_covers_artifacts_scope.sql
-- =====================================================================

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

-- END: 006_invitations_project_covers_artifacts_scope.sql

-- =====================================================================
-- BEGIN: 007_fix_invitation_rls_and_guards.sql
-- =====================================================================

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

-- END: 007_fix_invitation_rls_and_guards.sql

-- =====================================================================
-- BEGIN: 008_add_project_member_invitations.sql
-- =====================================================================

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

-- END: 008_add_project_member_invitations.sql

-- =====================================================================
-- BEGIN: 009_store_artifact_files_in_db.sql
-- =====================================================================

ALTER TABLE public.artifacts
    ADD COLUMN IF NOT EXISTS file_data_base64 TEXT;

-- Keep file_path for legacy compatibility but clear it for newly migrated uploaded files.
UPDATE public.artifacts
SET file_path = NULL
WHERE is_uploaded_file = TRUE
  AND file_data_base64 IS NOT NULL;

-- END: 009_store_artifact_files_in_db.sql

-- =====================================================================
-- BEGIN: 010_store_project_covers_in_db.sql
-- =====================================================================

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS cover_image_data_base64 TEXT,
    ADD COLUMN IF NOT EXISTS cover_image_mime_type TEXT;

-- END: 010_store_project_covers_in_db.sql

-- =====================================================================
-- BEGIN: 011_add_project_phases.sql
-- =====================================================================

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

-- END: 011_add_project_phases.sql

-- =====================================================================
-- BEGIN: 011_remove_global_user_role.sql
-- =====================================================================

-- Global user roles are deprecated in favor of project-scoped roles.

DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Allow reporters/developers to create artifacts" ON public.artifacts;
DROP POLICY IF EXISTS "Allow admins to update any artifact" ON public.artifacts;
DROP POLICY IF EXISTS "Allow reporters/developers to update their own artifacts" ON public.artifacts;
DROP POLICY IF EXISTS "Allow admins to delete artifacts" ON public.artifacts;
DROP POLICY IF EXISTS "Allow reporters/developers/admins to create bugs" ON public.bugs;
DROP POLICY IF EXISTS "Allow developers/admins to update bugs" ON public.bugs;
DROP POLICY IF EXISTS "Allow reporters/developers/admins to update bugs" ON public.bugs;
DROP POLICY IF EXISTS "Allow admins to delete bugs" ON public.bugs;
DROP POLICY IF EXISTS "Allow reporters/developers/admins to add relations" ON public.bug_artifacts;
DROP POLICY IF EXISTS "Allow admins to delete relations" ON public.bug_artifacts;

DO $$
BEGIN
    DROP FUNCTION IF EXISTS public.get_user_role(UUID);
EXCEPTION
    WHEN dependent_objects_still_exist THEN
        DROP FUNCTION IF EXISTS public.get_user_role(UUID) CASCADE;
END;
$$;

ALTER TABLE public.users
    DROP COLUMN IF EXISTS role;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        DROP TYPE public.user_role;
    END IF;
END;
$$;

-- END: 011_remove_global_user_role.sql

-- =====================================================================
-- BEGIN: 012_add_bug_duplicate_links.sql
-- =====================================================================

-- Add duplicate bug linkage support.

ALTER TABLE public.bugs
    ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES public.bugs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bugs_project_duplicate_of ON public.bugs(project_id, duplicate_of);

-- END: 012_add_bug_duplicate_links.sql

