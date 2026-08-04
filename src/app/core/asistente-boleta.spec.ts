import { describe, expect, it } from 'vitest';
import {
  documentoAsistenteBoleta,
  nombreAsistenteBoleta,
  tieneAsistenteUsuarioEnlazado,
  tieneAsistenteUsuarioValido,
} from './asistente-boleta';

describe('asistente-boleta', () => {
  it('resuelve nombre y documento desde join asistente_usuario', () => {
    const boleta = {
      asistente_usuario_id: 5,
      asistente_usuario: {
        id: 5,
        nombre: 'Ana',
        apellido: 'Pérez',
        documento_identidad: '1234567890',
        email: 'ana@example.com',
      },
    };

    expect(nombreAsistenteBoleta(boleta)).toBe('Ana Pérez');
    expect(documentoAsistenteBoleta(boleta)).toBe('1234567890');
    expect(tieneAsistenteUsuarioValido(boleta)).toBe(true);
  });

  it('usa perfil en sesión cuando el join no trae datos (RLS)', () => {
    const boleta = { asistente_usuario_id: 5 };
    const perfilSesion = {
      id: 5,
      nombre: 'Ana',
      apellido: 'Pérez',
      documento_identidad: '1234567890',
      email: 'ana@example.com',
    };

    expect(tieneAsistenteUsuarioValido(boleta, perfilSesion)).toBe(true);
    expect(nombreAsistenteBoleta(boleta, perfilSesion)).toBe('Ana Pérez');
  });

  it('marca enlazada aunque falte join si hay asistente_usuario_id', () => {
    expect(tieneAsistenteUsuarioEnlazado({ asistente_usuario_id: 3 })).toBe(true);
    expect(tieneAsistenteUsuarioEnlazado({})).toBe(false);
  });

  it('marca inválido si falta documento colombiano', () => {
    const boleta = {
      asistente_usuario_id: 5,
      asistente_usuario: {
        nombre: 'Ana',
        apellido: 'Pérez',
        documento_identidad: '',
      },
    };

    expect(tieneAsistenteUsuarioValido(boleta)).toBe(false);
  });

  it('devuelve guiones si no hay asistente', () => {
    expect(nombreAsistenteBoleta({})).toBe('—');
    expect(documentoAsistenteBoleta({})).toBe('—');
  });
});
