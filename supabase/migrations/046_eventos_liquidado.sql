-- Flag financiero: evento liquidado (cerrado contablemente).
-- Dashboards globales solo suman liquidado = false.
-- Inteligencia por eventoId sigue mostrando el histórico.

ALTER TABLE public.eventos
  ADD COLUMN IF NOT EXISTS liquidado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.eventos.liquidado IS
  'Cierre financiero. false = cuenta en dashboards globales; true = liquidado (fuera de KPIs globales).';

CREATE INDEX IF NOT EXISTS idx_eventos_liquidado_false
  ON public.eventos (id)
  WHERE liquidado = false;
