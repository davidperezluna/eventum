-- ============================================================
-- Eventum Showcase — reset manual antes de una demo comercial
-- Ejecutar en Supabase SQL Editor (como admin / service role).
-- ============================================================
--
-- SETUP INICIAL (una sola vez):
-- 1. Crear usuario Auth con email showcase@eventumcol.com
-- 2. Insertar fila en public.usuarios:
--      tipo_usuario_id = 2 (Organizador)
--      nombre = 'Eventum Showcase'
--      activo = true
-- 3. Anotar usuarios.id → configurar showcaseOrganizadorId en environment.*
--    y secret SHOWCASE_ORGANIZADOR_ID en Supabase Edge Functions.
--
-- ============================================================

-- ⚠️ Reemplazar 0 por el ID real del organizador showcase
DO $$
DECLARE
  v_showcase_organizador_id BIGINT := 2561;
BEGIN
  IF v_showcase_organizador_id <= 0 THEN
    RAISE EXCEPTION 'Configura v_showcase_organizador_id con el ID real del usuario Eventum Showcase';
  END IF;

  CREATE TEMP TABLE tmp_showcase_eventos ON COMMIT DROP AS
  SELECT id FROM public.eventos
  WHERE organizador_id = v_showcase_organizador_id;

  CREATE TEMP TABLE tmp_showcase_tipos_boleta ON COMMIT DROP AS
  SELECT id FROM public.tipos_boleta
  WHERE evento_id IN (SELECT id FROM tmp_showcase_eventos);

  DELETE FROM public.transacciones_checkout
  WHERE evento_id IN (SELECT id FROM tmp_showcase_eventos);

  -- Palcos: inventario numerado ligado a tipos_boleta (no tienen evento_id directo).
  UPDATE public.palcos
  SET
    estado = 'disponible',
    compra_id = NULL,
    transaccion_checkout_id = NULL,
    fecha_actualizacion = now()
  WHERE tipo_boleta_id IN (SELECT id FROM tmp_showcase_tipos_boleta);

  DELETE FROM public.compras_productos
  WHERE evento_id IN (SELECT id FROM tmp_showcase_eventos);

  DELETE FROM public.boletas_compradas
  WHERE compra_id IN (
    SELECT id FROM public.compras
    WHERE evento_id IN (SELECT id FROM tmp_showcase_eventos)
  );

  DELETE FROM public.compras
  WHERE evento_id IN (SELECT id FROM tmp_showcase_eventos);

  DELETE FROM public.productos
  WHERE evento_id IN (SELECT id FROM tmp_showcase_eventos);

  DELETE FROM public.palcos
  WHERE tipo_boleta_id IN (SELECT id FROM tmp_showcase_tipos_boleta);

  DELETE FROM public.tipos_boleta
  WHERE evento_id IN (SELECT id FROM tmp_showcase_eventos);

  DELETE FROM public.cupones_descuento
  WHERE evento_id IN (SELECT id FROM tmp_showcase_eventos);

  DELETE FROM public.eventos
  WHERE organizador_id = v_showcase_organizador_id;
END $$;

-- ============================================================
-- OPCIONAL: evento plantilla "Concierto Demo Eventum"
-- Ajustar categoria_id, lugar_id y fechas antes de ejecutar.
-- ============================================================
/*
INSERT INTO public.eventos (
  titulo,
  descripcion_corta,
  organizador_id,
  categoria_id,
  lugar_id,
  fecha_inicio,
  fecha_fin,
  fecha_venta_inicio,
  fecha_venta_fin,
  estado,
  activo,
  es_gratis,
  porcentaje_servicio,
  fecha_creacion,
  fecha_actualizacion
) VALUES (
  'Concierto Demo Eventum',
  'Evento de demostración — no visible en catálogo público.',
  0, -- showcase_organizador_id
  1,
  1,
  now() + interval '30 days',
  now() + interval '30 days 4 hours',
  now(),
  now() + interval '29 days',
  'borrador',
  false,
  false,
  10,
  now(),
  now()
)
RETURNING id;

-- Sustituir {evento_id} por el id devuelto:
INSERT INTO public.tipos_boleta (evento_id, nombre, precio, cantidad_total, activo, fecha_creacion, fecha_actualizacion)
VALUES
  ({evento_id}, 'General', 50000, 100, true, now(), now()),
  ({evento_id}, 'VIP', 120000, 20, true, now(), now());
*/

-- Storage (opcional): borrar imágenes bajo bucket eventos/{showcase_user_uuid}/
