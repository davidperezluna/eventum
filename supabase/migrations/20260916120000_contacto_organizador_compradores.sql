-- Permite que un comprador resuelva el contacto del organizador
-- únicamente cuando tiene una compra asociada a uno de sus eventos.

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
