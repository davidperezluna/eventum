-- Devuelve únicamente el teléfono del organizador de un evento comprado
-- por el usuario actual. SECURITY DEFINER evita recursión entre RLS de
-- usuarios, compras y eventos.

CREATE OR REPLACE FUNCTION public.obtener_contacto_organizador_evento(p_evento_id BIGINT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.telefono
  FROM public.eventos e
  JOIN public.usuarios u ON u.id = e.organizador_id
  WHERE e.id = p_evento_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.compras c
        WHERE c.evento_id = e.id
          AND c.cliente_id = public.fn_usuario_id_actual()
      )
      OR EXISTS (
        SELECT 1
        FROM public.boletas_compradas b
        JOIN public.tipos_boleta tb ON tb.id = b.tipo_boleta_id
        WHERE tb.evento_id = e.id
          AND b.titular_cliente_id = public.fn_usuario_id_actual()
      )
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.obtener_contacto_organizador_evento(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_contacto_organizador_evento(BIGINT) TO authenticated;
