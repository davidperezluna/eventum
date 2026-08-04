import { describe, expect, it } from 'vitest';
import {
  esTelefonoColombiaValido,
  normalizarTelefonoColombia,
  validarTelefonoColombia,
} from './telefono-colombia';

describe('telefono-colombia', () => {
  it('normaliza prefijo +57 y separadores', () => {
    expect(normalizarTelefonoColombia('+57 300 123 4567')).toBe('3001234567');
    expect(normalizarTelefonoColombia('57 601 234 5678')).toBe('6012345678');
  });

  it('acepta celular y fijo colombiano', () => {
    expect(esTelefonoColombiaValido('3001234567')).toBe(true);
    expect(esTelefonoColombiaValido('6012345678')).toBe(true);
  });

  it('rechaza números inválidos', () => {
    expect(esTelefonoColombiaValido('12345')).toBe(false);
    expect(esTelefonoColombiaValido('4001234567')).toBe(false);
    const resultado = validarTelefonoColombia('');
    expect(resultado.valido).toBe(false);
  });
});
