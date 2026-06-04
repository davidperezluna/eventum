-- ============================================================
-- Fix: permitir permisos de productos en lector_evento_tipo_boleta
-- usando tipo_boleta_id = NULL sin romper validación de boletas.
-- ============================================================

ALTER TABLE public.lector_evento_tipo_boleta
  ALTER COLUMN tipo_boleta_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_letb_usuario_evento_tipo_boleta
  ON public.lector_evento_tipo_boleta(usuario_id, evento_id, tipo_boleta_id)
  WHERE tipo_boleta_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_letb_usuario_evento_productos
  ON public.lector_evento_tipo_boleta(usuario_id, evento_id)
  WHERE tipo_boleta_id IS NULL;

CREATE OR REPLACE FUNCTION public.validate_lector_evento_tipo_boleta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_evento_tipo BIGINT;
BEGIN
  IF NEW.tipo_boleta_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tb.evento_id
  INTO v_evento_tipo
  FROM public.tipos_boleta tb
  WHERE tb.id = NEW.tipo_boleta_id;

  IF v_evento_tipo IS NULL THEN
    RAISE EXCEPTION 'El tipo de boleta seleccionado no existe.';
  END IF;

  IF v_evento_tipo <> NEW.evento_id THEN
    RAISE EXCEPTION 'El tipo de boleta debe pertenecer al evento seleccionado.';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.lector_evento_tipo_boleta'::regclass
      AND NOT t.tgisinternal
      AND (
        t.tgname ILIKE '%valid%'
        OR t.tgname ILIKE '%tipo_boleta%'
        OR pg_get_functiondef(p.oid) ILIKE '%El tipo de boleta%'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.lector_evento_tipo_boleta', r.tgname);
  END LOOP;
END;
$$;

CREATE TRIGGER trg_validate_lector_evento_tipo_boleta
BEFORE INSERT OR UPDATE OF evento_id, tipo_boleta_id
ON public.lector_evento_tipo_boleta
FOR EACH ROW
EXECUTE FUNCTION public.validate_lector_evento_tipo_boleta();
