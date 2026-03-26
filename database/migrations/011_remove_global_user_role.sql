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
