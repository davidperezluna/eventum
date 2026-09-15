-- Escaneo de entradas fantasma: misma visibilidad que boletas comerciales para
-- admin/lector/organizador. El permiso fino de puerta sigue en el frontend;
-- la validación en BD acepta admin o cualquier lector autenticado (como 043).

DROP POLICY IF EXISTS boletas_fantasma_lectura ON public.boletas_compradas;
CREATE POLICY boletas_fantasma_lectura
ON public.boletas_compradas
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (
  compra_fantasma_id IS NULL
  OR (
    auth.uid() IS NOT NULL
    AND (
      titular_cliente_id = (SELECT public.fn_usuario_id_actual())
      OR public.fn_usuario_es_admin()
      OR public.fn_usuario_es_lector()
      OR EXISTS (
        SELECT 1
        FROM public.tipos_boleta tb
        WHERE tb.id = tipo_boleta_id
          AND public.fn_usuario_puede_gestionar_evento(tb.evento_id)
      )
    )
  )
);

CREATE OR REPLACE FUNCTION fantasma_private.puede_escanear(p_tipo integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.fn_usuario_es_admin()
      OR public.fn_usuario_es_lector()
    );
$$;

REVOKE ALL ON FUNCTION fantasma_private.puede_escanear(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION fantasma_private.puede_escanear(integer) TO authenticated;
