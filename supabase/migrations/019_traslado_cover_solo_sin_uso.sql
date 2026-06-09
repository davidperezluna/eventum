-- No permitir transferir un cover que ya registró acceso en puerta.

CREATE OR REPLACE FUNCTION public.iniciar_traslado_boleta_cover(
  p_boleta_cover_id BIGINT,
  p_email_destino TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid BIGINT;
  v_bc public.boletas_cover%ROWTYPE;
  v_compra public.compras_cover%ROWTYPE;
  v_destino_id BIGINT;
  v_traslado_id BIGINT;
  v_email TEXT;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión requerida');
  END IF;

  v_email := lower(trim(coalesce(p_email_destino, '')));
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email requerido');
  END IF;

  SELECT * INTO v_bc FROM public.boletas_cover WHERE id = p_boleta_cover_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Entrada cover no encontrada');
  END IF;

  SELECT * INTO v_compra FROM public.compras_cover WHERE id = v_bc.compra_cover_id;
  IF v_compra.estado_pago IS DISTINCT FROM 'completado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El pago de la compra no está confirmado');
  END IF;

  IF coalesce(v_bc.titular_cliente_id, v_compra.cliente_id) IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No eres titular de esta entrada');
  END IF;

  IF v_bc.estado IN ('consumida', 'cancelada') OR v_bc.estado_acceso = 'consumida' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta entrada ya no se puede transferir');
  END IF;

  IF v_bc.estado_acceso IS DISTINCT FROM 'pendiente'
     OR coalesce(v_bc.entradas_count, 0) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Esta entrada ya fue utilizada en puerta y no se puede transferir'
    );
  END IF;

  IF public.fn_traslado_cover_activo(v_bc.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya hay un traslado pendiente para esta entrada');
  END IF;

  SELECT u.id INTO v_destino_id
  FROM public.usuarios u
  WHERE lower(u.email) = v_email AND u.activo = true
  LIMIT 1;

  IF v_destino_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hay usuario registrado con ese correo');
  END IF;

  IF v_destino_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes enviarte la entrada a ti mismo');
  END IF;

  IF nullif(trim(coalesce((SELECT documento_identidad FROM public.usuarios WHERE id = v_destino_id), '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El destinatario debe tener documento en Mi perfil');
  END IF;

  INSERT INTO public.traslados_boleta (
    boleta_cover_id, usuario_origen_id, usuario_destino_id, email_destino, estado
  ) VALUES (
    v_bc.id, v_uid, v_destino_id, v_email, 'enviado'
  )
  RETURNING id INTO v_traslado_id;

  RETURN jsonb_build_object('ok', true, 'traslado_id', v_traslado_id);
END;
$$;
