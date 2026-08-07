import { Evento, TipoEstadoEvento } from '../types';
export type DemoScenarioId =
  | 'newly-created'
  | 'first-sales'
  | 'good-pace'
  | 'event-day'
  | 'finished';

/** Ajustes rápidos configurables por el usuario en el Laboratorio. */
export interface DemoScenarioParams {
  aforoPctVendido: number;
  diasAlEvento: number;
  asistenciaPct: number;
  productosVendidos: number;
  cuponesUsados: number;
  eventosEnCartera: number;
  /** Cupo total de referencia cuando el evento no tiene tipos configurados. */
  aforoTotal: number;
}

export const DEFAULT_DEMO_SCENARIO_PARAMS: DemoScenarioParams = {
  aforoPctVendido: 70,
  diasAlEvento: 10,
  asistenciaPct: 0,
  productosVendidos: 85,
  cuponesUsados: 12,
  eventosEnCartera: 2,
  aforoTotal: 300,
};

export interface DemoBuildContext {
  organizadorId: number;
  eventos: Evento[];
  /** Evento protagonista de la demo (inteligencia / operaciones). */
  heroEventoId: number | null;
  heroEvento: Evento | null;
}

export interface DemoScenarioMeta {
  id: DemoScenarioId;
  title: string;
  description: string;
  badge?: string;
}

export interface DemoEventoPresentationHints {
  /** Solo presentación en vista simulada; no persiste en BD. */
  estado?: TipoEstadoEvento;
  fechaInicioOffsetDays?: number;
}

export interface DemoScenarioActiveState {
  scenarioId: DemoScenarioId;
  params: DemoScenarioParams;
  heroEventoId: number | null;
}
