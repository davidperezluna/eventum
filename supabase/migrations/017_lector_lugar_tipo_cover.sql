-- 017: Permisos de lectores para covers por lugar (no por evento).
-- Convención paralela a lector_evento_tipo_boleta:
--   usuario_id + lugar_id + tipo_cover_id

CREATE TABLE IF NOT EXISTS public.lector_lugar_tipo_cover (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  lugar_id BIGINT NOT NULL REFERENCES public.lugares(id) ON DELETE CASCADE,
  tipo_cover_id BIGINT NOT NULL REFERENCES public.tipos_cover(id) ON DELETE CASCADE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lltc_usuario_lugar_tipo_cover
  ON public.lector_lugar_tipo_cover(usuario_id, lugar_id, tipo_cover_id);

CREATE INDEX IF NOT EXISTS idx_lltc_lugar
  ON public.lector_lugar_tipo_cover(lugar_id);

CREATE INDEX IF NOT EXISTS idx_lltc_usuario
  ON public.lector_lugar_tipo_cover(usuario_id);

COMMENT ON TABLE public.lector_lugar_tipo_cover IS
  'Permisos de escaneo cover: lector + lugar + tipo_cover (módulo Covers, sin evento).';

-- ─── Validación: usuario lector + tipo_cover del lugar ───────────────────────

CREATE OR REPLACE FUNCTION public.validate_lector_lugar_tipo_cover()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tipo_lugar BIGINT;
  v_tipo_usuario INT;
BEGIN
  SELECT u.tipo_usuario_id
  INTO v_tipo_usuario
  FROM public.usuarios u
  WHERE u.id = NEW.usuario_id;

  IF v_tipo_usuario IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'El usuario asignado debe tener rol Lector.';
  END IF;

  SELECT tc.lugar_id
  INTO v_tipo_lugar
  FROM public.tipos_cover tc
  WHERE tc.id = NEW.tipo_cover_id;

  IF v_tipo_lugar IS NULL THEN
    RAISE EXCEPTION 'El tipo de cover seleccionado no existe.';
  END IF;

  IF v_tipo_lugar <> NEW.lugar_id THEN
    RAISE EXCEPTION 'El tipo de cover debe pertenecer al lugar seleccionado.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_lector_lugar_tipo_cover ON public.lector_lugar_tipo_cover;
CREATE TRIGGER trg_validate_lector_lugar_tipo_cover
BEFORE INSERT OR UPDATE OF usuario_id, lugar_id, tipo_cover_id
ON public.lector_lugar_tipo_cover
FOR EACH ROW
EXECUTE FUNCTION public.validate_lector_lugar_tipo_cover();

-- ─── Helper permiso escaneo cover ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_lector_puede_escanear_cover(
  p_usuario_id BIGINT,
  p_lugar_id BIGINT,
  p_tipo_cover_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.fn_usuario_es_admin()
    OR EXISTS (
      SELECT 1
      FROM public.lector_lugar_tipo_cover lltc
      WHERE lltc.usuario_id = p_usuario_id
        AND lltc.lugar_id = p_lugar_id
        AND lltc.tipo_cover_id = p_tipo_cover_id
    );
$$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.lector_lugar_tipo_cover ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lltc_select_propia ON public.lector_lugar_tipo_cover;
CREATE POLICY lltc_select_propia ON public.lector_lugar_tipo_cover
  FOR SELECT TO authenticated
  USING (
    public.fn_usuario_es_admin()
    OR usuario_id = public.fn_usuario_id_actual()
    OR (
      public.fn_usuario_es_organizador()
      AND EXISTS (
        SELECT 1 FROM public.tipos_cover tc
        WHERE tc.id = tipo_cover_id
          AND tc.organizador_id = public.fn_usuario_id_actual()
      )
    )
  );

DROP POLICY IF EXISTS lltc_insert_gestion ON public.lector_lugar_tipo_cover;
CREATE POLICY lltc_insert_gestion ON public.lector_lugar_tipo_cover
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_usuario_es_admin()
    OR (
      public.fn_usuario_es_organizador()
      AND public.fn_usuario_puede_configurar_lugar_cover(lugar_id)
    )
  );

DROP POLICY IF EXISTS lltc_delete_gestion ON public.lector_lugar_tipo_cover;
CREATE POLICY lltc_delete_gestion ON public.lector_lugar_tipo_cover
  FOR DELETE TO authenticated
  USING (
    public.fn_usuario_es_admin()
    OR (
      public.fn_usuario_es_organizador()
      AND public.fn_usuario_puede_configurar_lugar_cover(lugar_id)
    )
  );

GRANT SELECT, INSERT, DELETE ON public.lector_lugar_tipo_cover TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.lector_lugar_tipo_cover_id_seq TO authenticated;

-- ─── RPC: buscar cover por QR (lector con permiso o admin) ───────────────────

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
    'aforo_maximo', v_sesion.aforo_maximo
  );
