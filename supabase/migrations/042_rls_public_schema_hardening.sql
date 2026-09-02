-- Endurece RLS en tablas public expuestas por PostgREST y corrige vistas SECURITY DEFINER.
-- Resuelve alertas del linter: policy_exists_rls_disabled, rls_disabled_in_public,
-- security_definer_view, sensitive_columns_exposed (sesiones.token).

-- ─── Helpers RLS ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_usuario_es_lector()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.tipo_usuario_id = 4
      AND coalesce(u.activo, true) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_usuario_es_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.fn_usuario_es_admin()
    OR public.fn_usuario_es_organizador()
    OR public.fn_usuario_es_lector();
$$;

CREATE OR REPLACE FUNCTION public.fn_usuario_puede_gestionar_evento(p_evento_id BIGINT)
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
      FROM public.eventos e
      WHERE e.id = p_evento_id
        AND e.organizador_id = public.fn_usuario_id_actual()
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_evento_visible_publico(p_evento_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.eventos e
    WHERE e.id = p_evento_id
      AND (
        (
          coalesce(e.activo, false) = true
          AND e.estado::text = ANY (ARRAY['publicado', 'en_curso'])
        )
        OR e.estado::text = 'finalizado'
      )
  );
$$;

-- ─── Vistas: SECURITY INVOKER ────────────────────────────────────────────────

DROP VIEW IF EXISTS public.vw_tx_checkout_resumen;

CREATE VIEW public.vw_tx_checkout_resumen
WITH (security_invoker = true)
AS
SELECT
  id,
  tipo,
  cliente_id,
  evento_id,
  estado,
  es_activa,
  materializado,
  wompi_status,
  total,
  moneda,
  numero_intento,
  wompi_reference,
  wompi_transaction_id,
  expires_at,
  fecha_creacion,
  fecha_actualizacion,
  fecha_confirmacion,
  fecha_cancelacion
FROM public.transacciones_checkout;

DO $$
BEGIN
  IF to_regclass('public.vista_eventos_completos') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.vista_eventos_completos SET (security_invoker = true)';
  END IF;
  IF to_regclass('public.vista_compras_detalladas') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.vista_compras_detalladas SET (security_invoker = true)';
  END IF;
END $$;

-- ─── usuarios ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.usuarios;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.usuarios;

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usuarios_select_own ON public.usuarios;
CREATE POLICY usuarios_select_own
ON public.usuarios
FOR SELECT
TO authenticated
USING (
  auth_user_id = auth.uid()
  OR public.fn_usuario_es_admin()
  OR public.fn_usuario_es_staff()
);

