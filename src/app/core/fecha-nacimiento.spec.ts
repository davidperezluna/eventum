import { describe, expect, it } from 'vitest';
import {
  esFechaNacimientoUsuarioValida,
  formatFechaNacimientoParaInput,
  validarFechaNacimiento,
} from './fecha-nacimiento';

describe('fecha-nacimiento', () => {
  it('acepta fechas de personas mayores de 18 años', () => {
    expect(validarFechaNacimiento('1990-05-15').valido).toBe(true);
    expect(esFechaNacimientoUsuarioValida('1990-05-15T00:00:00.000Z')).toBe(true);

    const hace19Anios = new Date();
    hace19Anios.setFullYear(hace19Anios.getFullYear() - 19);
    expect(validarFechaNacimiento(formatFechaNacimientoParaInput(hace19Anios)).valido).toBe(true);
  });

  it('rechaza menores de 18, fechas futuras o vacías', () => {
    expect(validarFechaNacimiento('').valido).toBe(false);
    expect(validarFechaNacimiento('2099-01-01').valido).toBe(false);

    const hace17Anios = new Date();
    hace17Anios.setFullYear(hace17Anios.getFullYear() - 17);
    const resultado = validarFechaNacimiento(formatFechaNacimientoParaInput(hace17Anios));
    expect(resultado.valido).toBe(false);
    expect(resultado.mensaje).toMatch(/18/i);
  });

  it('preserva el día calendario al leer fechas date-only o ISO desde BD', () => {
    expect(formatFechaNacimientoParaInput('1994-03-09')).toBe('1994-03-09');
    expect(formatFechaNacimientoParaInput('1994-03-09T05:00:00.000Z')).toBe('1994-03-09');
    expect(esFechaNacimientoUsuarioValida('1994-03-09')).toBe(true);
  });
});
