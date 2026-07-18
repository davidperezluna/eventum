-- Administración operativa de covers:
-- 1) Corte de caja + historial por noche (servicio Eventum SOLO ventas app/online)
-- 2) Anular boleta cover (sin uso en puerta)
-- 3) Tablero puerta: quién está dentro + accesos recientes
-- 4) Notificar al cliente al asignar cover manual

-- ─── 1. Resumen / corte de caja de una noche ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.obtener_resumen_noche_cover(p_sesion_cover_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesion public.sesiones_cover%ROWTYPE;
  v_pct NUMERIC;
  v_ventas JSONB;
  v_resumen JSONB;
BEGIN
  IF p_sesion_cover_id IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT * INTO v_sesion FROM public.sesiones_cover WHERE id = p_sesion_cover_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  IF NOT public.fn_usuario_puede_configurar_lugar_cover(v_sesion.lugar_id) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  SELECT coalesce(l.covers_porcentaje_servicio, 0)
  INTO v_pct
  FROM public.lugares l
  WHERE l.id = v_sesion.lugar_id;

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.fecha_compra DESC, t.boleta_id DESC), '[]'::jsonb)
  INTO v_ventas
  FROM (
    SELECT
      bc.id AS boleta_id,
      bc.codigo_qr,
      bc.precio_unitario,
      bc.estado AS boleta_estado,
      bc.estado_acceso,
      bc.fecha_creacion,
      cc.id AS compra_id,
      cc.numero_transaccion,
      cc.fecha_compra,
      cc.total AS compra_total,
      cc.valor_servicio,
      cc.metodo_pago,
      coalesce(cc.origen_venta, 'online') AS origen_venta,
      cc.notas,
      cc.vendido_por_usuario_id,
      trim(both ' ' FROM coalesce(vend.nombre, '') || ' ' || coalesce(vend.apellido, '')) AS vendido_por_nombre,
      vend.email AS vendido_por_email,
      coalesce(bc.titular_cliente_id, cc.cliente_id) AS cliente_id,
      trim(both ' ' FROM coalesce(cli.nombre, '') || ' ' || coalesce(cli.apellido, '')) AS cliente_nombre,
      cli.email AS cliente_email,
      cli.documento_identidad AS cliente_documento,
      tc.nombre AS tipo_cover_nombre
    FROM public.boletas_cover bc
    JOIN public.compras_cover cc ON cc.id = bc.compra_cover_id
    JOIN public.tipos_cover tc ON tc.id = bc.tipo_cover_id
    LEFT JOIN public.usuarios cli ON cli.id = coalesce(bc.titular_cliente_id, cc.cliente_id)
    LEFT JOIN public.usuarios vend ON vend.id = cc.vendido_por_usuario_id
    WHERE bc.sesion_cover_id = p_sesion_cover_id
      AND cc.estado_pago = 'completado'
      AND cc.estado_compra = 'confirmada'
      AND bc.estado <> 'cancelada'
  ) t;

  SELECT jsonb_build_object(
    'sesion_cover_id', v_sesion.id,
    'fecha', v_sesion.fecha,
    'estado', v_sesion.estado,
    'aforo_maximo', v_sesion.aforo_maximo,
    'personas_dentro', v_sesion.personas_dentro,
    'cantidad_vendida', v_sesion.cantidad_vendida,
    'porcentaje_servicio_config', v_pct,
    'covers_activos', coalesce((
      SELECT count(*)::int FROM public.boletas_cover bc
      JOIN public.compras_cover cc ON cc.id = bc.compra_cover_id
      WHERE bc.sesion_cover_id = p_sesion_cover_id
        AND cc.estado_pago = 'completado'
        AND cc.estado_compra = 'confirmada'
        AND bc.estado <> 'cancelada'
    ), 0),
    -- Ventas app (online): Eventum cobra % servicio
    'app_covers', coalesce((
      SELECT count(*)::int FROM public.boletas_cover bc
      JOIN public.compras_cover cc ON cc.id = bc.compra_cover_id
      WHERE bc.sesion_cover_id = p_sesion_cover_id
        AND cc.estado_pago = 'completado' AND cc.estado_compra = 'confirmada'
        AND bc.estado <> 'cancelada'
        AND coalesce(cc.origen_venta, 'online') = 'online'
    ), 0),
    'app_ingresos', coalesce((
      SELECT sum(bc.precio_unitario)::numeric FROM public.boletas_cover bc
      JOIN public.compras_cover cc ON cc.id = bc.compra_cover_id
      WHERE bc.sesion_cover_id = p_sesion_cover_id
        AND cc.estado_pago = 'completado' AND cc.estado_compra = 'confirmada'
        AND bc.estado <> 'cancelada'
        AND coalesce(cc.origen_venta, 'online') = 'online'
    ), 0),
    'app_servicio_eventum', coalesce((
      SELECT sum(x.valor_servicio)::numeric
      FROM (
        SELECT DISTINCT cc.id, coalesce(cc.valor_servicio, 0) AS valor_servicio
        FROM public.compras_cover cc
        JOIN public.boletas_cover bc ON bc.compra_cover_id = cc.id
        WHERE bc.sesion_cover_id = p_sesion_cover_id
          AND cc.estado_pago = 'completado' AND cc.estado_compra = 'confirmada'
          AND bc.estado <> 'cancelada'
          AND coalesce(cc.origen_venta, 'online') = 'online'
      ) x
    ), 0),
    -- Ventas puerta/manual: sin comisión Eventum (modelo club compra cupos luego)
    'puerta_covers', coalesce((
      SELECT count(*)::int FROM public.boletas_cover bc
      JOIN public.compras_cover cc ON cc.id = bc.compra_cover_id
      WHERE bc.sesion_cover_id = p_sesion_cover_id
        AND cc.estado_pago = 'completado' AND cc.estado_compra = 'confirmada'
        AND bc.estado <> 'cancelada'
        AND coalesce(cc.origen_venta, 'online') = 'manual'
    ), 0),
    'puerta_ingresos', coalesce((
      SELECT sum(bc.precio_unitario)::numeric FROM public.boletas_cover bc
      JOIN public.compras_cover cc ON cc.id = bc.compra_cover_id
      WHERE bc.sesion_cover_id = p_sesion_cover_id
        AND cc.estado_pago = 'completado' AND cc.estado_compra = 'confirmada'
        AND bc.estado <> 'cancelada'
        AND coalesce(cc.origen_venta, 'online') = 'manual'
    ), 0),
    'puerta_por_metodo', coalesce((
      SELECT jsonb_object_agg(m.metodo, m.total)
      FROM (
        SELECT coalesce(cc.metodo_pago, 'otro') AS metodo, sum(bc.precio_unitario)::numeric AS total
        FROM public.boletas_cover bc
        JOIN public.compras_cover cc ON cc.id = bc.compra_cover_id
        WHERE bc.sesion_cover_id = p_sesion_cover_id
          AND cc.estado_pago = 'completado' AND cc.estado_compra = 'confirmada'
          AND bc.estado <> 'cancelada'
          AND coalesce(cc.origen_venta, 'online') = 'manual'
        GROUP BY coalesce(cc.metodo_pago, 'otro')
      ) m
    ), '{}'::jsonb),
    'cortesias', coalesce((
      SELECT count(*)::int FROM public.boletas_cover bc
      JOIN public.compras_cover cc ON cc.id = bc.compra_cover_id
      WHERE bc.sesion_cover_id = p_sesion_cover_id
        AND cc.estado_pago = 'completado' AND cc.estado_compra = 'confirmada'
        AND bc.estado <> 'cancelada'
        AND lower(coalesce(cc.metodo_pago, '')) = 'cortesia'
    ), 0)
  )
  INTO v_resumen;

  v_resumen := v_resumen || jsonb_build_object(
    'ingresos_totales',
      coalesce((v_resumen->>'app_ingresos')::numeric, 0)
      + coalesce((v_resumen->>'puerta_ingresos')::numeric, 0),
    'nota_servicio',
      'El % de servicio Eventum solo aplica a ventas por la app. Ventas en puerta no generan comisión.'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'resumen', v_resumen,
    'ventas', v_ventas
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_resumen_noche_cover(BIGINT) TO authenticated;

-- ─── 2. Anular boleta cover (sin entrada) ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.anular_boleta_cover(
  p_boleta_cover_id BIGINT,
  p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bc public.boletas_cover%ROWTYPE;
  v_compra public.compras_cover%ROWTYPE;
  v_sesion public.sesiones_cover%ROWTYPE;
  v_activas INT;
  v_now TIMESTAMPTZ := now();
  v_motivo TEXT := nullif(trim(coalesce(p_motivo, '')), '');
BEGIN
  IF p_boleta_cover_id IS NULL THEN
    RAISE EXCEPTION 'Boleta requerida';
  END IF;

  SELECT * INTO v_bc FROM public.boletas_cover WHERE id = p_boleta_cover_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Boleta no encontrada';
  END IF;

  SELECT * INTO v_compra FROM public.compras_cover WHERE id = v_bc.compra_cover_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra no encontrada';
  END IF;

  SELECT * INTO v_sesion FROM public.sesiones_cover WHERE id = v_bc.sesion_cover_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  IF NOT public.fn_usuario_puede_configurar_lugar_cover(v_sesion.lugar_id) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  IF v_bc.estado = 'cancelada' THEN
    RAISE EXCEPTION 'La boleta ya está anulada';
  END IF;

  IF v_bc.estado_acceso = 'dentro' THEN
    RAISE EXCEPTION 'No se puede anular: la persona está dentro del club';
  END IF;

  IF v_bc.entradas_count > 0 OR v_bc.estado_acceso IN ('fuera', 'consumida') THEN
    RAISE EXCEPTION 'No se puede anular: el cover ya fue usado en puerta';
  END IF;

  UPDATE public.boletas_cover
  SET
    estado = 'cancelada',
    fecha_actualizacion = v_now
  WHERE id = v_bc.id;

  UPDATE public.sesiones_cover
  SET
    cantidad_vendida = greatest(0, cantidad_vendida - 1),
    fecha_actualizacion = v_now
  WHERE id = v_sesion.id;

  SELECT count(*)::int INTO v_activas
  FROM public.boletas_cover
  WHERE compra_cover_id = v_compra.id
    AND estado <> 'cancelada';

  IF v_activas = 0 THEN
    UPDATE public.compras_cover
    SET
      estado_compra = 'cancelada',
      fecha_cancelacion = v_now,
      motivo_cancelacion = coalesce(v_motivo, 'Anulación de covers'),
      fecha_actualizacion = v_now
    WHERE id = v_compra.id;
  ELSE
    -- Recalcular total de compra restante (solo boletas activas)
    UPDATE public.compras_cover
    SET
      total = (
        SELECT coalesce(sum(bc.precio_unitario), 0)
        FROM public.boletas_cover bc
        WHERE bc.compra_cover_id = v_compra.id AND bc.estado <> 'cancelada'
      ),
      subtotal = (
        SELECT coalesce(sum(bc.precio_unitario), 0)
        FROM public.boletas_cover bc
        WHERE bc.compra_cover_id = v_compra.id AND bc.estado <> 'cancelada'
      ),
      fecha_actualizacion = v_now,
      notas = CASE
        WHEN v_motivo IS NOT NULL THEN
          trim(both E'\n' FROM coalesce(notas, '') || E'\nAnulación parcial: ' || v_motivo)
        ELSE notas
      END
    WHERE id = v_compra.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'boleta_cover_id', v_bc.id,
    'compra_cover_id', v_compra.id,
    'compra_cancelada', v_activas = 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.anular_boleta_cover(BIGINT, TEXT) TO authenticated;

-- ─── 3. Quién está dentro + accesos recientes ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.listar_dentro_sesion_cover(p_sesion_cover_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesion public.sesiones_cover%ROWTYPE;
BEGIN
  SELECT * INTO v_sesion FROM public.sesiones_cover WHERE id = p_sesion_cover_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión no encontrada'; END IF;

  IF NOT public.fn_usuario_puede_configurar_lugar_cover(v_sesion.lugar_id) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.ultima_entrada_at DESC NULLS LAST)
    FROM (
      SELECT
        bc.id AS boleta_id,
        bc.codigo_qr,
        bc.estado_acceso,
        bc.ultima_entrada_at,
        bc.entradas_count,
        coalesce(bc.titular_cliente_id, cc.cliente_id) AS cliente_id,
        trim(both ' ' FROM coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')) AS cliente_nombre,
        u.email AS cliente_email,
        u.documento_identidad AS cliente_documento,
        tc.nombre AS tipo_cover_nombre
      FROM public.boletas_cover bc
      JOIN public.compras_cover cc ON cc.id = bc.compra_cover_id
      JOIN public.tipos_cover tc ON tc.id = bc.tipo_cover_id
      LEFT JOIN public.usuarios u ON u.id = coalesce(bc.titular_cliente_id, cc.cliente_id)
      WHERE bc.sesion_cover_id = p_sesion_cover_id
        AND bc.estado_acceso = 'dentro'
        AND bc.estado <> 'cancelada'
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_accesos_sesion_cover(
  p_sesion_cover_id BIGINT,
  p_limite INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesion public.sesiones_cover%ROWTYPE;
  v_limite INT := least(200, greatest(1, coalesce(p_limite, 50)));
BEGIN
  SELECT * INTO v_sesion FROM public.sesiones_cover WHERE id = p_sesion_cover_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión no encontrada'; END IF;

  IF NOT public.fn_usuario_puede_configurar_lugar_cover(v_sesion.lugar_id) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.fecha_creacion DESC)
    FROM (
      SELECT
        ac.id,
        ac.tipo_movimiento,
        ac.fecha_creacion,
        ac.personas_dentro_despues,
        bc.codigo_qr,
        trim(both ' ' FROM coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')) AS cliente_nombre,
        u.documento_identidad AS cliente_documento
      FROM public.accesos_cover ac
      JOIN public.boletas_cover bc ON bc.id = ac.boleta_cover_id
      JOIN public.compras_cover cc ON cc.id = bc.compra_cover_id
      LEFT JOIN public.usuarios u ON u.id = coalesce(bc.titular_cliente_id, cc.cliente_id)
      WHERE ac.sesion_cover_id = p_sesion_cover_id
      ORDER BY ac.fecha_creacion DESC
      LIMIT v_limite
    ) t
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_dentro_sesion_cover(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_accesos_sesion_cover(BIGINT, INTEGER) TO authenticated;

-- ─── 4. Notificar al asignar cover manual ────────────────────────────────────
-- Se integra en vender_cover_manual (redefine con notificación).

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
  v_hoy DATE := public.fn_fecha_hoy_colombia();
  v_lugar_nombre TEXT;
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

  IF v_sesion.fecha <> v_hoy THEN
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

  SELECT l.nombre INTO v_lugar_nombre FROM public.lugares l WHERE l.id = v_sesion.lugar_id;

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

  -- Notificación al cliente (aparece en Mis compras / notificaciones)
  INSERT INTO public.notificaciones_usuario (
    usuario_id,
    tipo,
    titulo,
    mensaje,
    metadata
  ) VALUES (
    p_cliente_id,
    'cover_asignado_manual',
    'Te asignaron un cover',
    COALESCE(
      'Te asignaron ' || v_cantidad::text || ' cover(s) "' || coalesce(v_tipo.nombre, 'Cover') ||
      '" en "' || coalesce(v_lugar_nombre, 'Club') || '" para el ' ||
      to_char(v_sesion.fecha, 'DD/MM/YYYY') || '. Ya puedes verlo en Mis compras.',
      'Te asignaron un cover. Ya puedes verlo en Mis compras.'
    ),
    jsonb_build_object(
      'compra_cover_id', v_compra_id,
      'sesion_cover_id', v_sesion.id,
      'lugar_id', v_sesion.lugar_id,
      'lugar_nombre', v_lugar_nombre,
      'tipo_cover_nombre', v_tipo.nombre,
      'cantidad', v_cantidad,
      'metodo_pago', v_metodo,
      'numero_transaccion', v_numero
    )
  );

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
