ALTER TABLE public.artifacts
    ADD COLUMN IF NOT EXISTS file_data_base64 TEXT;

-- Keep file_path for legacy compatibility but clear it for newly migrated uploaded files.
UPDATE public.artifacts
SET file_path = NULL
WHERE is_uploaded_file = TRUE
  AND file_data_base64 IS NOT NULL;
