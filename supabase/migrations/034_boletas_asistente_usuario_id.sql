-- 034: Asistente de boleta = FK a usuarios (sin campos duplicados).
-- Requiere reinicio de boletas_compradas (sin filas legacy con snapshot).

ALTER TABLE public.boletas_compradas
  ADD COLUMN IF NOT EXISTS titular_cliente_id BIGINT REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.boletas_compradas
  ADD COLUMN IF NOT EXISTS asistente_usuario_id BIGINT REFERENCES public.usuarios(id) ON DELETE RESTRICT;

ALTER TABLE public.boletas_compradas
  DROP COLUMN IF EXISTS nombre_asistente,
  DROP COLUMN IF EXISTS documento_asistente,
  DROP COLUMN IF EXISTS email_asistente,
  DROP COLUMN IF EXISTS telefono_asistente;

CREATE INDEX IF NOT EXISTS idx_boletas_compradas_asistente_usuario_id
  ON public.boletas_compradas(asistente_usuario_id)
  WHERE asistente_usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_boletas_compradas_titular_cliente_id
  ON public.boletas_compradas(titular_cliente_id)
  WHERE titular_cliente_id IS NOT NULL;

-- ─── Traslados / asignación entradas (boletas_compradas, no cover) ───────────

CREATE OR REPLACE FUNCTION public.fn_traslado_boleta_palco_activo(p_boleta_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.traslados_boleta t
    WHERE t.boleta_id = p_boleta_id
      AND t.estado IN ('enviado', 'recibido')
  );
$$;

