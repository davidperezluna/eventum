export interface EventoImagenPanelData {
  eventoId: number;
  eventoTitulo: string;
  imagenActual?: string | null;
}

export interface EventoImagenDrawerResult {
  changed: boolean;
  imagenUrl?: string | null;
}
