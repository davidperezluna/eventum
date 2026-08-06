import { Evento, Lugar } from '../../types';

export interface EventoFechasPanelData {
  eventoId: number;
  eventoTitulo: string;
  lugar_id?: number | null;
  edad_minima?: number | null;
  fecha_inicio?: Date | string;
  fecha_fin?: Date | string;
  fecha_venta_inicio?: Date | string;
  fecha_venta_fin?: Date | string;
  lugar?: Pick<Lugar, 'id' | 'nombre' | 'ciudad'> | null;
}

export interface EventoFechasDrawerResult {
  changed: boolean;
  lugar_id?: number | null;
  edad_minima?: number | null;
  fecha_inicio?: Date | string;
  fecha_fin?: Date | string;
  fecha_venta_inicio?: Date | string;
  fecha_venta_fin?: Date | string;
  lugar?: Pick<Lugar, 'id' | 'nombre' | 'ciudad'> | null;
}

export interface FechasFormSnapshot {
  lugar_id: number | null;
  edad_minima: number | null;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_venta_inicio: string;
  fecha_venta_fin: string;
}
