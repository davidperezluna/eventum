-- Permite que un comprador vea los datos de un evento cancelado.
-- Sin esta excepción, eventos_select_public oculta el evento y los embeds
-- eventos(...) de compras/boletas llegan como null en /mis-compras.

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
        OR EXISTS (
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
  );
$$;

-- Permite resolver el contacto del organizador únicamente para compradores
-- vinculados a uno de sus eventos.
DROP POLICY IF EXISTS usuarios_select_organizador_comprado ON public.usuarios;
CREATE POLICY usuarios_select_organizador_comprado
ON public.usuarios
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.compras c
    JOIN public.eventos e ON e.id = c.evento_id
    WHERE c.cliente_id = public.fn_usuario_id_actual()
      AND e.organizador_id = usuarios.id
  )
);
