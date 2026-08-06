import { describe, expect, it } from 'vitest';
import { buildAnswer } from './build-answer.js';
import type { BoletaEmailMatch } from '../domain/types.js';

function match(partial: Partial<BoletaEmailMatch> & Pick<BoletaEmailMatch, 'type'>): BoletaEmailMatch {
  return {
    confidence: 'exact',
    ...partial,
    type: partial.type,
  };
}

describe('buildAnswer', () => {
  it('email mismatch materialized', () => {
    const matches: BoletaEmailMatch[] = [
      match({
        type: 'eventum_account',
        checkoutId: 1939,
        purchaseId: 2079,
        eventumAccountEmail: 'cuenta.real@gmail.com',
        wompiReceiptEmail: 'daniel@gmail.com',
        emailsMatch: false,
        materialized: true,
        ticketCount: 2,
        eventTitle: 'Concierto',
        state: 'aprobada',
      }),
    ];

    const result = buildAnswer({ emails: ['daniel@gmail.com'] }, matches, 5);
    expect(result.status).toBe('resolved');
    expect(result.answer).toContain('cuenta.real@gmail.com');
    expect(result.answer).toContain('daniel@gmail.com');
    expect(result.answer).toContain('Recomendación');
  });

  it('approved without materialization', () => {
    const matches: BoletaEmailMatch[] = [
      match({
        type: 'wompi_receipt',
        checkoutId: 100,
        materialized: false,
        state: 'aprobada',
        wompiReceiptEmail: 'a@b.com',
      }),
    ];

    const result = buildAnswer({ emails: ['a@b.com'] }, matches, 5);
    expect(result.status).toBe('requires_reconciliation');
    expect(result.answer).toContain('Sincronizar');
  });

  it('ticket attendee explanation', () => {
    const matches: BoletaEmailMatch[] = [
      match({
        type: 'ticket_attendee',
        checkoutId: 50,
        materialized: true,
        purchaseId: 60,
        eventumAccountEmail: 'comprador@gmail.com',
        email: 'asistente@gmail.com',
        state: 'aprobada',
      }),
    ];

    const result = buildAnswer({ emails: ['asistente@gmail.com'] }, matches, 5);
    expect(result.answer).toContain('asistente');
  });

  it('multiple results ambiguous', () => {
    const matches: BoletaEmailMatch[] = [
      match({ type: 'eventum_account', checkoutId: 1, state: 'pendiente', materialized: true }),
      match({ type: 'eventum_account', checkoutId: 2, state: 'pendiente', materialized: true }),
    ];
    const result = buildAnswer({ emails: ['x@y.com'] }, matches, 5);
    expect(result.status).toBe('ambiguous');
    expect(result.answer).toContain('varios resultados');
  });

  it('zero results', () => {
    const result = buildAnswer({ emails: ['none@example.com'] }, [], 5);
    expect(result.status).toBe('not_found');
    expect(result.answer).toContain('Sin resultados');
  });
});