END;
$$;

-- ─── Actualizar registrar_acceso_cover: exigir permiso (admin bypass) ───────

CREATE OR REPLACE FUNCTION public.registrar_acceso_cover(
  p_codigo_qr TEXT,
  p_tipo_movimiento TEXT,
  p_sesion_cover_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lector_id BIGINT;
  v_bc public.boletas_cover%ROWTYPE;
  v_compra_cover public.compras_cover%ROWTYPE;
  v_sesion public.sesiones_cover%ROWTYPE;
  v_tipo public.tipos_cover%ROWTYPE;
  v_personas_despues INT;
  v_now TIMESTAMPTZ := now();
BEGIN
  v_lector_id := public.fn_usuario_id_actual();
  IF v_lector_id IS NULL THEN RAISE EXCEPTION 'Sesión requerida'; END IF;
  IF p_tipo_movimiento NOT IN ('entrada', 'salida') THEN RAISE EXCEPTION 'Movimiento inválido'; END IF;
  IF nullif(trim(p_codigo_qr), '') IS NULL THEN RAISE EXCEPTION 'codigo_qr requerido'; END IF;

  SELECT * INTO v_bc FROM public.boletas_cover WHERE codigo_qr = trim(p_codigo_qr);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QR cover no encontrado';
  END IF;

  SELECT * INTO v_compra_cover FROM public.compras_cover WHERE id = v_bc.compra_cover_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra cover no encontrada';
  END IF;
  IF v_compra_cover.estado_pago IS DISTINCT FROM 'completado'
     OR v_compra_cover.estado_compra IS DISTINCT FROM 'confirmada' THEN
    RAISE EXCEPTION 'Compra cover no confirmada';
  END IF;

  SELECT * INTO v_sesion FROM public.sesiones_cover WHERE id = coalesce(p_sesion_cover_id, v_bc.sesion_cover_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión no encontrada'; END IF;
  IF v_sesion.id IS DISTINCT FROM v_bc.sesion_cover_id AND p_sesion_cover_id IS NOT NULL THEN
    RAISE EXCEPTION 'QR no válido para esta sesión';
  END IF;

  SELECT * INTO v_tipo FROM public.tipos_cover WHERE id = v_bc.tipo_cover_id;

  IF NOT public.fn_lector_puede_escanear_cover(v_lector_id, v_sesion.lugar_id, v_bc.tipo_cover_id) THEN
    RAISE EXCEPTION 'Sin permiso de lector para este cover';
  END IF;

  IF p_tipo_movimiento = 'entrada' THEN
    IF v_bc.estado_acceso = 'consumida' AND NOT coalesce(v_tipo.permite_reingreso, true) THEN
      RAISE EXCEPTION 'Entrada ya consumida';
    END IF;
    IF v_sesion.personas_dentro >= v_sesion.aforo_maximo THEN
      RAISE EXCEPTION 'Aforo completo';
    END IF;
    UPDATE public.sesiones_cover
    SET personas_dentro = personas_dentro + 1, fecha_actualizacion = v_now
    WHERE id = v_sesion.id
    RETURNING personas_dentro INTO v_personas_despues;
    UPDATE public.boletas_cover
    SET estado_acceso = 'dentro', entradas_count = entradas_count + 1,
        primera_entrada_at = coalesce(primera_entrada_at, v_now),
        ultima_entrada_at = v_now, fecha_actualizacion = v_now
    WHERE id = v_bc.id;
  ELSE
    IF v_bc.estado_acceso IS DISTINCT FROM 'dentro' THEN
      RAISE EXCEPTION 'No hay entrada registrada para registrar salida';
    END IF;
    UPDATE public.sesiones_cover
    SET personas_dentro = greatest(0, personas_dentro - 1), fecha_actualizacion = v_now
    WHERE id = v_sesion.id
    RETURNING personas_dentro INTO v_personas_despues;
    UPDATE public.boletas_cover
    SET estado_acceso = CASE WHEN coalesce(v_tipo.permite_reingreso, true) THEN 'fuera' ELSE 'consumida' END,
        salidas_count = salidas_count + 1, ultima_salida_at = v_now, fecha_actualizacion = v_now
    WHERE id = v_bc.id;
  END IF;

  INSERT INTO public.accesos_cover (
    boleta_cover_id, sesion_cover_id, tipo_movimiento,
    lector_usuario_id, personas_dentro_despues
  ) VALUES (
    v_bc.id, v_sesion.id, p_tipo_movimiento,
    v_lector_id, v_personas_despues
  );

  RETURN jsonb_build_object(
    'ok', true,
    'estado_acceso', (SELECT estado_acceso FROM public.boletas_cover WHERE id = v_bc.id),
    'personas_dentro', v_personas_despues
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_boleta_cover_para_escaneo(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lector_puede_escanear_cover(BIGINT, BIGINT, BIGINT) TO authenticated;
