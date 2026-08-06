-- ============================================================
-- Eventum — borrar TODAS las compras (dev / reset de datos)
-- Ejecutar en Supabase SQL Editor (service role / postgres).
-- ============================================================
--
-- Elimina:
--   • Compras de boletas y palcos     → compras, boletas_compradas
--   • Compras de productos            → compras_productos (+ items, transacciones)
--   • Compras de covers               → compras_cover, boletas_cover, accesos_cover
--   • Intentos de pago / checkout     → transacciones_checkout, transacciones_producto
--   • Traslados ligados a boletas     → traslados_boleta (vía CASCADE)
--
-- NO elimina catálogo (eventos, tipos_boleta, productos, palcos, tipos cover).
-- Sí reinicia inventario vendido/reservado para poder volver a vender.
--
-- ⚠️ IRREVERSIBLE. Haz backup antes en producción.
-- ============================================================

DO $$
DECLARE
  -- ⚠️ Cambiar a TRUE solo cuando estés seguro de borrar todo.
  v_confirmar BOOLEAN := false;

  v_palcos_liberados INT;
  v_tx_checkout INT;
  v_compras_productos INT;
  v_boletas INT;
  v_compras INT;
  v_compras_cover INT;
  v_notificaciones INT;
BEGIN
  IF NOT v_confirmar THEN
    RAISE EXCEPTION
      'Seguridad: configura v_confirmar := true al inicio del bloque para ejecutar el borrado total de compras';
  END IF;

  SELECT count(*) INTO v_tx_checkout FROM public.transacciones_checkout;
  SELECT count(*) INTO v_compras_productos FROM public.compras_productos;
  SELECT count(*) INTO v_boletas FROM public.boletas_compradas;
  SELECT count(*) INTO v_compras FROM public.compras;
  SELECT count(*) INTO v_compras_cover FROM public.compras_cover;

  RAISE NOTICE '=== Borrado total de compras — conteo previo ===';
  RAISE NOTICE 'transacciones_checkout : %', v_tx_checkout;
  RAISE NOTICE 'compras_productos        : %', v_compras_productos;
  RAISE NOTICE 'boletas_compradas        : %', v_boletas;
  RAISE NOTICE 'compras (boletas/palcos) : %', v_compras;
  RAISE NOTICE 'compras_cover            : %', v_compras_cover;

  -- 1) Palcos: liberar vendidos/reservados antes de borrar compras (evita FK / estado inconsistente).
  UPDATE public.palcos
  SET
    estado = 'disponible',
    compra_id = NULL,
    transaccion_checkout_id = NULL,
    fecha_actualizacion = now()
  WHERE compra_id IS NOT NULL
     OR transaccion_checkout_id IS NOT NULL
     OR estado IN ('vendido', 'reservado');

  GET DIAGNOSTICS v_palcos_liberados = ROW_COUNT;
  RAISE NOTICE 'Palcos liberados         : %', v_palcos_liberados;

  -- 2) Intentos de checkout unificado (boletas / productos / mixto / cover).
  DELETE FROM public.transacciones_checkout;

  -- 3) Compras de productos (+ compras_productos_items, transacciones_producto en CASCADE).
  DELETE FROM public.compras_productos;

  -- 4) Boletas individuales (+ traslados_boleta con boleta_id en CASCADE).
  DELETE FROM public.boletas_compradas;

  -- 5) Cabeceras de compra de eventos (boletas / palcos no numerados).
  DELETE FROM public.compras;

  -- 6) Covers (+ boletas_cover, accesos_cover, traslados_boleta cover en CASCADE).
  DELETE FROM public.compras_cover;

  -- 7) Reiniciar contadores de inventario (catálogo intacto).
  UPDATE public.productos
  SET
    cantidad_vendidas = 0,
    fecha_actualizacion = now()
  WHERE cantidad_vendidas <> 0;

  UPDATE public.tipos_boleta
  SET
    cantidad_vendidas = 0,
    cantidad_disponibles = cantidad_total
  WHERE cantidad_vendidas <> 0
     OR cantidad_disponibles IS DISTINCT FROM cantidad_total;

  -- 8) Notificaciones derivadas de compras / escaneos (opcional pero recomendado en dev).
  DELETE FROM public.notificaciones_usuario
  WHERE tipo IN (
    'entrada_validada',
    'productos_redimidos',
    'cover_entrada_registrada',
    'cover_salida_registrada',
    'cover_asignado_manual'
  );

  GET DIAGNOSTICS v_notificaciones = ROW_COUNT;

  RAISE NOTICE '=== Borrado completado ===';
  RAISE NOTICE 'Notificaciones eliminadas: %', v_notificaciones;
  RAISE NOTICE 'Verifica: SELECT count(*) FROM compras;  -- debe ser 0';
END $$;
