-- Los lectores autorizados deben poder resolver los datos del evento
-- cancelado al escanear una boleta para devolución.
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
        (coalesce(e.activo, false) = true
          AND e.estado::text = ANY (ARRAY['publicado', 'en_curso']))
        OR e.estado::text = 'finalizado'
        OR EXISTS (
          SELECT 1 FROM public.compras c
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
        OR EXISTS (
          SELECT 1
          FROM public.lector_evento_tipo_boleta letb
          WHERE letb.usuario_id = public.fn_usuario_id_actual()
            AND letb.evento_id = e.id
        )
      )
  );
$$;
