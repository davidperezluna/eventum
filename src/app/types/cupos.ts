export type TipoAvisoCupo = 'busco_cupo' | 'ofrezco_cupo' | 'busco_grupo';

export interface ResumenMisCupos {
  avisos_activos: number;
  total_respuestas: number;
}

/** Aviso con datos del evento (explorar global o mis publicaciones). */
export interface AvisoCupoConEvento extends AvisoCupo {
  evento_titulo: string;
  evento_imagen_principal: string | null;
  evento_fecha_inicio: string | null;
}

export type AvisoCupoMio = AvisoCupoConEvento;

export interface AvisoCupo {
  id: number;
  evento_id: number;
  tipo: TipoAvisoCupo;
  descripcion: string;
  cupos: number;
  zona_texto: string | null;
  precio_referencia_cop: number | null;
  autor_display: string;
  fecha_creacion: string;
  intereses_count: number;
  es_mio: boolean;
}

export interface InteresCupo {
  id: number;
  mensaje: string;
  estado: string;
  fecha_creacion: string;
  interesado_display: string;
  interesado_email: string;
}

export const TIPO_AVISO_CUPO_LABELS: Record<TipoAvisoCupo, string> = {
  busco_cupo: 'Busco cupo',
  ofrezco_cupo: 'Ofrezco cupo',
  busco_grupo: 'Busco grupo',
};

export const TIPO_AVISO_CUPO_ICON: Record<TipoAvisoCupo, string> = {
  busco_cupo: 'person_search',
  ofrezco_cupo: 'sell',
  busco_grupo: 'groups',
};

export const TIPO_AVISO_CUPO_HINT: Record<TipoAvisoCupo, string> = {
  busco_cupo: 'Quieres unirte a un palco o entrada que alguien ya tiene.',
  ofrezco_cupo: 'Te sobró un cupo. Cierra con traslado oficial en Mis Boletas.',
  busco_grupo: 'Coordinas con otros para comprar; Eventum no recibe pagos entre usuarios.',
};
