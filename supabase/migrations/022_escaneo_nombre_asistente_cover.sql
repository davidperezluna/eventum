-- Lector: nombre del titular/comprador al escanear cover por QR.

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
  v_titular public.usuarios%ROWTYPE;
  v_comprador public.usuarios%ROWTYPE;
  v_titular_id BIGINT;
  v_titular_nombre TEXT;
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
  IF v_titular_id IS NOT NULL THEN
    SELECT * INTO v_titular FROM public.usuarios WHERE id = v_titular_id;
  END IF;
  IF v_compra.cliente_id IS NOT NULL THEN
    SELECT * INTO v_comprador FROM public.usuarios WHERE id = v_compra.cliente_id;
  END IF;

  v_titular_nombre := trim(
    coalesce(nullif(trim(coalesce(v_titular.nombre, '') || ' ' || coalesce(v_titular.apellido, '')), ''), '')
  );

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
    'titular_nombre', nullif(v_titular_nombre, ''),
    'titular_documento', nullif(trim(coalesce(v_titular.documento_identidad, v_comprador.documento_identidad, '')), '')
  );
END;
$$;
