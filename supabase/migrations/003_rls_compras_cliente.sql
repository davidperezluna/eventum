-- ============================================================
-- RLS: flujo de compra cliente (boletas + productos)
-- Ejecutar en Supabase → SQL Editor
-- Corrige: "new row violates row-level security policy for table compras"
-- ============================================================

-- Vincula auth.uid() con public.usuarios.id
CREATE OR REPLACE FUNCTION public.auth_usuario_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_staff_usuario()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.tipo_usuario_id IN (2, 3, 4) -- organizador, admin, lector
  );
$$;

CREATE OR REPLACE FUNCTION public.is_organizador_evento(p_evento_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.eventos e
    WHERE e.id = p_evento_id
      AND e.organizador_id = public.auth_usuario_id()
  );
$$;

-- ── compras (boletas/palcos) ─────────────────────────────────

ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compras_select_own ON public.compras;
CREATE POLICY compras_select_own ON public.compras
  FOR SELECT TO authenticated
  USING (
    cliente_id = public.auth_usuario_id()
    OR public.is_staff_usuario()
    OR public.is_organizador_evento(evento_id)
  );

DROP POLICY IF EXISTS compras_insert_own ON public.compras;
CREATE POLICY compras_insert_own ON public.compras
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND cliente_id = public.auth_usuario_id()
  );

DROP POLICY IF EXISTS compras_update_own ON public.compras;
CREATE POLICY compras_update_own ON public.compras
  FOR UPDATE TO authenticated
  USING (
    cliente_id = public.auth_usuario_id()
    OR public.is_staff_usuario()
  )
  WITH CHECK (
    cliente_id = public.auth_usuario_id()
    OR public.is_staff_usuario()
  );

DROP POLICY IF EXISTS compras_delete_own_pending ON public.compras;
CREATE POLICY compras_delete_own_pending ON public.compras
  FOR DELETE TO authenticated
  USING (
    cliente_id = public.auth_usuario_id()
    AND estado_pago = 'pendiente'
  );

-- ── boletas_compradas ────────────────────────────────────────

ALTER TABLE public.boletas_compradas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS boletas_select_cliente ON public.boletas_compradas;
CREATE POLICY boletas_select_cliente ON public.boletas_compradas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.compras c
      WHERE c.id = boletas_compradas.compra_id
        AND (
          c.cliente_id = public.auth_usuario_id()
          OR public.is_staff_usuario()
          OR public.is_organizador_evento(c.evento_id)
        )
    )
    OR titular_cliente_id = public.auth_usuario_id()
  );

DROP POLICY IF EXISTS boletas_insert_own_compra ON public.boletas_compradas;
CREATE POLICY boletas_insert_own_compra ON public.boletas_compradas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.compras c
      WHERE c.id = compra_id
        AND c.cliente_id = public.auth_usuario_id()
    )
  );

DROP POLICY IF EXISTS boletas_update_cliente ON public.boletas_compradas;
CREATE POLICY boletas_update_cliente ON public.boletas_compradas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.compras c
      WHERE c.id = boletas_compradas.compra_id
        AND (
          c.cliente_id = public.auth_usuario_id()
          OR public.is_staff_usuario()
        )
    )
    OR titular_cliente_id = public.auth_usuario_id()
  )
  WITH CHECK (true);

-- ── compras_productos ────────────────────────────────────────

ALTER TABLE public.compras_productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compras_productos_select_own ON public.compras_productos;
CREATE POLICY compras_productos_select_own ON public.compras_productos
  FOR SELECT TO authenticated
  USING (
    cliente_id = public.auth_usuario_id()
    OR public.is_staff_usuario()
    OR public.is_organizador_evento(evento_id)
  );

DROP POLICY IF EXISTS compras_productos_insert_own ON public.compras_productos;
CREATE POLICY compras_productos_insert_own ON public.compras_productos
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND cliente_id = public.auth_usuario_id()
  );

DROP POLICY IF EXISTS compras_productos_update_own ON public.compras_productos;
CREATE POLICY compras_productos_update_own ON public.compras_productos
  FOR UPDATE TO authenticated
  USING (
    cliente_id = public.auth_usuario_id()
    OR public.is_staff_usuario()
  )
  WITH CHECK (
    cliente_id = public.auth_usuario_id()
    OR public.is_staff_usuario()
  );

DROP POLICY IF EXISTS compras_productos_delete_own_pending ON public.compras_productos;
CREATE POLICY compras_productos_delete_own_pending ON public.compras_productos
  FOR DELETE TO authenticated
  USING (
    cliente_id = public.auth_usuario_id()
    AND estado_pago = 'pendiente'
  );

-- ── compras_productos_items ────────────────────────────────────

ALTER TABLE public.compras_productos_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compras_productos_items_select_own ON public.compras_productos_items;
CREATE POLICY compras_productos_items_select_own ON public.compras_productos_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.compras_productos cp
      WHERE cp.id = compra_producto_id
        AND (
          cp.cliente_id = public.auth_usuario_id()
          OR public.is_staff_usuario()
          OR public.is_organizador_evento(cp.evento_id)
        )
    )
  );

DROP POLICY IF EXISTS compras_productos_items_insert_own ON public.compras_productos_items;
CREATE POLICY compras_productos_items_insert_own ON public.compras_productos_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.compras_productos cp
      WHERE cp.id = compra_producto_id
        AND cp.cliente_id = public.auth_usuario_id()
    )
  );

-- ── transacciones_producto (lectura cliente) ───────────────────

ALTER TABLE public.transacciones_producto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transacciones_producto_select_own ON public.transacciones_producto;
CREATE POLICY transacciones_producto_select_own ON public.transacciones_producto
  FOR SELECT TO authenticated
  USING (
    public.is_staff_usuario()
    OR EXISTS (
      SELECT 1
      FROM public.compras_productos cp
      WHERE cp.id = transacciones_producto.compra_producto_id
        AND cp.cliente_id = public.auth_usuario_id()
    )
    OR (
      transacciones_producto.compra_producto_id IS NULL
      AND transacciones_producto.cliente_id = public.auth_usuario_id()
    )
  );

COMMENT ON FUNCTION public.auth_usuario_id IS
  'Devuelve usuarios.id del usuario autenticado (auth.uid → auth_user_id).';
