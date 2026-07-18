-- Solo se puede abrir una sesión cover el mismo día de la fecha de la sesión.

CREATE OR REPLACE FUNCTION public.cambiar_estado_sesion_cover(
  p_sesion_id BIGINT,
  p_estado TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesion public.sesiones_cover%ROWTYPE;
BEGIN
  IF p_estado NOT IN ('programada', 'abierta', 'cerrada', 'cancelada') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;

  SELECT * INTO v_sesion FROM public.sesiones_cover WHERE id = p_sesion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  IF NOT public.fn_usuario_puede_gestionar_cover(v_sesion.organizador_id) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  IF p_estado = 'abierta' AND v_sesion.fecha <> (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'Solo puedes abrir la noche el mismo día (%).', to_char(v_sesion.fecha, 'DD/MM/YYYY');
  END IF;

  UPDATE public.sesiones_cover
  SET estado = p_estado, fecha_actualizacion = now()
  WHERE id = p_sesion_id
  RETURNING * INTO v_sesion;

  IF p_estado = 'cerrada' THEN
    UPDATE public.boletas_cover bc
    SET
      estado_acceso = 'consumida',
      fecha_actualizacion = now()
    WHERE bc.sesion_cover_id = p_sesion_id
      AND bc.estado_acceso IN ('pendiente', 'fuera');
  END IF;

  RETURN row_to_json(v_sesion)::jsonb;
END;
$$;
