import {
  extractDigits,
  formatGroupedDigits,
  formatGroupedNumber,
  parseGroupedNumber,
  roundToDecimals,
} from './number-input-format';

describe('number-input-format', () => {
  it('formatea enteros con separador de miles es-CO', () => {
    expect(formatGroupedNumber(1234567)).toBe('1.234.567');
    expect(formatGroupedDigits('1234567')).toBe('1.234.567');
  });

  it('extrae dígitos ignorando separadores', () => {
    expect(extractDigits('1.234.567')).toBe('1234567');
    expect(extractDigits('abc12d3')).toBe('123');
  });

  it('parsea enteros con separadores', () => {
    expect(parseGroupedNumber('1.234.567')).toBe(1234567);
    expect(parseGroupedNumber('500')).toBe(500);
    expect(parseGroupedNumber('')).toBeNull();
  });

  it('parsea decimales con coma', () => {
    expect(parseGroupedNumber('45.000,50', true)).toBe(45000.5);
    expect(parseGroupedNumber('1200,5', true)).toBe(1200.5);
  });

  it('redondea decimales', () => {
    expect(roundToDecimals(10.556, 2)).toBe(10.56);
    expect(roundToDecimals(10.556, 0)).toBe(10);
  });
});
