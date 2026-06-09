-- Incluye covers_porcentaje_servicio en obtener_config_cover_lugar (faltaba en el SELECT del lugar).

CREATE OR REPLACE FUNCTION public.obtener_config_cover_lugar(p_lugar_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lugar JSONB;
  v_tipos JSONB;
  v_plantillas JSONB;
  v_sesiones JSONB;
BEGIN
  IF p_lugar_id IS NULL OR p_lugar_id <= 0 THEN
    RETURN NULL;
  END IF;

  IF NOT public.fn_usuario_puede_configurar_lugar_cover(p_lugar_id) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  SELECT row_to_json(l)::jsonb INTO v_lugar
  FROM (
    SELECT
      l.id,
      l.nombre,
      l.direccion,
      l.ciudad,
      l.capacidad_maxima,
      l.covers_habilitado,
      l.covers_descripcion,
      l.covers_porcentaje_servicio,
      l.activo
    FROM public.lugares l
    WHERE l.id = p_lugar_id
  ) l;

  IF v_lugar IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.orden, t.nombre), '[]'::jsonb)
  INTO v_tipos
  FROM (
    SELECT tc.*
    FROM public.tipos_cover tc
    WHERE tc.lugar_id = p_lugar_id
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(p)::jsonb ORDER BY p.dia_semana, p.hora_apertura), '[]'::jsonb)
  INTO v_plantillas
  FROM (
    SELECT
      pl.*,
      tc.nombre AS tipo_cover_nombre
    FROM public.plantillas_cover pl
    JOIN public.tipos_cover tc ON tc.id = pl.tipo_cover_id
    WHERE pl.lugar_id = p_lugar_id
  ) p;

  SELECT coalesce(jsonb_agg(row_to_json(s)::jsonb ORDER BY s.fecha DESC, s.hora_apertura), '[]'::jsonb)
  INTO v_sesiones
  FROM (
    SELECT
      sc.*,
      tc.nombre AS tipo_cover_nombre
    FROM public.sesiones_cover sc
    JOIN public.tipos_cover tc ON tc.id = sc.tipo_cover_id
    WHERE sc.lugar_id = p_lugar_id
      AND sc.fecha >= current_date - 7
  ) s;

  RETURN jsonb_build_object(
    'lugar', v_lugar,
    'tipos_cover', v_tipos,
    'plantillas_cover', v_plantillas,
    'sesiones_cover', v_sesiones
  );
END;
$$;
