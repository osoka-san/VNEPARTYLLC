CREATE TABLE public.motion_defaults (
  key text PRIMARY KEY CHECK (key = 'site'),
  schema_version integer NOT NULL CHECK (schema_version BETWEEN 1 AND 6),
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.motion_defaults TO anon, authenticated;
GRANT ALL ON public.motion_defaults TO service_role;

ALTER TABLE public.motion_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "motion defaults: public read"
ON public.motion_defaults
FOR SELECT
TO anon, authenticated
USING (key = 'site');