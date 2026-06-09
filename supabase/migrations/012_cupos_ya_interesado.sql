-- Cupos: no repetir "Me interesa" en el mismo aviso (UI + RPC).

CREATE OR REPLACE FUNCTION public.listar_avisos_cupo_evento(
  p_evento_id BIGINT,
  p_tipo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_uid BIGINT;
BEGIN
  v_uid := public.fn_usuario_id_actual();

  IF p_evento_id IS NULL OR p_evento_id <= 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.fecha_creacion DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      a.id,
      a.evento_id,
      a.tipo,
      a.descripcion,
      a.cupos,
      a.zona_texto,
      a.precio_referencia_cop,
      a.autor_display,
      a.fecha_creacion,
      (SELECT count(*)::int FROM public.intereses_cupo i WHERE i.aviso_id = a.id AND i.estado <> 'cerrado') AS intereses_count,
      (v_uid IS NOT NULL AND a.usuario_id = v_uid) AS es_mio,
      (
        v_uid IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.intereses_cupo i
          WHERE i.aviso_id = a.id AND i.usuario_id = v_uid
        )
      ) AS ya_interesado
    FROM public.avisos_cupo a
    WHERE a.evento_id = p_evento_id
      AND a.estado = 'activo'
      AND (p_tipo IS NULL OR a.tipo = p_tipo)
  ) t;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_avisos_cupo_global(
  p_tipo TEXT DEFAULT NULL,
  p_limite INT DEFAULT 80,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_limite INT;
  v_offset INT;
  v_uid BIGINT;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  v_limite := least(greatest(coalesce(p_limite, 80), 1), 100);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.fecha_creacion DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      a.id,
      a.evento_id,
      e.titulo AS evento_titulo,
      e.imagen_principal AS evento_imagen_principal,
      e.fecha_inicio AS evento_fecha_inicio,
      a.tipo,
      a.descripcion,
      a.cupos,
      a.zona_texto,
      a.precio_referencia_cop,
      a.autor_display,
      a.fecha_creacion,
      (SELECT count(*)::int FROM public.intereses_cupo i WHERE i.aviso_id = a.id AND i.estado <> 'cerrado') AS intereses_count,
      (v_uid IS NOT NULL AND a.usuario_id = v_uid) AS es_mio,
      (
        v_uid IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.intereses_cupo i
          WHERE i.aviso_id = a.id AND i.usuario_id = v_uid
        )
      ) AS ya_interesado
    FROM public.avisos_cupo a
    JOIN public.eventos e ON e.id = a.evento_id
    WHERE a.estado = 'activo'
      AND e.activo = true
      AND (p_tipo IS NULL OR a.tipo = p_tipo)
    ORDER BY a.fecha_creacion DESC
    LIMIT v_limite
    OFFSET v_offset
  ) t;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_interes_cupo(
  p_aviso_id BIGINT,
  p_mensaje TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid BIGINT;
  v_aviso public.avisos_cupo%ROWTYPE;
  v_interes_id BIGINT;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Debes iniciar sesión');
  END IF;

  SELECT * INTO v_aviso FROM public.avisos_cupo WHERE id = p_aviso_id AND estado = 'activo';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Aviso no disponible');
  END IF;

  IF v_aviso.usuario_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes mostrar interés en tu propio aviso');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.intereses_cupo i
    WHERE i.aviso_id = p_aviso_id AND i.usuario_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya enviaste interés en este aviso');
  END IF;

  INSERT INTO public.intereses_cupo (aviso_id, usuario_id, mensaje)
  VALUES (p_aviso_id, v_uid, trim(p_mensaje))
  RETURNING id INTO v_interes_id;

  RETURN jsonb_build_object('ok', true, 'interes_id', v_interes_id);
END;
$$;
