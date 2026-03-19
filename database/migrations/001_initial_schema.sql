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