DROP POLICY IF EXISTS usuarios_insert_self ON public.usuarios;
CREATE POLICY usuarios_insert_self
ON public.usuarios
FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS usuarios_update_own ON public.usuarios;
CREATE POLICY usuarios_update_own
ON public.usuarios
FOR UPDATE
TO authenticated
USING (
  auth_user_id = auth.uid()
  OR public.fn_usuario_es_admin()
)
WITH CHECK (
  auth_user_id = auth.uid()
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS usuarios_all_service_role ON public.usuarios;
CREATE POLICY usuarios_all_service_role
ON public.usuarios
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── tipos_usuario (catálogo de roles) ───────────────────────────────────────

ALTER TABLE public.tipos_usuario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tipos_usuario_select_all ON public.tipos_usuario;
CREATE POLICY tipos_usuario_select_all
ON public.tipos_usuario
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS tipos_usuario_manage_admin ON public.tipos_usuario;
CREATE POLICY tipos_usuario_manage_admin
ON public.tipos_usuario
FOR ALL
TO authenticated
USING (public.fn_usuario_es_admin())
WITH CHECK (public.fn_usuario_es_admin());

DROP POLICY IF EXISTS tipos_usuario_all_service_role ON public.tipos_usuario;
CREATE POLICY tipos_usuario_all_service_role
ON public.tipos_usuario
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── eventos ─────────────────────────────────────────────────────────────────

ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eventos_select_public ON public.eventos;
CREATE POLICY eventos_select_public
ON public.eventos
FOR SELECT
TO anon, authenticated
USING (
  public.fn_evento_visible_publico(id)
  OR public.fn_usuario_puede_gestionar_evento(id)
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS eventos_insert_owner ON public.eventos;
CREATE POLICY eventos_insert_owner
ON public.eventos
FOR INSERT
TO authenticated
WITH CHECK (
  public.fn_usuario_es_admin()
  OR (
    public.fn_usuario_es_organizador()
    AND organizador_id = public.fn_usuario_id_actual()
  )
);

DROP POLICY IF EXISTS eventos_update_owner ON public.eventos;
CREATE POLICY eventos_update_owner
ON public.eventos
FOR UPDATE
TO authenticated
USING (
  public.fn_usuario_puede_gestionar_evento(id)
  OR public.fn_usuario_es_admin()
)
WITH CHECK (
  public.fn_usuario_puede_gestionar_evento(id)
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS eventos_delete_owner ON public.eventos;
CREATE POLICY eventos_delete_owner
ON public.eventos
FOR DELETE
TO authenticated
USING (
  public.fn_usuario_puede_gestionar_evento(id)
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS eventos_all_service_role ON public.eventos;
CREATE POLICY eventos_all_service_role
ON public.eventos
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── tipos_boleta ────────────────────────────────────────────────────────────

ALTER TABLE public.tipos_boleta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tipos_boleta_select_public ON public.tipos_boleta;
CREATE POLICY tipos_boleta_select_public
ON public.tipos_boleta
FOR SELECT
TO anon, authenticated
USING (
  (activo = true AND public.fn_evento_visible_publico(evento_id))
  OR public.fn_usuario_puede_gestionar_evento(evento_id)
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS tipos_boleta_manage_owner ON public.tipos_boleta;
CREATE POLICY tipos_boleta_manage_owner
ON public.tipos_boleta
FOR ALL
TO authenticated
USING (
  public.fn_usuario_puede_gestionar_evento(evento_id)
  OR public.fn_usuario_es_admin()
)
WITH CHECK (
  public.fn_usuario_puede_gestionar_evento(evento_id)
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS tipos_boleta_all_service_role ON public.tipos_boleta;
CREATE POLICY tipos_boleta_all_service_role
ON public.tipos_boleta
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── productos ───────────────────────────────────────────────────────────────

ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS productos_select_public ON public.productos;
CREATE POLICY productos_select_public
ON public.productos
FOR SELECT
TO anon, authenticated
USING (
  (activo = true AND public.fn_evento_visible_publico(evento_id))
  OR public.fn_usuario_puede_gestionar_evento(evento_id)
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS productos_manage_owner ON public.productos;
CREATE POLICY productos_manage_owner
ON public.productos
FOR ALL
TO authenticated
USING (
  public.fn_usuario_puede_gestionar_evento(evento_id)
  OR public.fn_usuario_es_admin()
)
WITH CHECK (
  public.fn_usuario_puede_gestionar_evento(evento_id)
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS productos_all_service_role ON public.productos;
CREATE POLICY productos_all_service_role
ON public.productos
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── compras_productos / items ───────────────────────────────────────────────

ALTER TABLE public.compras_productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compras_productos_select ON public.compras_productos;
CREATE POLICY compras_productos_select
ON public.compras_productos
FOR SELECT
TO authenticated
USING (
  cliente_id = public.fn_usuario_id_actual()
  OR public.fn_usuario_puede_gestionar_evento(evento_id)
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS compras_productos_insert_own ON public.compras_productos;
CREATE POLICY compras_productos_insert_own
ON public.compras_productos
FOR INSERT
TO authenticated
WITH CHECK (cliente_id = public.fn_usuario_id_actual());

DROP POLICY IF EXISTS compras_productos_update ON public.compras_productos;
CREATE POLICY compras_productos_update
ON public.compras_productos
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

DROP POLICY IF EXISTS compras_productos_all_service_role ON public.compras_productos;
CREATE POLICY compras_productos_all_service_role
ON public.compras_productos
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

ALTER TABLE public.compras_productos_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compras_productos_items_select ON public.compras_productos_items;
CREATE POLICY compras_productos_items_select
ON public.compras_productos_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.compras_productos cp
    WHERE cp.id = compras_productos_items.compra_producto_id
      AND (
        cp.cliente_id = public.fn_usuario_id_actual()
        OR public.fn_usuario_puede_gestionar_evento(cp.evento_id)
        OR public.fn_usuario_es_admin()
      )
  )
);

DROP POLICY IF EXISTS compras_productos_items_insert_own ON public.compras_productos_items;
CREATE POLICY compras_productos_items_insert_own
ON public.compras_productos_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.compras_productos cp
    WHERE cp.id = compra_producto_id
      AND cp.cliente_id = public.fn_usuario_id_actual()
  )
);

DROP POLICY IF EXISTS compras_productos_items_update ON public.compras_productos_items;
CREATE POLICY compras_productos_items_update
ON public.compras_productos_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.compras_productos cp
    WHERE cp.id = compra_producto_id
      AND (
        cp.cliente_id = public.fn_usuario_id_actual()
        OR public.fn_usuario_es_admin()
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.compras_productos cp
    WHERE cp.id = compra_producto_id
      AND (
        cp.cliente_id = public.fn_usuario_id_actual()
        OR public.fn_usuario_es_admin()
      )
  )
);

DROP POLICY IF EXISTS compras_productos_items_all_service_role ON public.compras_productos_items;
CREATE POLICY compras_productos_items_all_service_role
ON public.compras_productos_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── lugares / categorías ────────────────────────────────────────────────────

ALTER TABLE public.lugares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lugares_select_public ON public.lugares;
CREATE POLICY lugares_select_public
ON public.lugares
FOR SELECT
TO anon, authenticated
USING (coalesce(activo, true) = true OR public.fn_usuario_es_staff());

DROP POLICY IF EXISTS lugares_manage_admin ON public.lugares;
CREATE POLICY lugares_manage_admin
ON public.lugares
FOR ALL
TO authenticated
USING (public.fn_usuario_es_admin())
WITH CHECK (public.fn_usuario_es_admin());

DROP POLICY IF EXISTS lugares_all_service_role ON public.lugares;
CREATE POLICY lugares_all_service_role
ON public.lugares
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

ALTER TABLE public.categorias_evento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categorias_evento_select_public ON public.categorias_evento;
CREATE POLICY categorias_evento_select_public
ON public.categorias_evento
FOR SELECT
TO anon, authenticated
USING (coalesce(activo, true) = true OR public.fn_usuario_es_staff());

DROP POLICY IF EXISTS categorias_evento_manage_admin ON public.categorias_evento;
CREATE POLICY categorias_evento_manage_admin
ON public.categorias_evento
FOR ALL
TO authenticated
USING (public.fn_usuario_es_admin())
WITH CHECK (public.fn_usuario_es_admin());

DROP POLICY IF EXISTS categorias_evento_all_service_role ON public.categorias_evento;
CREATE POLICY categorias_evento_all_service_role
ON public.categorias_evento
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── palcos ──────────────────────────────────────────────────────────────────

ALTER TABLE public.palcos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS palcos_select_public ON public.palcos;
CREATE POLICY palcos_select_public
ON public.palcos
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tipos_boleta tb
    WHERE tb.id = palcos.tipo_boleta_id
      AND (
        (tb.activo = true AND public.fn_evento_visible_publico(tb.evento_id))
        OR public.fn_usuario_puede_gestionar_evento(tb.evento_id)
        OR public.fn_usuario_es_admin()
      )
  )
);

DROP POLICY IF EXISTS palcos_manage_staff ON public.palcos;
CREATE POLICY palcos_manage_staff
ON public.palcos
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tipos_boleta tb
    WHERE tb.id = palcos.tipo_boleta_id
      AND (
        public.fn_usuario_puede_gestionar_evento(tb.evento_id)
        OR public.fn_usuario_es_admin()
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.tipos_boleta tb
    WHERE tb.id = palcos.tipo_boleta_id
      AND (
        public.fn_usuario_puede_gestionar_evento(tb.evento_id)
        OR public.fn_usuario_es_admin()
      )
  )
);

DROP POLICY IF EXISTS palcos_all_service_role ON public.palcos;
CREATE POLICY palcos_all_service_role
ON public.palcos
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── wompi_cuentas (credenciales sensibles) ──────────────────────────────────

ALTER TABLE public.wompi_cuentas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wompi_cuentas_select_admin ON public.wompi_cuentas;
CREATE POLICY wompi_cuentas_select_admin
ON public.wompi_cuentas
FOR SELECT
TO authenticated
USING (public.fn_usuario_es_admin());

DROP POLICY IF EXISTS wompi_cuentas_manage_admin ON public.wompi_cuentas;
CREATE POLICY wompi_cuentas_manage_admin
ON public.wompi_cuentas
FOR ALL
TO authenticated
USING (public.fn_usuario_es_admin())
WITH CHECK (public.fn_usuario_es_admin());

DROP POLICY IF EXISTS wompi_cuentas_all_service_role ON public.wompi_cuentas;
CREATE POLICY wompi_cuentas_all_service_role
ON public.wompi_cuentas
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── favoritos ───────────────────────────────────────────────────────────────

ALTER TABLE public.favoritos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS favoritos_own ON public.favoritos;
CREATE POLICY favoritos_own
ON public.favoritos
FOR ALL
TO authenticated
USING (cliente_id = public.fn_usuario_id_actual())
WITH CHECK (cliente_id = public.fn_usuario_id_actual());

DROP POLICY IF EXISTS favoritos_all_service_role ON public.favoritos;
CREATE POLICY favoritos_all_service_role
ON public.favoritos
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── calificaciones ────────────────────────────────────────────────────────────

ALTER TABLE public.calificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calificaciones_select_admin ON public.calificaciones;
CREATE POLICY calificaciones_select_admin
ON public.calificaciones
FOR SELECT
TO authenticated
USING (public.fn_usuario_es_admin());

DROP POLICY IF EXISTS calificaciones_manage_admin ON public.calificaciones;
CREATE POLICY calificaciones_manage_admin
ON public.calificaciones
FOR ALL
TO authenticated
USING (public.fn_usuario_es_admin())
WITH CHECK (public.fn_usuario_es_admin());

DROP POLICY IF EXISTS calificaciones_all_service_role ON public.calificaciones;
CREATE POLICY calificaciones_all_service_role
ON public.calificaciones
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── notificaciones (legacy admin / broadcast) ───────────────────────────────

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notificaciones_select ON public.notificaciones;
DROP POLICY IF EXISTS notificaciones_manage ON public.notificaciones;
DROP POLICY IF EXISTS notificaciones_select_admin ON public.notificaciones;
CREATE POLICY notificaciones_select_admin
ON public.notificaciones
FOR SELECT
TO authenticated
USING (public.fn_usuario_es_admin());

DROP POLICY IF EXISTS notificaciones_manage_admin ON public.notificaciones;
CREATE POLICY notificaciones_manage_admin
ON public.notificaciones
FOR ALL
TO authenticated
USING (public.fn_usuario_es_admin())
WITH CHECK (public.fn_usuario_es_admin());

DROP POLICY IF EXISTS notificaciones_all_service_role ON public.notificaciones;
CREATE POLICY notificaciones_all_service_role
ON public.notificaciones
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── imagenes_evento ─────────────────────────────────────────────────────────

ALTER TABLE public.imagenes_evento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imagenes_evento_select_public ON public.imagenes_evento;
CREATE POLICY imagenes_evento_select_public
ON public.imagenes_evento
FOR SELECT
TO anon, authenticated
USING (
  public.fn_evento_visible_publico(evento_id)
  OR public.fn_usuario_puede_gestionar_evento(evento_id)
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS imagenes_evento_manage_owner ON public.imagenes_evento;
CREATE POLICY imagenes_evento_manage_owner
ON public.imagenes_evento
FOR ALL
TO authenticated
USING (
  public.fn_usuario_puede_gestionar_evento(evento_id)
  OR public.fn_usuario_es_admin()
)
WITH CHECK (
  public.fn_usuario_puede_gestionar_evento(evento_id)
  OR public.fn_usuario_es_admin()
);

DROP POLICY IF EXISTS imagenes_evento_all_service_role ON public.imagenes_evento;
CREATE POLICY imagenes_evento_all_service_role
ON public.imagenes_evento
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ─── sesiones (token sensible: sin acceso vía API cliente) ───────────────────

ALTER TABLE public.sesiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sesiones_all_service_role ON public.sesiones;
CREATE POLICY sesiones_all_service_role
ON public.sesiones
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
