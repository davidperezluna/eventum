-- Permite al lector autorizado registrar la devolución de una boleta
-- únicamente cuando el evento está cancelado y la boleta sigue pendiente.
CREATE OR REPLACE FUNCTION public.marcar_boleta_devolucion_evento_cancelado(p_boleta_id BIGINT)
RETURNS public.boletas_compradas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_boleta public.boletas_compradas;
BEGIN
  IF public.fn_usuario_id_actual() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT b.*
    INTO v_boleta
  FROM public.boletas_compradas b
  JOIN public.tipos_boleta tb ON tb.id = b.tipo_boleta_id
  JOIN public.eventos e ON e.id = tb.evento_id
  WHERE b.id = p_boleta_id
    AND e.estado = 'cancelado'
    AND b.estado = 'pendiente'
    AND (
      public.fn_usuario_es_admin()
      OR EXISTS (
        SELECT 1
        FROM public.lector_evento_tipo_boleta letb
        WHERE letb.usuario_id = public.fn_usuario_id_actual()
          AND letb.evento_id = tb.evento_id
          AND (letb.tipo_boleta_id IS NULL OR letb.tipo_boleta_id = b.tipo_boleta_id)
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Boleta no encontrada, ya procesada o sin permiso para este evento';
  END IF;

  UPDATE public.boletas_compradas
  SET estado = 'usada',
      fecha_uso = COALESCE(fecha_uso, localtimestamp),
      validado_por_usuario_id = public.fn_usuario_id_actual()
  WHERE id = p_boleta_id
  RETURNING * INTO v_boleta;

  RETURN v_boleta;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_boleta_devolucion_evento_cancelado(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_boleta_devolucion_evento_cancelado(BIGINT) TO authenticated;
