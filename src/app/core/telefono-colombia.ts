export const TELEFONO_COLOMBIA_DIGITOS = 10;
export const INDICATIVO_TELEFONO_COLOMBIA = '+57';

export const MENSAJE_TELEFONO_COLOMBIA_INVALIDO =
  'Revisa el número de teléfono. Debe tener 10 dígitos.';

export interface ValidacionTelefonoColombia {
  valido: boolean;
  normalizado: string;
  mensaje?: string;
}

/** Quita espacios, guiones y prefijo +57 / 57. */
export function normalizarTelefonoColombia(valor: string): string {
  let digits = String(valor ?? '')
    .trim()
    .replace(/[\s.\-()]/g, '');

  if (digits.startsWith('+57')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('57') && digits.length === 12) {
    digits = digits.slice(2);
  }

  return digits.replace(/\D/g, '');
}

export function esTelefonoColombiaValido(valor: string): boolean {
  return validarTelefonoColombia(valor).valido;
}

export function validarTelefonoColombia(valor: string): ValidacionTelefonoColombia {
  const raw = String(valor ?? '').trim();
  if (!raw) {
    return {
      valido: false,
      normalizado: '',
      mensaje: 'Ingresa tu número de teléfono.',
    };
  }

  const normalizado = normalizarTelefonoColombia(raw);
  if (!/^\d+$/.test(normalizado)) {
    return {
      valido: false,
      normalizado,
      mensaje: 'El teléfono solo puede contener números.',
    };
  }

  if (normalizado.length !== TELEFONO_COLOMBIA_DIGITOS) {
    return {
      valido: false,
      normalizado,
      mensaje: MENSAJE_TELEFONO_COLOMBIA_INVALIDO,
    };
  }

  const esCelular = /^3\d{9}$/.test(normalizado);
  const esFijo = /^60[1-8]\d{7}$/.test(normalizado);
  if (!esCelular && !esFijo) {
    return {
      valido: false,
      normalizado,
      mensaje: MENSAJE_TELEFONO_COLOMBIA_INVALIDO,
    };
  }

  return { valido: true, normalizado };
}
