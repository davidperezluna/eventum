-- Precio diferenciado para incentivar compra anticipada.
-- `precio` queda como preventa y `precio_evento` aplica durante el evento.

ALTER TABLE public.productos
ADD COLUMN IF NOT EXISTS precio_evento NUMERIC(12, 2) CHECK (precio_evento IS NULL OR precio_evento >= 0);

-- Para no romper lecturas existentes, inicializar con el mismo valor actual.
UPDATE public.productos
SET precio_evento = precio
WHERE precio_evento IS NULL;
