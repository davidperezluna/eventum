import { TipoBoleta } from '../../types';

export type EventoBoletasView = 'dashboard' | 'form' | 'inventory';

export interface EventoBoletasPanelData {
  eventoId: number;
  eventoTitulo: string;
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
