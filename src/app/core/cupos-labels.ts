/**
 * Etiquetas UX del módulo Cupos Eventum.
 *
 * Navegación:
 * - Menú cliente: Explorar cupos + Mis publicaciones (badge respuestas)
 * - En tablón: enlace «Mis avisos» en cabecera del feed
 */

export const CUPOS_LABELS = {

  module: 'Cupos eventum',



  explorar: 'Explorar cupos',

  explorarShort: 'Explorar',

  explorarAria: 'Explorar cupos de todos los eventos',

  atrasExplorar: 'Atrás',

  atrasExplorarAria: 'Volver al tablón de cupos',

  explorarSubtitle:

    'Avisos de cupo de todos los eventos activos, ordenados por lo más reciente.',

  explorarSubtitleShort: 'Avisos recientes de todos los eventos.',

  explorarTicketHint: 'Ver avisos de todos los eventos',



  /** Hub: lista de eventos para abrir el tablón de cupos. */

  hubPorEvento: 'Por evento',

  hubPorEventoShort: 'Eventos',

  hubPorEventoAria: 'Elegir evento para ver su tablón de cupos',

  /** @deprecated Usar hubPorEvento */

  hubEventos: 'Eventos',

  hubEventosAria: 'Ir a la lista de eventos',



  tablon: 'Tablón',

  tablonDelEvento: 'Tablón del evento',

  tablonAria: 'Tablón de cupos de este evento',

  tablonSubtitle:

    'Tablón de este evento: publica, responde y coordina con traslado oficial.',

  tablonSubtitleShort: 'Publica y coordina en este evento.',



  misPublicaciones: 'Mis publicaciones',

  misPublicacionesShort: 'Mis avisos',

  misPublicacionesSubtitle: 'Tus avisos en todos los eventos y las respuestas que recibiste.',

  misPublicacionesSubtitleShort: 'Tus avisos y respuestas.',

  misPublicacionesTicketHint: 'Tus avisos y respuestas',

  misPublicacionesAria: 'Mis publicaciones de cupos en todos los eventos',

  /** @deprecated Usar misPublicacionesAria */

  misAvisosAria: 'Mis publicaciones de cupos',

  /** Vista local en tablón del evento (no confundir con hub). */

  misAvisosEnEvento: 'Mis avisos aquí',

  misAvisosEnEventoShort: 'Mis avisos',

  comunidadEvento: 'Comunidad',

  comunidadEventoAria: 'Avisos de todos en este evento',



  hubText: 'Busca u ofrece cupo en el tablón de cada evento.',

  hubTextEvento: 'Busca u ofrece cupo en el tablón de este evento.',



  avisosDelEvento: 'Avisos del evento',

  avisosDelEventoShort: 'Avisos',

  avisosRecientes: 'Avisos recientes',

} as const;

