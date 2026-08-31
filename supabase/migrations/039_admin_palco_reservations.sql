-- Permite reserva/liberación manual de palcos también a administradores (misma UI que organizador).

CREATE OR REPLACE FUNCTION public.reservar_palcos_organizador(
  p_evento_id BIGINT,
  p_palco_ids BIGINT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizador_id BIGINT;
  v_expected INTEGER;
  v_matching INTEGER;
  v_updated INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.eventos e WHERE e.id = p_evento_id) THEN
    RAISE EXCEPTION 'Evento no encontrado';
  END IF;

  IF public.fn_usuario_es_admin() THEN
    NULL;
  ELSE
    SELECT u.id INTO v_organizador_id
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.tipo_usuario_id = 2
      AND coalesce(u.activo, true) = true
    LIMIT 1;

    IF v_organizador_id IS NULL THEN
      RAISE EXCEPTION 'Acceso permitido únicamente a organizadores activos';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.eventos e
      WHERE e.id = p_evento_id AND e.organizador_id = v_organizador_id
    ) THEN
      RAISE EXCEPTION 'El evento no pertenece al organizador autenticado';
    END IF;
  END IF;

  SELECT count(DISTINCT id) INTO v_expected
  FROM unnest(coalesce(p_palco_ids, ARRAY[]::BIGINT[])) AS id
  WHERE id IS NOT NULL;

  IF v_expected = 0 THEN
    RAISE EXCEPTION 'Selecciona al menos un palco';
  END IF;

  SELECT count(*) INTO v_matching
  FROM public.palcos p
  JOIN public.tipos_boleta tb ON tb.id = p.tipo_boleta_id
  WHERE p.id = ANY(p_palco_ids)
    AND tb.evento_id = p_evento_id
    AND coalesce(tb.es_palco, false) = true;

  IF v_matching <> v_expected THEN
    RAISE EXCEPTION 'Uno o más palcos no pertenecen a este evento';
  END IF;

  UPDATE public.palcos p
  SET estado = 'reservado',
      compra_id = NULL,
      transaccion_checkout_id = NULL,
      fecha_actualizacion = now()
  FROM public.tipos_boleta tb
  WHERE p.tipo_boleta_id = tb.id
    AND tb.evento_id = p_evento_id
    AND p.id = ANY(p_palco_ids)
    AND p.estado = 'disponible'
    AND p.compra_id IS NULL
    AND p.transaccion_checkout_id IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'Uno o más palcos dejaron de estar disponibles';
  END IF;

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.liberar_palco_organizador(
  p_evento_id BIGINT,
  p_palco_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizador_id BIGINT;
  v_updated INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.eventos e WHERE e.id = p_evento_id) THEN
    RAISE EXCEPTION 'Evento no encontrado';
  END IF;

  IF public.fn_usuario_es_admin() THEN
    NULL;
  ELSE
    SELECT u.id INTO v_organizador_id
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.tipo_usuario_id = 2
      AND coalesce(u.activo, true) = true
    LIMIT 1;

    IF v_organizador_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.eventos e
      WHERE e.id = p_evento_id AND e.organizador_id = v_organizador_id
    ) THEN
      RAISE EXCEPTION 'No tienes permiso para gestionar este evento';
    END IF;
  END IF;

  UPDATE public.palcos p
  SET estado = 'disponible',
      compra_id = NULL,
      transaccion_checkout_id = NULL,
      fecha_actualizacion = now()
  FROM public.tipos_boleta tb
  WHERE p.tipo_boleta_id = tb.id
    AND tb.evento_id = p_evento_id
    AND p.id = p_palco_id
    AND p.estado = 'reservado'
    AND p.compra_id IS NULL
    AND p.transaccion_checkout_id IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Solo puedes liberar una reserva manual sin compra asociada';
  END IF;

  RETURN true;
END;
$$;
