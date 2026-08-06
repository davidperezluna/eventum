export interface EventoCobrosPanelData {
  eventoId: number;
  eventoTitulo: string;
  es_gratis: boolean;
  porcentaje_servicio: number;
  wompi_cuenta_id: number | null;
}

export interface EventoCobrosDrawerResult {
  changed: boolean;
  es_gratis?: boolean;
  porcentaje_servicio?: number;
  wompi_cuenta_id?: number | null;
}

