import { DateTimeUtil } from '../utils/date-time.util';

export interface ValidacionFechaNacimiento {
  valido: boolean;
  normalizado: string;
  mensaje?: string;
}

export const EDAD_MINIMA_ANIOS = 18;

/** Formatea fecha de nacimiento para `ev-date-picker` (`YYYY-MM-DD`) sin desfase por zona horaria. */
export function formatFechaNacimientoParaInput(date: Date | string | undefined | null): string {
  if (!date) {
    return '';
  }

  if (typeof date === 'string') {
    const trimmed = date.trim();
    if (!trimmed) {
      return '';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    if (trimmed.includes('T') || trimmed.includes(' ')) {
      const calendarKey = DateTimeUtil.toCalendarDateKey(trimmed);
      if (calendarKey) {
        return calendarKey;
      }
    }

    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return match[1];
    }

    return '';
  }

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function validarFechaNacimiento(valor: string): ValidacionFechaNacimiento {
  const raw = String(valor ?? '').trim();
  if (!raw) {
    return {
      valido: false,
      normalizado: '',
      mensaje: 'Ingresa tu fecha de nacimiento.',
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return {
      valido: false,
      normalizado: raw,
      mensaje: 'Fecha de nacimiento inválida.',
    };
  }

  const [year, month, day] = raw.split('-').map(Number);
  const fecha = new Date(year, month - 1, day);
  if (
    fecha.getFullYear() !== year ||
    fecha.getMonth() !== month - 1 ||
    fecha.getDate() !== day
  ) {
    return {
      valido: false,
      normalizado: raw,
      mensaje: 'Fecha de nacimiento inválida.',
    };
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (fecha >= hoy) {
    return {
      valido: false,
      normalizado: raw,
      mensaje: 'La fecha de nacimiento debe ser anterior a hoy.',
    };
  }

  if (year < 1900) {
    return {
      valido: false,
      normalizado: raw,
      mensaje: 'Fecha de nacimiento inválida.',
    };
  }

  const cumpleEdadMinima = new Date(fecha);
  cumpleEdadMinima.setFullYear(cumpleEdadMinima.getFullYear() + EDAD_MINIMA_ANIOS);
  if (cumpleEdadMinima > hoy) {
    return {
      valido: false,
      normalizado: raw,
      mensaje: 'Debes ser mayor de 18 años para crear una cuenta.',
    };
  }

  return { valido: true, normalizado: raw };
}

export function esFechaNacimientoUsuarioValida(valor: Date | string | undefined | null): boolean {
  if (!valor) {
    return false;
  }

  const input =
    typeof valor === 'string'
      ? formatFechaNacimientoParaInput(valor)
      : formatFechaNacimientoParaInput(valor);

  return validarFechaNacimiento(input).valido;
}
