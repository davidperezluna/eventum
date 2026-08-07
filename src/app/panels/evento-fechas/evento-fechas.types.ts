import { Evento } from '../../types';

export interface EventoFechasPanelData {
  eventoId: number;
  eventoTitulo: string;
  edad_minima?: number | null;
  fecha_inicio?: Date | string;
  fecha_fin?: Date | string;
  fecha_venta_inicio?: Date | string;
  fecha_venta_fin?: Date | string;
}

export interface EventoFechasDrawerResult {
  changed: boolean;
  edad_minima?: number | null;
  fecha_inicio?: Date | string;
  fecha_fin?: Date | string;
  fecha_venta_inicio?: Date | string;
  fecha_venta_fin?: Date | string;
}

export interface FechasFormSnapshot {
  edad_minima: number | null;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_venta_inicio: string;
  fecha_venta_fin: string;
}

export type EventoFechasSource = Pick<
  Evento,
  | 'id'
  | 'titulo'
  | 'edad_minima'
  | 'fecha_inicio'
  | 'fecha_fin'
  | 'fecha_venta_inicio'
  | 'fecha_venta_fin'
>;
