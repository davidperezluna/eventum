/**
 * Etiquetas UX del módulo Cupos Eventum.
 * - Explorar cupos → /cupos (todos los eventos)
 * - Eventos (hub) → /eventos-cliente (elegir evento)
 * - Tablón → /cupos-evento/:id (avisos de un evento)
 * - Mis publicaciones → /mis-cupos
 */
export const CUPOS_LABELS = {
  module: 'Cupos Eventum',

  explorar: 'Explorar cupos',
  explorarShort: 'Explorar',
  explorarAria: 'Explorar cupos de todos los eventos',
  explorarSubtitle:
    'Avisos de cupo de todos los eventos activos, ordenados por lo más reciente.',
  explorarSubtitleShort: 'Avisos recientes de todos los eventos.',

  /** Tercer tab del hub Cupos: lleva a elegir evento, no al tablón. */
  hubEventos: 'Eventos',
  hubEventosAria: 'Ir a la lista de eventos',

  tablon: 'Tablón',
  tablonDelEvento: 'Tablón del evento',
  tablonAria: 'Tablón de cupos de este evento',
  tablonSubtitle:
    'Tablón de este evento: publica, responde y coordina con traslado oficial.',
  tablonSubtitleShort: 'Publica y coordina en este evento.',

  misPublicaciones: 'Mis publicaciones',
  misPublicacionesSubtitle: 'Tus avisos en todos los eventos y las respuestas que recibiste.',
  misPublicacionesSubtitleShort: 'Tus avisos y respuestas.',
  misAvisos: 'Mis avisos',
  misAvisosAria: 'Mis publicaciones de cupos',
  misAvisosEnEvento: 'Mis avisos aquí',

  hubText: 'Busca u ofrece cupo en el tablón de cada evento.',
  hubTextEvento: 'Busca u ofrece cupo en el tablón de este evento.',

  avisosDelEvento: 'Avisos del evento',
} as const;
