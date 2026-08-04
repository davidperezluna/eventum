export const DOCUMENTO_CEDULA_MIN_DIGITOS = 6;
export const DOCUMENTO_CEDULA_MAX_DIGITOS = 10;

export const MENSAJE_DOCUMENTO_CEDULA_INVALIDO =
  'Ingresa una cédula colombiana válida: solo números, entre 6 y 10 dígitos.';

export interface ValidacionDocumentoIdentidad {
  valido: boolean;
  normalizado: string;
  mensaje?: string;
}

/** Quita espacios y separadores habituales (p. ej. 1.234.567.890). */
export function normalizarDocumentoIdentidad(valor: string): string {
  return String(valor ?? '')
    .trim()
    .replace(/[\s.\-]/g, '');
}

export function esDocumentoIdentidadColombiaValido(valor: string): boolean {
  return validarDocumentoIdentidadColombia(valor).valido;
}

export function validarDocumentoIdentidadColombia(valor: string): ValidacionDocumentoIdentidad {
  const raw = String(valor ?? '').trim();
  if (!raw) {
    return {
      valido: false,
      normalizado: '',
      mensaje: 'Ingresa tu número de cédula.',
    };
  }

  if (raw.includes('@')) {
    return {
      valido: false,
      normalizado: raw,
      mensaje: 'El documento debe ser numérico (cédula), no un correo electrónico.',
    };
  }

  if (/[a-zA-Z]/.test(raw)) {
    return {
      valido: false,
      normalizado: raw,
      mensaje: 'La cédula solo puede contener números.',
    };
  }

  const normalizado = normalizarDocumentoIdentidad(raw);
  if (!/^\d+$/.test(normalizado)) {
    return {
      valido: false,
      normalizado,
      mensaje: 'La cédula solo puede contener números.',
    };
  }

  if (
    normalizado.length < DOCUMENTO_CEDULA_MIN_DIGITOS ||
    normalizado.length > DOCUMENTO_CEDULA_MAX_DIGITOS
  ) {
    return {
      valido: false,
      normalizado,
      mensaje: MENSAJE_DOCUMENTO_CEDULA_INVALIDO,
    };
  }

  return { valido: true, normalizado };
}
