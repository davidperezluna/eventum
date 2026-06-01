-- Permite guardar el pedido en transacciones_producto antes del pago exitoso
ALTER TABLE public.transacciones_producto
  ALTER COLUMN compra_producto_id DROP NOT NULL;

ALTER TABLE public.transacciones_producto
  ADD COLUMN IF NOT EXISTS evento_id BIGINT REFERENCES public.eventos(id),
  ADD COLUMN IF NOT EXISTS cliente_id BIGINT REFERENCES public.usuarios(id);

CREATE INDEX IF NOT EXISTS idx_transacciones_producto_evento
  ON public.transacciones_producto(evento_id);

COMMENT ON COLUMN public.transacciones_producto.compra_producto_id IS
  'NULL hasta que el pago Wompi sea APPROVED; entonces se crea compras_productos.';
