import { TipoBoleta } from '../../types';

export type EventoBoletasView = 'dashboard' | 'form' | 'inventory';

export interface EventoBoletasPanelData {
  eventoId: number;
  eventoTitulo: string;
  /** Se invoca al guardar cambios sin cerrar el drawer (p. ej. actualizar checklist en Operaciones). */
  onChanged?: (result: EventoBoletasDrawerResult) => void;
}

export interface EventoBoletasDrawerResult {
  changed: boolean;
  tiposBoleta?: TipoBoleta[];
}

export interface BoletasResumen {
  tiposCount: number;
  totalBoletas: number;
  vendidas: number;
  ocupacionPct: number;
}

export type TipoBoletaBadge = 'agotada' | 'agotandose' | 'inactiva';
