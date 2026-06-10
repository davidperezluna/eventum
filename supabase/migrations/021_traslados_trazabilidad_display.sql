-- 021: Enriquecer listar_traslados_boleta_trazabilidad para la vista Actividad.

CREATE OR REPLACE FUNCTION public.listar_traslados_boleta_trazabilidad(
  p_cliente_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid BIGINT;
BEGIN
  v_uid := coalesce(p_cliente_id, public.fn_usuario_id_actual());
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sesión requerida'; END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.fecha_creacion DESC)
    FROM (
      SELECT
        tr.id,
        tr.boleta_id,
        tr.boleta_cover_id,
        tr.usuario_origen_id,
        tr.usuario_destino_id,
        tr.email_destino,
        tr.estado,
        tr.fecha_creacion,
        tr.fecha_recibido,
        tr.fecha_aceptacion,
        tr.fecha_rechazo,
        tr.fecha_cancelacion,
        coalesce(tb.evento_id, c.evento_id) AS evento_id,
        cc.lugar_id AS lugar_id,
        uo.email AS usuario_origen_email,
        uo.nombre AS usuario_origen_nombre,
        uo.apellido AS usuario_origen_apellido,
        ud.email AS usuario_destino_email,
        e.titulo AS evento_titulo,
        tb.nombre AS tipo_boleta_nombre,
        tc.nombre AS tipo_cover_nombre,
        coalesce(l_cover.nombre, cc_lugar.nombre) AS lugar_nombre,
        sc.fecha AS sesion_fecha
      FROM public.traslados_boleta tr
      LEFT JOIN public.boletas_compradas b ON b.id = tr.boleta_id
      LEFT JOIN public.compras c ON c.id = b.compra_id
      LEFT JOIN public.tipos_boleta tb ON tb.id = b.tipo_boleta_id
      LEFT JOIN public.eventos e ON e.id = coalesce(tb.evento_id, c.evento_id)
      LEFT JOIN public.boletas_cover bc ON bc.id = tr.boleta_cover_id
      LEFT JOIN public.compras_cover cc ON cc.id = bc.compra_cover_id
      LEFT JOIN public.tipos_cover tc ON tc.id = bc.tipo_cover_id
      LEFT JOIN public.sesiones_cover sc ON sc.id = bc.sesion_cover_id
      LEFT JOIN public.lugares l_cover ON l_cover.id = sc.lugar_id
      LEFT JOIN public.lugares cc_lugar ON cc_lugar.id = cc.lugar_id
      LEFT JOIN public.usuarios uo ON uo.id = tr.usuario_origen_id
      LEFT JOIN public.usuarios ud ON ud.id = tr.usuario_destino_id
      WHERE tr.usuario_origen_id = v_uid OR tr.usuario_destino_id = v_uid
      ORDER BY tr.fecha_creacion DESC
    ) t
  ), '[]'::jsonb);
END;
$$;

-- Resuelve emails de participantes cuando el cliente no puede leer la tabla usuarios (RLS).
CREATE OR REPLACE FUNCTION public.obtener_datos_usuarios_para_traslados(
  p_usuario_ids BIGINT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_usuario_ids IS NULL OR cardinality(p_usuario_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'nombre', u.nombre,
        'apellido', u.apellido
      )
      ORDER BY u.id
    )
    FROM public.usuarios u
    WHERE u.id = ANY(p_usuario_ids)
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_datos_usuarios_para_traslados(BIGINT[]) TO authenticated;
