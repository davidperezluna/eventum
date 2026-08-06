const LOCALE = 'es-CO';

export interface NumberInputFormatOptions {
  /** Máximo de decimales al formatear (0 = entero). */
  maxDecimals?: number;
  /** Mínimo de decimales al formatear. */
  minDecimals?: number;
}

/** Formatea un número con separador de miles (locale es-CO). */
export function formatGroupedNumber(
  value: number | null | undefined,
  options: NumberInputFormatOptions = {},
): string {
  if (value == null || !Number.isFinite(Number(value))) {
    return '';
  }
  const maxDecimals = options.maxDecimals ?? 0;
  const minDecimals = options.minDecimals ?? 0;
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
    useGrouping: true,
  }).format(Number(value));
}

/** Formatea dígitos crudos (solo enteros) con separador de miles. */
export function formatGroupedDigits(digits: string): string {
  if (!digits) {
    return '';
  }
  const numeric = Number(digits);
  if (!Number.isFinite(numeric)) {
    return '';
  }
  return formatGroupedNumber(numeric, { maxDecimals: 0 });
}

/** Extrae solo dígitos de una cadena. */
export function extractDigits(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

/**
 * Parsea texto con separadores locales a número.
 * Enteros: acepta puntos/comas como miles. Decimales: la última coma es separador decimal.
 */
export function parseGroupedNumber(raw: string, allowDecimals = false): number | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return null;
  }

  if (!allowDecimals) {
    const digits = extractDigits(trimmed);
    if (!digits) {
      return null;
    }
    return Number(digits);
  }

  let normalized = trimmed.replace(/\s/g, '');
  const lastComma = normalized.lastIndexOf(',');

  if (lastComma >= 0) {
    const intPart = normalized.slice(0, lastComma).replace(/[.,]/g, '');
    const decPart = normalized.slice(lastComma + 1).replace(/\D/g, '');
    normalized = decPart.length > 0 ? `${intPart}.${decPart}` : intPart;
  } else {
    normalized = normalized.replace(/\./g, '');
  }

  if (!normalized || normalized === '.') {
    return null;
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/** Normaliza decimales según precisión configurada. */
export function roundToDecimals(value: number, decimals: number): number {
  if (decimals <= 0) {
    return Math.trunc(value);
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