CREATE OR REPLACE FUNCTION public.rellenar_asistente_palco_desde_perfil(p_boleta_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid BIGINT;
  v_b public.boletas_compradas%ROWTYPE;
  v_compra public.compras%ROWTYPE;
  v_doc TEXT;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión requerida');
  END IF;

  SELECT documento_identidad INTO v_doc FROM public.usuarios WHERE id = v_uid;
  IF nullif(trim(coalesce(v_doc, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Debes registrar tu documento en Mi perfil antes de vincular la entrada');
  END IF;

  SELECT * INTO v_b FROM public.boletas_compradas WHERE id = p_boleta_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Boleta no encontrada');
  END IF;

  SELECT * INTO v_compra FROM public.compras WHERE id = v_b.compra_id;
  IF v_compra.estado_pago IS DISTINCT FROM 'completado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El pago de la compra no está confirmado');
  END IF;

  IF coalesce(v_b.titular_cliente_id, v_compra.cliente_id) IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No eres titular de esta entrada');
  END IF;

  IF v_b.estado IN ('usada', 'cancelada') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta entrada ya no se puede vincular');
  END IF;

  UPDATE public.boletas_compradas
  SET asistente_usuario_id = v_uid
  WHERE id = v_b.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.iniciar_traslado_boleta_palco(
  p_boleta_id BIGINT,
  p_email_destino TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid BIGINT;
  v_b public.boletas_compradas%ROWTYPE;
  v_compra public.compras%ROWTYPE;
  v_destino_id BIGINT;
  v_traslado_id BIGINT;
  v_email TEXT;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión requerida');
  END IF;

  v_email := lower(trim(coalesce(p_email_destino, '')));
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email requerido');
  END IF;

  SELECT * INTO v_b FROM public.boletas_compradas WHERE id = p_boleta_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Boleta no encontrada');
  END IF;

  SELECT * INTO v_compra FROM public.compras WHERE id = v_b.compra_id;
  IF v_compra.estado_pago IS DISTINCT FROM 'completado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El pago de la compra no está confirmado');
  END IF;

  IF coalesce(v_b.titular_cliente_id, v_compra.cliente_id) IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No eres titular de esta entrada');
  END IF;

  IF v_b.estado IN ('usada', 'cancelada') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta entrada ya no se puede transferir');
  END IF;

  IF public.fn_traslado_boleta_palco_activo(v_b.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya hay un traslado pendiente para esta entrada');
  END IF;

  SELECT u.id INTO v_destino_id
  FROM public.usuarios u
  WHERE lower(u.email) = v_email AND u.activo = true
  LIMIT 1;

  IF v_destino_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hay usuario registrado con ese correo');
  END IF;

  IF v_destino_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes enviarte la entrada a ti mismo');
  END IF;

  IF nullif(trim(coalesce((SELECT documento_identidad FROM public.usuarios WHERE id = v_destino_id), '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El destinatario debe tener documento en Mi perfil');
  END IF;

  INSERT INTO public.traslados_boleta (
    boleta_id, usuario_origen_id, usuario_destino_id, email_destino, estado
  ) VALUES (
    v_b.id, v_uid, v_destino_id, v_email, 'enviado'
  )
  RETURNING id INTO v_traslado_id;

  RETURN jsonb_build_object('ok', true, 'traslado_id', v_traslado_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_traslado_boleta_recibido(p_traslado_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid BIGINT;
  v_t public.traslados_boleta%ROWTYPE;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  SELECT * INTO v_t FROM public.traslados_boleta WHERE id = p_traslado_id FOR UPDATE;
  IF NOT FOUND OR v_t.boleta_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Traslado no encontrado');
  END IF;
  IF v_t.usuario_destino_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;
  IF v_t.estado <> 'enviado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Estado inválido');
  END IF;
  UPDATE public.traslados_boleta
  SET estado = 'recibido', fecha_recibido = now()
  WHERE id = v_t.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.aceptar_traslado_boleta_palco(p_traslado_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid BIGINT;
  v_t public.traslados_boleta%ROWTYPE;
  v_doc TEXT;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión requerida');
  END IF;

  SELECT documento_identidad INTO v_doc FROM public.usuarios WHERE id = v_uid;
  IF nullif(trim(coalesce(v_doc, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Debes registrar tu documento en Mi perfil antes de aceptar');
  END IF;

  SELECT * INTO v_t FROM public.traslados_boleta WHERE id = p_traslado_id FOR UPDATE;
  IF NOT FOUND OR v_t.boleta_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Traslado no encontrado');
  END IF;
  IF v_t.usuario_destino_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;
  IF v_t.estado NOT IN ('enviado', 'recibido') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este traslado ya fue procesado');
  END IF;

  UPDATE public.boletas_compradas
  SET
    titular_cliente_id = v_uid,
    asistente_usuario_id = v_uid
  WHERE id = v_t.boleta_id;

  UPDATE public.traslados_boleta
  SET estado = 'aceptado', fecha_aceptacion = now()
  WHERE id = v_t.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rechazar_traslado_boleta_palco(p_traslado_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid BIGINT;
  v_t public.traslados_boleta%ROWTYPE;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  SELECT * INTO v_t FROM public.traslados_boleta WHERE id = p_traslado_id FOR UPDATE;
  IF NOT FOUND OR v_t.boleta_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Traslado no encontrado');
  END IF;
  IF v_t.usuario_destino_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;
  IF v_t.estado NOT IN ('enviado', 'recibido') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Estado inválido');
  END IF;
  UPDATE public.traslados_boleta
  SET estado = 'rechazado', fecha_rechazo = now()
  WHERE id = v_t.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_traslado_boleta_palco(p_traslado_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid BIGINT;
  v_t public.traslados_boleta%ROWTYPE;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  SELECT * INTO v_t FROM public.traslados_boleta WHERE id = p_traslado_id FOR UPDATE;
  IF NOT FOUND OR v_t.boleta_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Traslado no encontrado');
  END IF;
  IF v_t.usuario_origen_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;
  IF v_t.estado <> 'enviado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo puedes cancelar envíos pendientes');
  END IF;
  UPDATE public.traslados_boleta
  SET estado = 'cancelado', fecha_cancelacion = now()
  WHERE id = v_t.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rellenar_asistente_palco_desde_perfil(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_traslado_boleta_palco(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_traslado_boleta_recibido(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aceptar_traslado_boleta_palco(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rechazar_traslado_boleta_palco(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_traslado_boleta_palco(BIGINT) TO authenticated;
