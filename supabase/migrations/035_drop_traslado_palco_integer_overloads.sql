-- 035: Eliminar overloads INTEGER duplicados de RPCs de traslado de boleta/palco.
-- PostgREST (PGRST203) no puede resolver bigint vs integer al llamar desde el cliente.
-- La versión canónica usa BIGINT (ids de boletas_compradas / traslados_boleta).

DROP FUNCTION IF EXISTS public.fn_traslado_boleta_palco_activo(INTEGER);
DROP FUNCTION IF EXISTS public.rellenar_asistente_palco_desde_perfil(INTEGER);
DROP FUNCTION IF EXISTS public.iniciar_traslado_boleta_palco(INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.marcar_traslado_boleta_recibido(INTEGER);
DROP FUNCTION IF EXISTS public.aceptar_traslado_boleta_palco(INTEGER);
DROP FUNCTION IF EXISTS public.rechazar_traslado_boleta_palco(INTEGER);
DROP FUNCTION IF EXISTS public.cancelar_traslado_boleta_palco(INTEGER);

-- Reafirmar permisos sobre la firma BIGINT (034 las crea; idempotente si ya existen).
GRANT EXECUTE ON FUNCTION public.rellenar_asistente_palco_desde_perfil(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_traslado_boleta_palco(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_traslado_boleta_recibido(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aceptar_traslado_boleta_palco(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rechazar_traslado_boleta_palco(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_traslado_boleta_palco(BIGINT) TO authenticated;
