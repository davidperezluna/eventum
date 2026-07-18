-- Precio público de covers: usar el del producto (tipos_cover), no el snapshot 0 de la sesión.

-- 1) Alinear sesiones futuras / abiertas con precio del tipo cuando el snapshot está en 0
UPDATE public.sesiones_cover sc
SET
  precio_cop = tc.precio_cop,
  fecha_actualizacion = now()
FROM public.tipos_cover tc
WHERE tc.id = sc.tipo_cover_id
  AND coalesce(sc.precio_cop, 0) = 0
  AND coalesce(tc.precio_cop, 0) > 0
  AND sc.estado IN ('programada', 'abierta')
  AND sc.fecha >= (now() AT TIME ZONE 'America/Bogota')::date;

-- 2) Catálogo público: precio vigente del producto
CREATE OR REPLACE FUNCTION public.obtener_lugar_cover(p_lugar_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lugar JSONB;
  v_tipos JSONB;
  v_sesiones JSONB;
BEGIN
  IF p_lugar_id IS NULL OR p_lugar_id <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT row_to_json(l)::jsonb
  INTO v_lugar
  FROM (
    SELECT
      l.id,
      l.nombre,
      l.direccion,
      l.ciudad,
      l.pais,
      l.capacidad_maxima,
      l.imagen_principal,
      l.descripcion,
      l.covers_descripcion,
      l.latitud,
      l.longitud,
      l.telefono,
      l.sitio_web,
      l.covers_porcentaje_servicio
    FROM public.lugares l
    WHERE l.id = p_lugar_id
      AND l.activo = true
      AND l.covers_habilitado = true
  ) l;

  IF v_lugar IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.orden, t.nombre), '[]'::jsonb)
  INTO v_tipos
  FROM (
    SELECT
      tc.id,
      tc.nombre,
      tc.descripcion,
      tc.precio_cop,
      tc.permite_reingreso,
      tc.limite_por_persona,
      tc.orden,
      tc.wompi_cuenta_id
    FROM public.tipos_cover tc
    WHERE tc.lugar_id = p_lugar_id
      AND tc.activo = true
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(s)::jsonb ORDER BY s.fecha, s.hora_apertura), '[]'::jsonb)
  INTO v_sesiones
  FROM (
    SELECT
      sc.id,
      sc.tipo_cover_id,
      tc.nombre AS tipo_cover_nombre,
      sc.fecha,
      sc.hora_apertura,
      sc.hora_cierre,
      coalesce(nullif(tc.precio_cop, 0), sc.precio_cop) AS precio_cop,
      sc.aforo_maximo,
      sc.personas_dentro,
      sc.cantidad_vendida,
      sc.cantidad_maxima_venta,
      sc.estado,
      tc.wompi_cuenta_id,
      greatest(0, sc.aforo_maximo - sc.personas_dentro) AS cupos_dentro_disponibles,
      CASE
        WHEN sc.cantidad_maxima_venta IS NULL THEN NULL
        ELSE greatest(0, sc.cantidad_maxima_venta - sc.cantidad_vendida)
      END AS cupos_venta_disponibles
    FROM public.sesiones_cover sc
    JOIN public.tipos_cover tc ON tc.id = sc.tipo_cover_id
    WHERE sc.lugar_id = p_lugar_id
      AND sc.fecha >= (now() AT TIME ZONE 'America/Bogota')::date
      AND sc.estado IN ('programada', 'abierta')
      AND tc.activo = true
  ) s;

  RETURN jsonb_build_object(
    'lugar', v_lugar,
    'tipos_cover', v_tipos,
    'sesiones', v_sesiones
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_lugar_cover(BIGINT) TO anon, authenticated;

-- 3) Listado de clubes: "desde" también desde el producto
CREATE OR REPLACE FUNCTION public.listar_lugares_con_covers(
  p_limite INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite INT;
  v_offset INT;
  v_result JSONB;
BEGIN
  v_limite := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      l.id,
      l.nombre,
      l.direccion,
      l.ciudad,
      l.pais,
      l.imagen_principal,
      l.capacidad_maxima,
      l.covers_descripcion,
      (
        SELECT count(*)::int
        FROM public.tipos_cover tc
        WHERE tc.lugar_id = l.id AND tc.activo = true
      ) AS tipos_cover_count,
      (
        SELECT min(sc.hora_apertura)
        FROM public.sesiones_cover sc
        WHERE sc.lugar_id = l.id
          AND sc.fecha = (now() AT TIME ZONE 'America/Bogota')::date
          AND sc.estado IN ('programada', 'abierta')
      ) AS cover_hoy_apertura,
      (
        SELECT min(coalesce(nullif(tc.precio_cop, 0), sc.precio_cop))
        FROM public.sesiones_cover sc
        JOIN public.tipos_cover tc ON tc.id = sc.tipo_cover_id AND tc.activo = true
        WHERE sc.lugar_id = l.id
          AND sc.fecha >= (now() AT TIME ZONE 'America/Bogota')::date
          AND sc.estado IN ('programada', 'abierta')
      ) AS precio_desde_cop
    FROM public.lugares l
    WHERE l.activo = true
      AND l.covers_habilitado = true
      AND EXISTS (
        SELECT 1 FROM public.tipos_cover tc
        WHERE tc.lugar_id = l.id AND tc.activo = true
      )
    ORDER BY l.nombre
    LIMIT v_limite OFFSET v_offset
  ) t;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_lugares_con_covers(INT, INT) TO anon, authenticated;
