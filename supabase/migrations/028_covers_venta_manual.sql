-- Venta / asignación manual de covers (fuera de Wompi).
-- Admin u organizador responsable: cobra como quiera y asigna a usuario registrado.

ALTER TABLE public.compras_cover
  ADD COLUMN IF NOT EXISTS vendido_por_usuario_id BIGINT
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.compras_cover
  ADD COLUMN IF NOT EXISTS origen_venta TEXT
    CHECK (origen_venta IS NULL OR origen_venta IN ('online', 'manual'));

ALTER TABLE public.compras_cover
  ADD COLUMN IF NOT EXISTS notas TEXT;

COMMENT ON COLUMN public.compras_cover.vendido_por_usuario_id IS
  'Usuario (admin/organizador) que registró la venta manual.';
COMMENT ON COLUMN public.compras_cover.origen_venta IS
  'online = checkout Wompi; manual = venta en puerta / asignación.';

CREATE OR REPLACE FUNCTION public.vender_cover_manual(
  p_sesion_cover_id BIGINT,
  p_cliente_id BIGINT,
  p_cantidad INTEGER DEFAULT 1,
  p_metodo_pago TEXT DEFAULT 'efectivo',
  p_notas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesion public.sesiones_cover%ROWTYPE;
  v_cliente public.usuarios%ROWTYPE;
  v_tipo public.tipos_cover%ROWTYPE;
  v_vendedor_id BIGINT := public.fn_usuario_id_actual();
  v_metodo TEXT;
  v_cantidad INT;
  v_precio NUMERIC;
  v_subtotal NUMERIC;
  v_descuento NUMERIC;
  v_total NUMERIC;
  v_compra_id BIGINT;
  v_numero TEXT;
  v_i INT;
  v_bc public.boletas_cover%ROWTYPE;
  v_boletas JSONB := '[]'::jsonb;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF v_vendedor_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  IF p_sesion_cover_id IS NULL OR p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Sesión y cliente son requeridos';
  END IF;

  v_cantidad := greatest(1, coalesce(p_cantidad, 1));
  IF v_cantidad > 20 THEN
    RAISE EXCEPTION 'Máximo 20 covers por venta manual';
  END IF;

  v_metodo := lower(trim(coalesce(p_metodo_pago, 'efectivo')));
  IF v_metodo NOT IN ('efectivo', 'transferencia', 'tarjeta', 'cortesia') THEN
    RAISE EXCEPTION 'Método de pago inválido. Usa: efectivo, transferencia, tarjeta o cortesia';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_cover
  WHERE id = p_sesion_cover_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  IF NOT public.fn_usuario_puede_configurar_lugar_cover(v_sesion.lugar_id) THEN
    RAISE EXCEPTION 'Sin permiso para vender covers en este lugar';
  END IF;

  IF v_sesion.estado NOT IN ('programada', 'abierta') THEN
    RAISE EXCEPTION 'La sesión no está disponible para venta (estado: %)', v_sesion.estado;
  END IF;

  -- Solo el día de la noche (fecha Colombia, no UTC del servidor).
  IF v_sesion.fecha <> (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'Solo puedes vender/asignar covers el día de la noche (%).',
      to_char(v_sesion.fecha, 'DD/MM/YYYY');
  END IF;

  SELECT * INTO v_cliente FROM public.usuarios WHERE id = p_cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado. Debe estar registrado en Eventum.';
  END IF;

  IF coalesce(v_cliente.activo, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'El usuario está inactivo';
  END IF;

  SELECT * INTO v_tipo FROM public.tipos_cover WHERE id = v_sesion.tipo_cover_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto de cover no encontrado';
  END IF;

  IF v_sesion.cantidad_maxima_venta IS NOT NULL
     AND v_sesion.cantidad_vendida + v_cantidad > v_sesion.cantidad_maxima_venta THEN
    RAISE EXCEPTION 'Cupo de venta agotado (% disponibles)',
      greatest(0, v_sesion.cantidad_maxima_venta - v_sesion.cantidad_vendida);
  END IF;

  IF v_sesion.personas_dentro + v_cantidad > v_sesion.aforo_maximo THEN
    RAISE EXCEPTION 'Aforo insuficiente (% cupos)',
      greatest(0, v_sesion.aforo_maximo - v_sesion.personas_dentro);
  END IF;

  v_precio := coalesce(v_tipo.precio_cop, v_sesion.precio_cop, 0);
  v_subtotal := v_precio * v_cantidad;

  IF v_metodo = 'cortesia' THEN
    v_descuento := v_subtotal;
    v_total := 0;
  ELSE
    v_descuento := 0;
    v_total := v_subtotal;
  END IF;

  v_numero := 'CMAN-' || to_char(v_now, 'YYYYMMDDHH24MISS') || '-' || floor(random() * 10000)::text;

  INSERT INTO public.compras_cover (
    cliente_id,
    lugar_id,
    numero_transaccion,
    subtotal,
    descuento_total,
    porcentaje_servicio,
    valor_servicio,
    total,
    estado_pago,
    estado_compra,
    metodo_pago,
    origen_venta,
    vendido_por_usuario_id,
    notas,
    fecha_confirmacion
  ) VALUES (
    p_cliente_id,
    v_sesion.lugar_id,
    v_numero,
    v_subtotal,
    v_descuento,
    0,
    0,
    v_total,
    'completado',
    'confirmada',
    v_metodo,
    'manual',
    v_vendedor_id,
    nullif(trim(coalesce(p_notas, '')), ''),
    v_now
  )
  RETURNING id INTO v_compra_id;

  FOR v_i IN 1..v_cantidad LOOP
    INSERT INTO public.boletas_cover (
      compra_cover_id,
      sesion_cover_id,
      tipo_cover_id,
      codigo_qr,
      precio_unitario,
      estado,
      estado_acceso,
      titular_cliente_id
    ) VALUES (
      v_compra_id,
      v_sesion.id,
      v_sesion.tipo_cover_id,
      public.fn_generar_codigo_qr_cover(),
      CASE WHEN v_metodo = 'cortesia' THEN 0 ELSE v_precio END,
      'activa',
      'pendiente',
      p_cliente_id
    )
    RETURNING * INTO v_bc;

    v_boletas := v_boletas || jsonb_build_array(jsonb_build_object(
      'id', v_bc.id,
      'codigo_qr', v_bc.codigo_qr,
      'sesion_cover_id', v_bc.sesion_cover_id
    ));
  END LOOP;

  UPDATE public.sesiones_cover
  SET
    cantidad_vendida = cantidad_vendida + v_cantidad,
    fecha_actualizacion = v_now
  WHERE id = v_sesion.id;

  RETURN jsonb_build_object(
    'ok', true,
    'compra_cover_id', v_compra_id,
    'numero_transaccion', v_numero,
    'metodo_pago', v_metodo,
    'total', v_total,
    'cantidad', v_cantidad,
    'cliente_id', p_cliente_id,
    'boletas_cover', v_boletas
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.vender_cover_manual(
  BIGINT, BIGINT, INTEGER, TEXT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.vender_cover_manual IS
  'Venta/asignación manual de covers el día de la noche. Admin u organizador responsable. Sin Wompi.';

-- Búsqueda acotada de usuarios registrados (admin u organizador).
CREATE OR REPLACE FUNCTION public.buscar_usuarios_para_venta_cover(
  p_q TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q TEXT := trim(coalesce(p_q, ''));
  v_limit INT := least(50, greatest(1, coalesce(p_limit, 20)));
BEGIN
  IF NOT (public.fn_usuario_es_admin() OR public.fn_usuario_es_organizador()) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  IF length(v_q) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(row_to_json(u)::jsonb ORDER BY u.email)
      FROM (
        SELECT
          us.id,
          us.nombre,
          us.apellido,
          us.email,
          us.documento_identidad,
          us.activo
        FROM public.usuarios us
        WHERE coalesce(us.activo, true) = true
          AND (
            us.email ILIKE '%' || v_q || '%'
            OR coalesce(us.nombre, '') ILIKE '%' || v_q || '%'
            OR coalesce(us.apellido, '') ILIKE '%' || v_q || '%'
            OR coalesce(us.documento_identidad, '') ILIKE '%' || v_q || '%'
          )
        ORDER BY us.email
        LIMIT v_limit
      ) u
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_usuarios_para_venta_cover(TEXT, INTEGER)
  TO authenticated;
