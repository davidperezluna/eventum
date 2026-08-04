import { describe, expect, it } from 'vitest';
import { asistenteDesdeComprador } from './asistente-desde-comprador';

describe('asistente-desde-comprador', () => {
  it('arma el asistente con los datos del comprador', () => {
    expect(
      asistenteDesdeComprador({
        nombre: 'Ana',
        apellido: 'Pérez',
        email: 'ana@example.com',
        telefono: '3001234567',
        documento_identidad: '1234567890',
      })
    ).toEqual({
      nombre_asistente: 'Ana Pérez',
      documento_asistente: '1234567890',
      email_asistente: 'ana@example.com',
      telefono_asistente: '3001234567',
    });
  });

  it('no devuelve datos si faltan nombre o documento', () => {
    expect(asistenteDesdeComprador({ nombre: 'Ana', apellido: 'Pérez' })).toEqual({});
  });
});
