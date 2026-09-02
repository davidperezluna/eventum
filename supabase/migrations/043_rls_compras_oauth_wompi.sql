-- Complementa 042: wompi_cuentas para organizadores, vinculo OAuth por email,
-- y RLS en compras / boletas_compradas (tablas críticas del flujo de venta).

-- ─── Helper: email del JWT (OAuth / magic link) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_auth_jwt_email()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
$$;

-- ─── usuarios: vincular fila existente por email en primer login OAuth ───────

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
);

DROP POLICY IF EXISTS usuarios_update_own ON public.usuarios;

CREATE POLICY usuarios_update_own
ON public.usuarios
FOR UPDATE
TO authenticated
USING (
  auth_user_id = auth.uid()
  OR public.fn_usuario_es_admin()
  OR (
    auth_user_id IS NULL
    AND public.fn_auth_jwt_email() IS NOT NULL
    AND lower(email) = public.fn_auth_jwt_email()
  )
)
WITH CHECK (
  auth_user_id = auth.uid()
  OR public.fn_usuario_es_admin()
);

-- ─── wompi_cuentas: organizador elige cuenta activa al configurar cobros ───────

DROP POLICY IF EXISTS wompi_cuentas_select_organizador ON public.wompi_cuentas;

CREATE POLICY wompi_cuentas_select_organizador
ON public.wompi_cuentas
FOR SELECT
TO authenticated
USING (
  coalesce(activo, true) = true
  AND public.fn_usuario_es_organizador()
);

-- ─── Helpers boletas_compradas ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_usuario_puede_ver_boleta_comprada(
  p_compra_id BIGINT,
  p_tipo_boleta_id BIGINT,
  p_titular_cliente_id BIGINT DEFAULT NULL,
  p_asistente_usuario_id BIGINT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.fn_usuario_es_admin()
    OR public.fn_usuario_es_lector()
    OR p_titular_cliente_id = public.fn_usuario_id_actual()
    OR p_asistente_usuario_id = public.fn_usuario_id_actual()
    OR EXISTS (
      SELECT 1
      FROM public.compras c
      WHERE c.id = p_compra_id
        AND (
          c.cliente_id = public.fn_usuario_id_actual()
          OR public.fn_usuario_puede_gestionar_evento(c.evento_id)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.tipos_boleta tb
      WHERE tb.id = p_tipo_boleta_id
        AND public.fn_usuario_puede_gestionar_evento(tb.evento_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_usuario_puede_actualizar_boleta_comprada(
  p_compra_id BIGINT,
  p_titular_cliente_id BIGINT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.fn_usuario_es_admin()
    OR public.fn_usuario_es_lector()
    OR p_titular_cliente_id = public.fn_usuario_id_actual()
    OR EXISTS (
      SELECT 1
      FROM public.compras c
      WHERE c.id = p_compra_id
        AND c.cliente_id = public.fn_usuario_id_actual()
    );
$$;

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
      )
  );
$$;

-- ─── compras ─────────────────────────────────────────────────────────────────

ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compras_select ON public.compras;
CREATE POLICY compras_select
ON public.compras
FOR SELECT
TO authenticated
USING (
  cliente_id = public.fn_usuario_id_actual()
  OR public.fn_usuario_puede_gestionar_evento(evento_id)
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS compras_insert ON public.compras;
CREATE POLICY compras_insert
ON public.compras
FOR INSERT
TO authenticated
WITH CHECK (
  cliente_id = public.fn_usuario_id_actual()
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS compras_update ON public.compras;
CREATE POLICY compras_update
ON public.compras
FOR UPDATE
TO authenticated
USING (
  cliente_id = public.fn_usuario_id_actual()
  OR public.fn_usuario_es_admin()
)
WITH CHECK (
  cliente_id = public.fn_usuario_id_actual()
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS compras_delete ON public.compras;
CREATE POLICY compras_delete
ON public.compras
FOR DELETE
TO authenticated
USING (
  cliente_id = public.fn_usuario_id_actual()
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS compras_all_service_role ON public.compras;
CREATE POLICY compras_all_service_role
ON public.compras
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── boletas_compradas ─────────────────────────────────────────────────────────

ALTER TABLE public.boletas_compradas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS boletas_compradas_select ON public.boletas_compradas;
CREATE POLICY boletas_compradas_select
ON public.boletas_compradas
FOR SELECT
TO authenticated
USING (
  public.fn_usuario_puede_ver_boleta_comprada(
    compra_id,
    tipo_boleta_id,
    titular_cliente_id,
    asistente_usuario_id
  )
);

DROP POLICY IF EXISTS boletas_compradas_insert ON public.boletas_compradas;
CREATE POLICY boletas_compradas_insert
ON public.boletas_compradas
FOR INSERT
TO authenticated
WITH CHECK (public.fn_usuario_puede_insertar_boleta_comprada(compra_id));

DROP POLICY IF EXISTS boletas_compradas_update ON public.boletas_compradas;
CREATE POLICY boletas_compradas_update
ON public.boletas_compradas
FOR UPDATE
TO authenticated
USING (
  public.fn_usuario_puede_actualizar_boleta_comprada(compra_id, titular_cliente_id)
)
WITH CHECK (
  public.fn_usuario_puede_actualizar_boleta_comprada(compra_id, titular_cliente_id)
);

DROP POLICY IF EXISTS boletas_compradas_delete ON public.boletas_compradas;
CREATE POLICY boletas_compradas_delete
ON public.boletas_compradas
FOR DELETE
TO authenticated
USING (public.fn_usuario_es_admin());

DROP POLICY IF EXISTS boletas_compradas_all_service_role ON public.boletas_compradas;
CREATE POLICY boletas_compradas_all_service_role
ON public.boletas_compradas
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
