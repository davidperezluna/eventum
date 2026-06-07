export const COVERS_DIAS_SEMANA: { value: number; label: string }[] = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

export const COVERS_ESTADO_SESION_LABEL: Record<string, string> = {
  programada: 'Programada',
  abierta: 'Abierta',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada',
};

export function labelDiaSemana(dia: number): string {
  return COVERS_DIAS_SEMANA.find((d) => d.value === dia)?.label ?? `Día ${dia}`;
}

export const COVERS_LABELS = {
  explorar: 'Clubs',
  explorarSubtitle: 'Reserva cover en bares y clubes con Eventum.',
  explorarSubtitleShort: 'Cover en bares y clubes.',
  detalleSubtitle: 'Noches disponibles y reserva online.',
  comprarCover: 'Reservar cover',
  sinSesiones: 'No hay noches disponibles por ahora.',
  sinClubes: 'Aún no hay clubes publicados.',
  cuposAgotados: 'Agotado',
  reingresoSi: 'Reingreso permitido',
  reingresoNo: 'Sin reingreso',
  irCarrito: 'Ir al carrito',
  agregadoCarrito: 'Cover agregado al carrito',
} as const;

export function formatHoraCover(hora: string | null | undefined): string {
  if (!hora) return '';
  const raw = String(hora).trim();

  if (raw.includes('T')) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString('es-CO', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }
  }

  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!timeMatch) return raw;

  const h = Number(timeMatch[1]);
  const m = Number(timeMatch[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return raw;

  const suffix = h >= 12 ? 'p. m.' : 'a. m.';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function labelSesionCover(sesion: {
  fecha: string;
  hora_apertura: string;
  hora_cierre: string;
  tipo_cover_nombre?: string;
}): string {
  const fecha = new Date(`${sesion.fecha}T12:00:00`);
  const dia = fecha.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  const apertura = formatHoraCover(sesion.hora_apertura);
  const cierre = formatHoraCover(sesion.hora_cierre);
  const tipo = sesion.tipo_cover_nombre ? ` · ${sesion.tipo_cover_nombre}` : '';
  return `${dia} · ${apertura} – ${cierre}${tipo}`;
}
