-- Notificaciones realtime: salida cover (además de entrada en 018).
-- Un solo trigger en boletas_cover para entrada (→ dentro) y salida (dentro → fuera/consumida).

CREATE OR REPLACE FUNCTION public.fn_notificar_cover_acceso()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_objetivo BIGINT;
  v_lugar_id BIGINT;
  v_lugar_nombre TEXT;
  v_tipo_cover_nombre TEXT;
  v_sesion_fecha DATE;
  v_permite_reingreso BOOLEAN;
BEGIN
  IF NEW.estado_acceso IS NOT DISTINCT FROM OLD.estado_acceso THEN
    RETURN NEW;
  END IF;

  SELECT cc.cliente_id, cc.lugar_id
    INTO v_usuario_objetivo, v_lugar_id
  FROM public.compras_cover cc
  WHERE cc.id = NEW.compra_cover_id;

  IF NEW.titular_cliente_id IS NOT NULL THEN
    v_usuario_objetivo := NEW.titular_cliente_id;
  END IF;

  IF v_usuario_objetivo IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.nombre INTO v_lugar_nombre FROM public.lugares l WHERE l.id = v_lugar_id;
  SELECT tc.nombre, coalesce(tc.permite_reingreso, true)
    INTO v_tipo_cover_nombre, v_permite_reingreso
  FROM public.tipos_cover tc WHERE tc.id = NEW.tipo_cover_id;
  SELECT sc.fecha INTO v_sesion_fecha FROM public.sesiones_cover sc WHERE sc.id = NEW.sesion_cover_id;

  -- Entrada en puerta
  IF NEW.estado_acceso = 'dentro' THEN
    INSERT INTO public.notificaciones_usuario (usuario_id, tipo, titulo, mensaje, metadata)
    VALUES (
      v_usuario_objetivo,
      'cover_entrada_registrada',
      'Entrada al club registrada',
      COALESCE(
        'Tu cover "' || COALESCE(v_tipo_cover_nombre, 'Cover') || '" en "' ||
        COALESCE(v_lugar_nombre, 'Club') || '" fue registrada en puerta.',
        'Tu entrada de cover fue registrada en puerta.'
      ),
      jsonb_build_object(
        'boleta_cover_id', NEW.id,
        'compra_cover_id', NEW.compra_cover_id,
        'lugar_id', v_lugar_id,
        'lugar_nombre', v_lugar_nombre,
        'tipo_cover_id', NEW.tipo_cover_id,
        'tipo_cover_nombre', v_tipo_cover_nombre,
        'sesion_cover_id', NEW.sesion_cover_id,
        'sesion_fecha', v_sesion_fecha,
        'codigo_qr', NEW.codigo_qr,
        'estado_acceso', NEW.estado_acceso,
        'ultima_entrada_at', NEW.ultima_entrada_at,
        'entradas_count', NEW.entradas_count
      )
    );
  END IF;

  -- Salida en puerta (desde dentro)
  IF OLD.estado_acceso = 'dentro' AND NEW.estado_acceso IN ('fuera', 'consumida') THEN
    INSERT INTO public.notificaciones_usuario (usuario_id, tipo, titulo, mensaje, metadata)
    VALUES (
      v_usuario_objetivo,
      'cover_salida_registrada',
      'Salida del club registrada',
      CASE
        WHEN NEW.estado_acceso = 'fuera' AND v_permite_reingreso THEN
          'Tu salida de "' || COALESCE(v_lugar_nombre, 'Club') || '" fue registrada. Puedes reingresar con el mismo QR.'
        WHEN NEW.estado_acceso = 'consumida' THEN
          'Tu salida de "' || COALESCE(v_lugar_nombre, 'Club') || '" fue registrada. Esta entrada ya fue consumida.'
        ELSE
          'Tu salida del cover en "' || COALESCE(v_lugar_nombre, 'Club') || '" fue registrada en puerta.'
      END,
      jsonb_build_object(
        'boleta_cover_id', NEW.id,
        'compra_cover_id', NEW.compra_cover_id,
        'lugar_id', v_lugar_id,
        'lugar_nombre', v_lugar_nombre,
        'tipo_cover_id', NEW.tipo_cover_id,
        'tipo_cover_nombre', v_tipo_cover_nombre,
        'sesion_cover_id', NEW.sesion_cover_id,
        'sesion_fecha', v_sesion_fecha,
        'codigo_qr', NEW.codigo_qr,
        'estado_acceso', NEW.estado_acceso,
        'permite_reingreso', v_permite_reingreso,
        'ultima_salida_at', NEW.ultima_salida_at,
        'salidas_count', NEW.salidas_count
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_cover_entrada_registrada ON public.boletas_cover;
DROP TRIGGER IF EXISTS trg_notificar_cover_acceso ON public.boletas_cover;
DROP FUNCTION IF EXISTS public.fn_notificar_cover_entrada_registrada();

CREATE TRIGGER trg_notificar_cover_acceso
AFTER UPDATE ON public.boletas_cover
FOR EACH ROW
EXECUTE FUNCTION public.fn_notificar_cover_acceso();
