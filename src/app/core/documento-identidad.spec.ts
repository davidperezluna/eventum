import { describe, expect, it } from 'vitest';
import {
  esDocumentoIdentidadColombiaValido,
  normalizarDocumentoIdentidad,
  validarDocumentoIdentidadColombia,
} from './documento-identidad';

describe('documento-identidad', () => {
  it('acepta cédulas numéricas entre 6 y 10 dígitos', () => {
    expect(esDocumentoIdentidadColombiaValido('123456')).toBe(true);
    expect(esDocumentoIdentidadColombiaValido('1234567890')).toBe(true);
    expect(normalizarDocumentoIdentidad('1.234.567.890')).toBe('1234567890');
  });

  it('rechaza correos, letras y longitudes inválidas', () => {
    expect(esDocumentoIdentidadColombiaValido('usuario@correo.com')).toBe(false);
    expect(esDocumentoIdentidadColombiaValido('ABC123456')).toBe(false);
    expect(esDocumentoIdentidadColombiaValido('12345')).toBe(false);
    expect(esDocumentoIdentidadColombiaValido('12345678901')).toBe(false);
  });

  it('devuelve mensaje claro para correos', () => {
    const resultado = validarDocumentoIdentidadColombia('persona@gmail.com');
    expect(resultado.valido).toBe(false);
    expect(resultado.mensaje).toMatch(/correo/i);
  });
});
