-- El rango mostrado en el catálogo siempre se deriva de los tipos de boleta activos.
CREATE OR REPLACE FUNCTION public.sincronizar_rango_precio_evento_desde_boletas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento_id bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_evento_id := OLD.evento_id;
  ELSE
    v_evento_id := NEW.evento_id;
  END IF;

  UPDATE public.eventos
  SET
    precio_minimo = (
      SELECT MIN(tb.precio)
      FROM public.tipos_boleta tb
      WHERE tb.evento_id = v_evento_id AND tb.activo IS TRUE
    ),
    precio_maximo = (
      SELECT MAX(tb.precio)
      FROM public.tipos_boleta tb
      WHERE tb.evento_id = v_evento_id AND tb.activo IS TRUE
    )
  WHERE id = v_evento_id;

  -- Si un tipo cambia de evento, recalcular también el evento anterior.
  IF TG_OP = 'UPDATE' AND OLD.evento_id IS DISTINCT FROM NEW.evento_id THEN
    UPDATE public.eventos
    SET
      precio_minimo = (
        SELECT MIN(tb.precio)
        FROM public.tipos_boleta tb
        WHERE tb.evento_id = OLD.evento_id AND tb.activo IS TRUE
      ),
      precio_maximo = (
        SELECT MAX(tb.precio)
        FROM public.tipos_boleta tb
        WHERE tb.evento_id = OLD.evento_id AND tb.activo IS TRUE
      )
    WHERE id = OLD.evento_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_rango_precio_evento ON public.tipos_boleta;
CREATE TRIGGER trg_sincronizar_rango_precio_evento
AFTER INSERT OR UPDATE OF precio, activo, evento_id OR DELETE
ON public.tipos_boleta
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_rango_precio_evento_desde_boletas();

-- Corrige los eventos existentes al aplicar la migración.
UPDATE public.eventos e
SET
  precio_minimo = r.precio_minimo,
  precio_maximo = r.precio_maximo
FROM (
  SELECT
    e2.id AS evento_id,
    MIN(tb.precio) FILTER (WHERE tb.activo IS TRUE) AS precio_minimo,
    MAX(tb.precio) FILTER (WHERE tb.activo IS TRUE) AS precio_maximo
  FROM public.eventos e2
  LEFT JOIN public.tipos_boleta tb ON tb.evento_id = e2.id
  GROUP BY e2.id
) r
WHERE e.id = r.evento_id;
