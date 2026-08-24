-- Los eventos pagos deben cobrar al menos 8 % de servicio en ventas online.
UPDATE public.eventos
SET porcentaje_servicio = 8
WHERE es_gratis IS NOT TRUE
  AND COALESCE(porcentaje_servicio, 0) < 8;

ALTER TABLE public.eventos
DROP CONSTRAINT IF EXISTS eventos_porcentaje_servicio_online_check;

ALTER TABLE public.eventos
ADD CONSTRAINT eventos_porcentaje_servicio_online_check
CHECK (
  es_gratis IS TRUE
  OR (porcentaje_servicio IS NOT NULL AND porcentaje_servicio BETWEEN 8 AND 100)
);

COMMENT ON COLUMN public.eventos.porcentaje_servicio IS
  'Porcentaje de servicio en ventas online. Para eventos pagos debe estar entre 8 y 100; los gratuitos usan 0.';
