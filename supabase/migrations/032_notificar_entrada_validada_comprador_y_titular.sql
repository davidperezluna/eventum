-- Al validar una boleta, notificar al titular (o al comprador si no hay titular).
-- Nota: una versión intermedia duplicaba titular+comprador; quedó unificado aquí y en 033.

CREATE OR REPLACE FUNCTION public.fn_notificar_entrada_validada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_objetivo BIGINT;
  v_evento_id BIGINT;
  v_evento_titulo TEXT;
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado = 'usada' THEN
    SELECT c.cliente_id, c.evento_id
      INTO v_usuario_objetivo, v_evento_id
    FROM public.compras c
    WHERE c.id = NEW.compra_id;

    IF NEW.titular_cliente_id IS NOT NULL THEN
      v_usuario_objetivo := NEW.titular_cliente_id;
    END IF;

    SELECT e.titulo
      INTO v_evento_titulo
    FROM public.eventos e
    WHERE e.id = v_evento_id;

    IF v_usuario_objetivo IS NOT NULL THEN
      INSERT INTO public.notificaciones_usuario (
        usuario_id,
        tipo,
        titulo,
        mensaje,
        metadata
      )
      VALUES (
        v_usuario_objetivo,
        'entrada_validada',
        'Entrada validada',
        COALESCE(
          'Tu entrada del evento "' || COALESCE(v_evento_titulo, 'Evento') || '" fue validada en puerta.',
          'Tu entrada fue validada en puerta.'
        ),
        jsonb_build_object(
          'boleta_id', NEW.id,
          'compra_id', NEW.compra_id,
          'evento_id', v_evento_id,
          'codigo_qr', NEW.codigo_qr,
          'estado', NEW.estado,
          'fecha_uso', NEW.fecha_uso
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
