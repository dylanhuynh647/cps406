ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS cover_image_data_base64 TEXT,
    ADD COLUMN IF NOT EXISTS cover_image_mime_type TEXT;
