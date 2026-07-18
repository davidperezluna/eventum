-- Organizador solo gestiona lugares donde ya es covers_organizador_id.
-- Ya no puede reclamar lugares libres; el admin asigna el responsable.

CREATE OR REPLACE FUNCTION public.fn_usuario_puede_configurar_lugar_cover(p_lugar_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.fn_usuario_es_admin()
    OR (
      public.fn_usuario_es_organizador()
      AND p_lugar_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.lugares l
          WHERE l.id = p_lugar_id
            AND l.covers_organizador_id = public.fn_usuario_id_actual()
        )
        OR EXISTS (
          SELECT 1 FROM public.tipos_cover tc
          WHERE tc.lugar_id = p_lugar_id
            AND tc.organizador_id = public.fn_usuario_id_actual()
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.configurar_lugar_cover(
  p_lugar_id BIGINT,
  p_covers_habilitado BOOLEAN DEFAULT true,
  p_covers_descripcion TEXT DEFAULT NULL,
  p_covers_porcentaje_servicio NUMERIC DEFAULT NULL,
  p_covers_organizador_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.lugares%ROWTYPE;
  v_uid BIGINT;
  v_nuevo_org BIGINT;
  v_org_ok BOOLEAN;
BEGIN
  IF p_lugar_id IS NULL OR p_lugar_id <= 0 THEN
    RAISE EXCEPTION 'lugar_id requerido';
  END IF;

  v_uid := public.fn_usuario_id_actual();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF NOT public.fn_usuario_puede_configurar_lugar_cover(p_lugar_id) THEN
    RAISE EXCEPTION 'Sin permiso para configurar covers en este lugar';
  END IF;

  SELECT * INTO v_row FROM public.lugares WHERE id = p_lugar_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lugar no encontrado';
  END IF;

  v_nuevo_org := v_row.covers_organizador_id;

  -- Solo admin asigna / cambia responsable.
  IF public.fn_usuario_es_admin() AND p_covers_organizador_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = p_covers_organizador_id
        AND u.tipo_usuario_id = 2
        AND u.activo = true
    ) INTO v_org_ok;
    IF NOT v_org_ok THEN
      RAISE EXCEPTION 'El responsable debe ser un organizador activo';
    END IF;
    v_nuevo_org := p_covers_organizador_id;
  END IF;

  UPDATE public.lugares
  SET
    covers_habilitado = coalesce(p_covers_habilitado, covers_habilitado),
    covers_descripcion = CASE
      WHEN p_covers_descripcion IS NULL THEN covers_descripcion
      ELSE nullif(trim(p_covers_descripcion), '')
    END,
    covers_porcentaje_servicio = CASE
      WHEN p_covers_porcentaje_servicio IS NULL THEN covers_porcentaje_servicio
      ELSE least(100, greatest(0, p_covers_porcentaje_servicio))
    END,
    covers_organizador_id = v_nuevo_org
  WHERE id = p_lugar_id
  RETURNING * INTO v_row;

  IF v_nuevo_org IS NOT NULL THEN
    UPDATE public.tipos_cover
    SET
      organizador_id = v_nuevo_org,
      fecha_actualizacion = now()
    WHERE lugar_id = p_lugar_id
      AND organizador_id IS DISTINCT FROM v_nuevo_org;

    UPDATE public.sesiones_cover
    SET
      organizador_id = v_nuevo_org,
      fecha_actualizacion = now()
    WHERE lugar_id = p_lugar_id
      AND organizador_id IS DISTINCT FROM v_nuevo_org;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'lugar_id', v_row.id,
    'covers_habilitado', v_row.covers_habilitado,
    'covers_descripcion', v_row.covers_descripcion,
    'covers_porcentaje_servicio', v_row.covers_porcentaje_servicio,
    'covers_organizador_id', v_row.covers_organizador_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_tipo_cover(
  p_id BIGINT DEFAULT NULL,
  p_lugar_id BIGINT DEFAULT NULL,
  p_nombre TEXT DEFAULT NULL,
  p_descripcion TEXT DEFAULT NULL,
  p_precio_cop BIGINT DEFAULT NULL,
  p_permite_reingreso BOOLEAN DEFAULT true,
  p_limite_por_persona INTEGER DEFAULT NULL,
  p_orden INTEGER DEFAULT 0,
  p_activo BOOLEAN DEFAULT true,
  p_wompi_cuenta_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid BIGINT;
  v_org_id BIGINT;
  v_row public.tipos_cover%ROWTYPE;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_id IS NULL THEN
    IF p_lugar_id IS NULL OR p_nombre IS NULL OR p_precio_cop IS NULL THEN
      RAISE EXCEPTION 'lugar_id, nombre y precio_cop son requeridos';
    END IF;

    IF NOT public.fn_usuario_puede_configurar_lugar_cover(p_lugar_id) THEN
      RAISE EXCEPTION 'Sin permiso para crear tipos cover';
    END IF;

    SELECT l.covers_organizador_id INTO v_org_id
    FROM public.lugares l
    WHERE l.id = p_lugar_id;

    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Asigna un responsable (organizador) antes de crear tipos de cover';
    END IF;

    IF NOT public.fn_usuario_puede_gestionar_cover(v_org_id) THEN
      RAISE EXCEPTION 'Sin permiso para crear tipos cover';
    END IF;

    INSERT INTO public.tipos_cover (
      lugar_id, organizador_id, nombre, descripcion, precio_cop,
      permite_reingreso, limite_por_persona, orden, activo, wompi_cuenta_id
    ) VALUES (
      p_lugar_id, v_org_id, trim(p_nombre), nullif(trim(p_descripcion), ''),
      p_precio_cop, coalesce(p_permite_reingreso, true), p_limite_por_persona,
      coalesce(p_orden, 0), coalesce(p_activo, true), p_wompi_cuenta_id
    )
    RETURNING * INTO v_row;

    UPDATE public.lugares
    SET covers_habilitado = true
    WHERE id = p_lugar_id;
  ELSE
    SELECT * INTO v_row FROM public.tipos_cover WHERE id = p_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tipo cover no encontrado';
    END IF;
    IF NOT public.fn_usuario_puede_gestionar_cover(v_row.organizador_id) THEN
      RAISE EXCEPTION 'Sin permiso para editar este tipo cover';
    END IF;

    UPDATE public.tipos_cover
    SET
      nombre = coalesce(nullif(trim(p_nombre), ''), nombre),
      descripcion = CASE WHEN p_descripcion IS NULL THEN descripcion ELSE nullif(trim(p_descripcion), '') END,
      precio_cop = coalesce(p_precio_cop, precio_cop),
      permite_reingreso = coalesce(p_permite_reingreso, permite_reingreso),
      limite_por_persona = coalesce(p_limite_por_persona, limite_por_persona),
      orden = coalesce(p_orden, orden),
      activo = coalesce(p_activo, activo),
      wompi_cuenta_id = coalesce(p_wompi_cuenta_id, wompi_cuenta_id),
      fecha_actualizacion = now()
    WHERE id = p_id
    RETURNING * INTO v_row;
  END IF;

  RETURN row_to_json(v_row)::jsonb;
END;
$$;
