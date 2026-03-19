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
