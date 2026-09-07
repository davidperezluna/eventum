import { describe, expect, it } from 'vitest';
import { Evento, TipoEstadoEvento } from '../types';
import { isEventoEnCursoPorFechas } from './evento-en-curso';
import { buildEventoTimeline, formatTimelineDate } from './evento-timeline';

const evento = {
  estado: TipoEstadoEvento.PUBLICADO,
  fecha_inicio: '2026-09-06T01:00:00',
  fecha_fin: '2026-09-06T07:00:00',
} as Evento;

describe('Estado operativo y línea de tiempo por horario UTC', () => {
  it('marca En curso aunque el estado guardado siga publicado', () => {
    const now = new Date('2026-09-05T20:30:00-05:00');
    expect(isEventoEnCursoPorFechas(evento, now)).toBe(true);
    const timeline = buildEventoTimeline(evento, null, now);
    expect(timeline.find(item => item.id === 'started')).toMatchObject({
      label: 'En curso', reached: true, current: true, date: evento.fecha_inicio,
    });
    expect(timeline.filter(item => item.current).map(item => item.id)).toEqual(['started']);
  });

  it('respeta el instante de inicio y el fin, incluso al cruzar medianoche', () => {
    expect(isEventoEnCursoPorFechas(evento, new Date('2026-09-06T00:59:59Z'))).toBe(false);
    expect(isEventoEnCursoPorFechas(evento, new Date('2026-09-06T01:00:00Z'))).toBe(true);
    expect(isEventoEnCursoPorFechas(evento, new Date('2026-09-06T06:59:59Z'))).toBe(true);
    expect(isEventoEnCursoPorFechas(evento, new Date('2026-09-06T07:00:00Z'))).toBe(false);
  });

  it.each([TipoEstadoEvento.BORRADOR, TipoEstadoEvento.CANCELADO, TipoEstadoEvento.FINALIZADO])(
    'no convierte %s en En curso por las fechas', estado => {
      const timeline = buildEventoTimeline({ ...evento, estado }, null, new Date('2026-09-06T02:00:00Z'));
      expect(timeline.find(item => item.id === 'started')?.current).toBe(false);
    },
  );

  it('muestra las fechas en Colombia tanto con Z como sin ella', () => {
    const expected = new Date('2026-09-06T01:00:00Z').toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    expect(formatTimelineDate(evento.fecha_inicio)).toBe(expected);
    expect(formatTimelineDate('2026-09-06T01:00:00Z')).toBe(expected);
  });
});
