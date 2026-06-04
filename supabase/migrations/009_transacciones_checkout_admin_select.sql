-- Permite lectura de transacciones_checkout para administradores.
-- Sin esta politica, la tabla queda restringida al cliente dueno de cada transaccion.

DROP POLICY IF EXISTS tx_checkout_select_admin ON public.transacciones_checkout;

CREATE POLICY tx_checkout_select_admin
ON public.transacciones_checkout
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.tipo_usuario_id = 3
      AND u.activo = true
  )
);
