-- Lectores deben poder buscar y redimir productos en puerta.
-- 042 endureció RLS en compras_productos / items sin incluir al rol lector
-- (boletas sí quedaron cubiertas en 043 vía fn_usuario_es_lector).

-- ─── compras_productos: SELECT para lector ───────────────────────────────────

DROP POLICY IF EXISTS compras_productos_select ON public.compras_productos;
CREATE POLICY compras_productos_select
ON public.compras_productos
FOR SELECT
TO authenticated
USING (
  cliente_id = public.fn_usuario_id_actual()
  OR public.fn_usuario_puede_gestionar_evento(evento_id)
  OR public.fn_usuario_es_admin()
  OR public.fn_usuario_es_lector()
);

-- ─── compras_productos_items: SELECT + UPDATE para lector ────────────────────

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
        OR public.fn_usuario_es_lector()
      )
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
        OR public.fn_usuario_es_lector()
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
        OR public.fn_usuario_es_lector()
      )
  )
);
