-- 038: Consentimiento de tratamiento de datos personales (Ley 1581 / Colombia).
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS tratamiento_datos_aceptado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tratamiento_datos_fecha TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tratamiento_datos_version TEXT;

COMMENT ON COLUMN public.usuarios.tratamiento_datos_aceptado IS
  'Autorización expresa del titular para el tratamiento de datos personales.';
COMMENT ON COLUMN public.usuarios.tratamiento_datos_fecha IS
  'Fecha y hora (UTC) en que el titular otorgó o actualizó la autorización.';
COMMENT ON COLUMN public.usuarios.tratamiento_datos_version IS
  'Versión de la política/autorización aceptada (ej. col-2026-01).';
