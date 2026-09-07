import { describe, expect, it } from 'vitest';
import { Evento, TipoEstadoEvento } from '../../types';
import { buildHeroMoment } from './evento-inteligencia.utils';

const evento = {
  estado: TipoEstadoEvento.PUBLICADO,
  fecha_inicio: '2026-09-06T00:00:00',
  fecha_fin: '2026-09-06T07:00:00',
} as Evento;
const aforo = { total: 100, vendidas: 20, pct: 20 };

describe('Cuenta regresiva de inteligencia', () => {
  it('cuenta hasta las 7 pm de Colombia sin sumar cinco horas', () => {
    const hero = buildHeroMoment(evento, aforo, new Date('2026-09-05T18:30:00-05:00'));
    expect(hero.countdown).toEqual({ days: 0, hours: 0, minutes: 30 });
    expect(hero.showCountdown).toBe(true);
  });

  it('cambia a En vivo exactamente al inicio aunque siga publicado', () => {
    const hero = buildHeroMoment(evento, aforo, new Date('2026-09-06T00:00:00Z'));
    expect(hero.showCountdown).toBe(false);
    expect(hero.countdownCaption).toBe('En vivo');
  });

  it('cambia a Finalizado al alcanzar la hora de fin', () => {
    const hero = buildHeroMoment(evento, aforo, new Date('2026-09-06T07:00:00Z'));
    expect(hero.showCountdown).toBe(false);
    expect(hero.countdownCaption).toBe('Finalizado');
  });

  it.each([TipoEstadoEvento.CANCELADO, TipoEstadoEvento.FINALIZADO])(
    'no muestra cuenta regresiva para %s aunque el inicio sea futuro', estado => {
      const hero = buildHeroMoment({ ...evento, estado }, aforo, new Date('2026-09-05T00:00:00Z'));
      expect(hero.showCountdown).toBe(false);
      expect(hero.countdownCaption).toBe(estado === TipoEstadoEvento.CANCELADO ? 'Cancelado' : 'Finalizado');
    },
  );

  it('acepta fechas Date y fechas con offset explícito', () => {
    const now = new Date('2026-09-05T23:30:00Z');
    for (const fecha_inicio of [new Date('2026-09-06T00:00:00Z'), '2026-09-05T19:00:00-05:00']) {
      expect(buildHeroMoment({ ...evento, fecha_inicio }, aforo, now).countdown)
        .toEqual({ days: 0, hours: 0, minutes: 30 });
    }
  });
});
