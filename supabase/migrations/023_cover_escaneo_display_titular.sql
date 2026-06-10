-- Lector cover: nombre visible del titular (nombre/apellido o email) al escanear QR.

CREATE OR REPLACE FUNCTION public.fn_display_nombre_usuario(p_usuario_id BIGINT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nullif(
    trim(
      coalesce(
        nullif(trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')), ''),
        nullif(trim(coalesce(u.email, '')), '')
      )
    ),
    ''
  )
  FROM public.usuarios u
  WHERE u.id = p_usuario_id;
$$;

CREATE OR REPLACE FUNCTION public.obtener_display_titular_cover_boleta(p_boleta_cover_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bc public.boletas_cover%ROWTYPE;
  v_compra public.compras_cover%ROWTYPE;
  v_titular_id BIGINT;
  v_nombre TEXT;
BEGIN
  IF p_boleta_cover_id IS NULL OR p_boleta_cover_id <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_bc FROM public.boletas_cover WHERE id = p_boleta_cover_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_compra FROM public.compras_cover WHERE id = v_bc.compra_cover_id;
  v_titular_id := coalesce(v_bc.titular_cliente_id, v_compra.cliente_id);

  IF v_titular_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_nombre := public.fn_display_nombre_usuario(v_titular_id);
  RETURN v_nombre;
END;
$$;

CREATE OR REPLACE FUNCTION public.buscar_boleta_cover_para_escaneo(p_codigo_qr TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid BIGINT;
  v_bc public.boletas_cover%ROWTYPE;
  v_compra public.compras_cover%ROWTYPE;
  v_sesion public.sesiones_cover%ROWTYPE;
  v_tipo public.tipos_cover%ROWTYPE;
  v_lugar public.lugares%ROWTYPE;
  v_titular_id BIGINT;
  v_titular_nombre TEXT;
  v_titular_documento TEXT;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF nullif(trim(p_codigo_qr), '') IS NULL THEN
    RAISE EXCEPTION 'codigo_qr requerido';
  END IF;

  SELECT * INTO v_bc FROM public.boletas_cover WHERE codigo_qr = trim(p_codigo_qr);
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_compra FROM public.compras_cover WHERE id = v_bc.compra_cover_id;
  SELECT * INTO v_sesion FROM public.sesiones_cover WHERE id = v_bc.sesion_cover_id;
  SELECT * INTO v_tipo FROM public.tipos_cover WHERE id = v_bc.tipo_cover_id;
  SELECT * INTO v_lugar FROM public.lugares WHERE id = v_sesion.lugar_id;

  IF NOT public.fn_lector_puede_escanear_cover(v_uid, v_sesion.lugar_id, v_bc.tipo_cover_id) THEN
    RAISE EXCEPTION 'Sin permiso de lector para este cover';
  END IF;

  v_titular_id := coalesce(v_bc.titular_cliente_id, v_compra.cliente_id);
  v_titular_nombre := public.fn_display_nombre_usuario(v_titular_id);

  SELECT nullif(trim(coalesce(u.documento_identidad, '')), '')
    INTO v_titular_documento
  FROM public.usuarios u
  WHERE u.id = v_titular_id;

  IF v_titular_documento IS NULL AND v_compra.cliente_id IS DISTINCT FROM v_titular_id THEN
    SELECT nullif(trim(coalesce(u.documento_identidad, '')), '')
      INTO v_titular_documento
    FROM public.usuarios u
    WHERE u.id = v_compra.cliente_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_bc.id,
    'codigo_qr', v_bc.codigo_qr,
    'estado_acceso', v_bc.estado_acceso,
    'entradas_count', v_bc.entradas_count,
    'salidas_count', v_bc.salidas_count,
    'sesion_cover_id', v_bc.sesion_cover_id,
    'tipo_cover_id', v_bc.tipo_cover_id,
    'lugar_id', v_sesion.lugar_id,
    'lugar_nombre', v_lugar.nombre,
    'tipo_cover_nombre', v_tipo.nombre,
    'permite_reingreso', coalesce(v_tipo.permite_reingreso, true),
    'sesion_fecha', v_sesion.fecha,
    'hora_apertura', v_sesion.hora_apertura,
    'hora_cierre', v_sesion.hora_cierre,
    'estado_pago', v_compra.estado_pago,
    'estado_compra', v_compra.estado_compra,
    'personas_dentro', v_sesion.personas_dentro,
    'aforo_maximo', v_sesion.aforo_maximo,
    'titular_cliente_id', v_titular_id,
    'titular_nombre', v_titular_nombre,
    'titular_documento', v_titular_documento
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_display_nombre_usuario(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_display_titular_cover_boleta(BIGINT) TO authenticated;
