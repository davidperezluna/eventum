-- ============================================================
-- 004_palcos_checkout_reservas.sql
-- Soporte dual de reservas de palcos:
-- - legado por compra_id
-- - checkout unificado por transaccion_checkout_id
-- ============================================================

-- 1) Columna de referencia al intento de checkout (aditiva, no rompe legado).
ALTER TABLE public.palcos
  ADD COLUMN IF NOT EXISTS transaccion_checkout_id BIGINT
  REFERENCES public.transacciones_checkout(id)
  ON DELETE SET NULL;

-- 2) Evitar ambiguedad: un palco reservado pertenece a compra o checkout, no ambos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'palcos_compra_xor_checkout'
      AND conrelid = 'public.palcos'::regclass
  ) THEN
    ALTER TABLE public.palcos
      ADD CONSTRAINT palcos_compra_xor_checkout
      CHECK (
        NOT (compra_id IS NOT NULL AND transaccion_checkout_id IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_palcos_transaccion_checkout_id
  ON public.palcos(transaccion_checkout_id)
  WHERE transaccion_checkout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_palcos_estado_checkout
  ON public.palcos(estado, transaccion_checkout_id)
  WHERE transaccion_checkout_id IS NOT NULL;

-- 3) Reservar palcos por checkout (holds temporales del flujo unificado).
CREATE OR REPLACE FUNCTION public.reservar_palcos_checkout(
  p_transaccion_checkout_id BIGINT,
  p_palco_ids BIGINT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_expected_count INT;
  v_updated_count INT;
BEGIN
  IF p_transaccion_checkout_id IS NULL OR p_transaccion_checkout_id <= 0 THEN
    RAISE EXCEPTION 'p_transaccion_checkout_id es requerido';
  END IF;

  IF p_palco_ids IS NULL OR array_length(p_palco_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_palco_ids no puede estar vacio';
  END IF;

  SELECT count(DISTINCT x) INTO v_expected_count
  FROM unnest(p_palco_ids) AS x
  WHERE x IS NOT NULL;

  IF coalesce(v_expected_count, 0) = 0 THEN
    RAISE EXCEPTION 'p_palco_ids no puede estar vacio';
  END IF;

  UPDATE public.palcos p
  SET
    estado = 'reservado',
    compra_id = NULL,
    transaccion_checkout_id = p_transaccion_checkout_id,
    fecha_actualizacion = v_now
  WHERE p.id = ANY(p_palco_ids)
    AND p.estado = 'disponible'
    AND p.compra_id IS NULL
    AND p.transaccion_checkout_id IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count <> v_expected_count THEN
    -- Revertir reserva parcial para mantener atomicidad funcional.
    UPDATE public.palcos
    SET
      estado = 'disponible',
      transaccion_checkout_id = NULL,
      fecha_actualizacion = v_now
    WHERE transaccion_checkout_id = p_transaccion_checkout_id
      AND compra_id IS NULL;

    RAISE EXCEPTION 'No todos los palcos estaban disponibles para reservar (%)', v_updated_count;
  END IF;
END;
$$;

-- 4) Liberar reservas de checkout (fallo/expiracion/abandono).
CREATE OR REPLACE FUNCTION public.cancelar_reserva_palcos_checkout(
  p_transaccion_checkout_id BIGINT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released INT := 0;
BEGIN
  IF p_transaccion_checkout_id IS NULL OR p_transaccion_checkout_id <= 0 THEN
    RAISE EXCEPTION 'p_transaccion_checkout_id es requerido';
  END IF;

  UPDATE public.palcos
  SET
    estado = 'disponible',
    compra_id = NULL,
    transaccion_checkout_id = NULL,
    fecha_actualizacion = now()
  WHERE transaccion_checkout_id = p_transaccion_checkout_id
    AND compra_id IS NULL;

  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

-- 5) Materializar reserva: mover hold de checkout a compra definitiva (APPROVED).
CREATE OR REPLACE FUNCTION public.materializar_reserva_palcos_checkout(
  p_transaccion_checkout_id BIGINT,
  p_compra_id BIGINT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moved INT := 0;
BEGIN
  IF p_transaccion_checkout_id IS NULL OR p_transaccion_checkout_id <= 0 THEN
    RAISE EXCEPTION 'p_transaccion_checkout_id es requerido';
  END IF;
  IF p_compra_id IS NULL OR p_compra_id <= 0 THEN
    RAISE EXCEPTION 'p_compra_id es requerido';
  END IF;

  UPDATE public.palcos
  SET
    compra_id = p_compra_id,
    transaccion_checkout_id = NULL,
    fecha_actualizacion = now()
  WHERE transaccion_checkout_id = p_transaccion_checkout_id
    AND estado = 'reservado';

  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_palcos_checkout(BIGINT, BIGINT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancelar_reserva_palcos_checkout(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.materializar_reserva_palcos_checkout(BIGINT, BIGINT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reservar_palcos_checkout(BIGINT, BIGINT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_reserva_palcos_checkout(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.materializar_reserva_palcos_checkout(BIGINT, BIGINT) TO authenticated, service_role;

COMMENT ON COLUMN public.palcos.transaccion_checkout_id IS
  'Reserva temporal de palco asociada a un intento de checkout unificado.';
