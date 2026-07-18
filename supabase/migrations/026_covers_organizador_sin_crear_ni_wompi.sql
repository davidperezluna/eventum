-- Organizador no puede crear tipos_cover ni cambiar wompi_cuenta_id.
-- Solo el administrador crea productos y asigna/edita la cuenta Wompi.

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
  v_wompi BIGINT;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_id IS NULL THEN
    IF NOT public.fn_usuario_es_admin() THEN
      RAISE EXCEPTION 'Solo un administrador puede crear productos de cover';
    END IF;

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

    -- Solo admin puede cambiar la cuenta Wompi.
    IF public.fn_usuario_es_admin() THEN
      v_wompi := coalesce(p_wompi_cuenta_id, v_row.wompi_cuenta_id);
    ELSE
      v_wompi := v_row.wompi_cuenta_id;
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
      wompi_cuenta_id = v_wompi,
      fecha_actualizacion = now()
    WHERE id = p_id
    RETURNING * INTO v_row;
  END IF;

  RETURN row_to_json(v_row)::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.inicializar_cover_lugar(
  p_lugar_id BIGINT,
  p_nombre_tipo TEXT,
  p_precio_cop BIGINT,
  p_dia_semana SMALLINT,
  p_hora_apertura TIME,
  p_hora_cierre TIME,
  p_covers_descripcion TEXT DEFAULT NULL,
  p_aforo_maximo INTEGER DEFAULT NULL,
  p_cantidad_maxima_venta INTEGER DEFAULT NULL,
  p_permite_reingreso BOOLEAN DEFAULT true,
  p_categoria_id BIGINT DEFAULT NULL,
  p_wompi_cuenta_id BIGINT DEFAULT NULL,
  p_generar_sesiones BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo JSONB;
  v_plantilla JSONB;
  v_generadas JSONB;
  v_tipo_id BIGINT;
BEGIN
  IF NOT public.fn_usuario_es_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede inicializar covers en un lugar';
  END IF;

  IF p_lugar_id IS NULL OR p_nombre_tipo IS NULL OR p_precio_cop IS NULL
     OR p_dia_semana IS NULL OR p_hora_apertura IS NULL OR p_hora_cierre IS NULL THEN
    RAISE EXCEPTION 'Parámetros obligatorios: lugar_id, nombre_tipo, precio_cop, dia_semana, horarios';
  END IF;

  PERFORM public.configurar_lugar_cover(p_lugar_id, true, p_covers_descripcion);

  v_tipo := public.upsert_tipo_cover(
    NULL, p_lugar_id, p_nombre_tipo, NULL, p_precio_cop,
    p_permite_reingreso, NULL, 0, true, p_wompi_cuenta_id
  );
  v_tipo_id := (v_tipo->>'id')::bigint;

  v_plantilla := public.upsert_plantilla_cover(
    NULL, v_tipo_id, p_dia_semana, p_hora_apertura, p_hora_cierre,
    p_aforo_maximo, p_cantidad_maxima_venta, 21, true
  );

  v_generadas := jsonb_build_object('sesiones_creadas', 0);
  IF coalesce(p_generar_sesiones, true) THEN
    v_generadas := public.generar_sesiones_cover_desde_plantillas(current_date + 21);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'lugar_id', p_lugar_id,
    'tipo_cover', v_tipo,
    'plantilla_cover', v_plantilla,
    'sesiones', v_generadas,
    'config', public.obtener_config_cover_lugar(p_lugar_id)
  );
END;
$$;
