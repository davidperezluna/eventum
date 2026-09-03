-- Venta manual para organizadores: mismos flujos que admin, acotados a sus eventos.
-- Permite buscar clientes, insertar/actualizar compras del evento propio
-- e insertar boletas; reserva de palcos vía RPC SECURITY DEFINER.

-- ─── usuarios: organizador puede listar clientes activos (titulares) ──────────

DROP POLICY IF EXISTS usuarios_select_own ON public.usuarios;

CREATE POLICY usuarios_select_own
ON public.usuarios
FOR SELECT
TO authenticated
USING (
  auth_user_id = auth.uid()
  OR public.fn_usuario_es_admin()
  OR public.fn_usuario_es_staff()
  OR (
    auth_user_id IS NULL
    AND public.fn_auth_jwt_email() IS NOT NULL
    AND lower(email) = public.fn_auth_jwt_email()
  )
  OR (
    public.fn_usuario_es_organizador()
    AND tipo_usuario_id = 1
    AND coalesce(activo, true) = true
  )
);

-- ─── Helper: insertar boletas de compra del evento que gestiona ───────────────

CREATE OR REPLACE FUNCTION public.fn_usuario_puede_insertar_boleta_comprada(p_compra_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.compras c
    WHERE c.id = p_compra_id
      AND (
        c.cliente_id = public.fn_usuario_id_actual()
        OR public.fn_usuario_es_admin()
        OR public.fn_usuario_puede_gestionar_evento(c.evento_id)
      )
  );
$$;

-- ─── compras: insert/update por gestor del evento ────────────────────────────

DROP POLICY IF EXISTS compras_insert ON public.compras;
CREATE POLICY compras_insert
ON public.compras
FOR INSERT
TO authenticated
WITH CHECK (
  cliente_id = public.fn_usuario_id_actual()
  OR public.fn_usuario_es_admin()
  OR public.fn_usuario_puede_gestionar_evento(evento_id)
);

DROP POLICY IF EXISTS compras_update ON public.compras;
CREATE POLICY compras_update
ON public.compras
FOR UPDATE
TO authenticated
USING (
  cliente_id = public.fn_usuario_id_actual()
  OR public.fn_usuario_es_admin()
  OR public.fn_usuario_puede_gestionar_evento(evento_id)
)
WITH CHECK (
  cliente_id = public.fn_usuario_id_actual()
  OR public.fn_usuario_es_admin()
  OR public.fn_usuario_puede_gestionar_evento(evento_id)
);

-- ─── Reserva de palcos ligada a compra (venta manual admin/organizador) ──────

CREATE OR REPLACE FUNCTION public.reservar_palcos_compra_manual(
  p_compra_id BIGINT,
  p_palco_ids BIGINT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento_id BIGINT;
  v_expected INTEGER;
  v_updated INTEGER;
BEGIN
  IF p_compra_id IS NULL OR p_compra_id <= 0 THEN
    RAISE EXCEPTION 'p_compra_id es requerido';
  END IF;

  SELECT c.evento_id INTO v_evento_id
  FROM public.compras c
  WHERE c.id = p_compra_id;

  IF v_evento_id IS NULL THEN
    RAISE EXCEPTION 'Compra no encontrada';
  END IF;

  IF NOT (
    public.fn_usuario_es_admin()
    OR public.fn_usuario_puede_gestionar_evento(v_evento_id)
  ) THEN
    RAISE EXCEPTION 'No autorizado para reservar palcos de esta compra';
  END IF;

  SELECT count(DISTINCT id) INTO v_expected
  FROM unnest(coalesce(p_palco_ids, ARRAY[]::BIGINT[])) AS id
  WHERE id IS NOT NULL;

  IF v_expected = 0 THEN
    RAISE EXCEPTION 'Selecciona al menos un palco';
  END IF;

  IF (
    SELECT count(*)
    FROM public.palcos p
    JOIN public.tipos_boleta tb ON tb.id = p.tipo_boleta_id
    WHERE p.id = ANY(p_palco_ids)
      AND tb.evento_id = v_evento_id
      AND coalesce(tb.es_palco, false) = true
  ) <> v_expected THEN
    RAISE EXCEPTION 'Uno o más palcos no pertenecen a este evento';
  END IF;

  UPDATE public.palcos p
  SET
    estado = 'reservado',
    compra_id = p_compra_id,
    transaccion_checkout_id = NULL,
    fecha_actualizacion = now()
  FROM public.tipos_boleta tb
  WHERE p.tipo_boleta_id = tb.id
    AND tb.evento_id = v_evento_id
    AND p.id = ANY(p_palco_ids)
    AND p.estado = 'disponible'
    AND p.compra_id IS NULL
    AND p.transaccion_checkout_id IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'Uno o más palcos dejaron de estar disponibles';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_palcos_compra_manual(BIGINT, BIGINT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reservar_palcos_compra_manual(BIGINT, BIGINT[]) TO authenticated, service_role;
