-- QR para redencion de productos en evento

ALTER TABLE public.compras_productos_items
ADD COLUMN IF NOT EXISTS codigo_qr TEXT;

ALTER TABLE public.compras_productos_items
ALTER COLUMN codigo_qr SET DEFAULT (
  'PROD-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 20))
);

UPDATE public.compras_productos_items
SET codigo_qr = 'PROD-' || UPPER(SUBSTRING(MD5(id::TEXT || '-' || RANDOM()::TEXT || '-' || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 20))
WHERE codigo_qr IS NULL;

ALTER TABLE public.compras_productos_items
ALTER COLUMN codigo_qr SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_compras_productos_items_codigo_qr
  ON public.compras_productos_items(codigo_qr);

ALTER TABLE public.compras_productos_items
ADD COLUMN IF NOT EXISTS fecha_redencion TIMESTAMPTZ;

ALTER TABLE public.compras_productos_items
ADD COLUMN IF NOT EXISTS validado_por_usuario_id BIGINT REFERENCES public.usuarios(id);
