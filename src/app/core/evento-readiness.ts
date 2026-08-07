import { Evento, TipoBoleta, TipoEstadoEvento } from '../types';

export type EventoReadinessStepId =
  | 'informacion'
  | 'imagen'
  | 'fechas'
  | 'boletas'
  | 'cobros'
  | 'productos'
  | 'publicacion';

export interface EventoReadinessStep {
  id: EventoReadinessStepId;
  label: string;
  complete: boolean;
  optional?: boolean;
  wizardStep?: number;
  action: 'wizard' | 'informacion' | 'imagen' | 'fechas' | 'cobros' | 'boletas' | 'productos' | 'publish';
}

export interface EventoReadinessResult {
  steps: EventoReadinessStep[];
  percent: number;
  requiredComplete: number;
  requiredTotal: number;
  pendingCount: number;
  nextStep: EventoReadinessStep | null;
  headline: string;
  subline: string;
}

function hasInformacion(evento: Evento): boolean {
  return !!(
    evento.titulo?.trim() &&
    evento.categoria_id &&
    evento.lugar_id &&
    (evento.descripcion_corta?.trim() || evento.descripcion?.trim())
  );
}

function hasImagen(evento: Evento): boolean {
  return !!evento.imagen_principal?.trim();
}

function hasFechas(evento: Evento): boolean {
  return !!(
    evento.fecha_inicio &&
    evento.fecha_fin &&
    evento.fecha_venta_inicio &&
    evento.fecha_venta_fin
  );
}

function hasBoletas(tipos: TipoBoleta[]): boolean {
  return tipos.some(
    (t) => t.activo !== false && (t.cantidad_disponibles ?? 0) > 0,
  );
}

export function isEventoCobrosConfigured(
  evento: Pick<Evento, 'es_gratis' | 'wompi_cuenta_id'>,
): boolean {
  return !!evento.es_gratis || evento.wompi_cuenta_id != null;
}

function hasCobros(evento: Evento): boolean {
  return isEventoCobrosConfigured(evento);
}

function hasPublicacion(evento: Evento): boolean {
  return evento.estado === TipoEstadoEvento.PUBLICADO && evento.activo === true;
}

export function buildEventoReadiness(
  evento: Evento,
  tiposBoleta: TipoBoleta[],
  tieneProductos: boolean,
): EventoReadinessResult {
  const steps: EventoReadinessStep[] = [
    {
      id: 'informacion',
      label: 'Información',
      complete: hasInformacion(evento),
      action: 'informacion',
    },
    {
      id: 'imagen',
      label: 'Imagen',
      complete: hasImagen(evento),
      action: 'imagen',
    },
    {
      id: 'fechas',
      label: 'Fechas',
      complete: hasFechas(evento),
      action: 'fechas',
    },
    {
      id: 'boletas',
      label: 'Boletas',
      complete: hasBoletas(tiposBoleta),
      action: 'boletas',
    },
    {
      id: 'cobros',
      label: 'Cobros',
      complete: hasCobros(evento),
      action: 'cobros',
    },
    {
      id: 'productos',
      label: 'Productos',
      complete: tieneProductos,
      optional: true,
      action: 'productos',
    },
    {
      id: 'publicacion',
      label: 'Publicación',
      complete: hasPublicacion(evento),
      wizardStep: 3,
      action: 'publish',
    },
  ];

  const required = steps.filter((s) => !s.optional);
  const requiredComplete = required.filter((s) => s.complete).length;
  const requiredTotal = required.length;
  const pendingCount = requiredTotal - requiredComplete;
  const percent = requiredTotal > 0 ? Math.round((requiredComplete / requiredTotal) * 100) : 0;
  const nextStep = steps.find((s) => !s.complete && !s.optional) ?? null;

  let headline = `Tu evento está listo en un ${percent}%`;
  let subline = 'Todo está configurado correctamente.';

  if (percent < 100 && pendingCount > 0) {
    subline =
      pendingCount === 1
        ? 'Solo falta un paso para comenzar a vender.'
        : `Solo faltan ${pendingCount} pasos para comenzar a vender.`;
  }

  if (percent >= 100) {
    headline = 'Evento listo para operar';
    subline = 'Todo está configurado correctamente.';
  }

  return {
    steps,
    percent,
    requiredComplete,
    requiredTotal,
    pendingCount,
    nextStep,
    headline,
    subline,
  };
}

/** Pasos obligatorios completados antes de poder publicar (excluye el paso «Publicación»). */
export function isEventoReadyToPublish(result: EventoReadinessResult): boolean {
  return result.steps
    .filter((s) => !s.optional && s.id !== 'publicacion')
    .every((s) => s.complete);
}

export function getPrePublishPendingCount(result: EventoReadinessResult): number {
  return result.steps.filter((s) => !s.optional && s.id !== 'publicacion' && !s.complete).length;
}

export function getPrePublishPendingSteps(result: EventoReadinessResult): EventoReadinessStep[] {
  return result.steps.filter((s) => !s.optional && s.id !== 'publicacion' && !s.complete);
}

const READINESS_FRIENDLY_PHRASES: Record<EventoReadinessStepId, string> = {
  informacion: 'completar la información del evento',
  imagen: 'subir una imagen',
  fechas: 'definir las fechas',
  boletas: 'configurar las entradas',
  cobros: 'indicar cómo cobrar',
  productos: 'agregar productos',
  publicacion: 'publicar el evento',
};

/** Mensaje amigable para avisar qué falta antes de publicar. */
export function formatPrePublishPendingMessage(steps: EventoReadinessStep[]): string {
  const phrases = steps.map((s) => READINESS_FRIENDLY_PHRASES[s.id] ?? s.label.toLowerCase());
  if (phrases.length === 0) return '';
  if (phrases.length === 1) {
    return `Te falta ${phrases[0]}. Revisa los pasos de abajo y vuelve a intentarlo.`;
  }
  if (phrases.length === 2) {
    return `Te faltan ${phrases[0]} y ${phrases[1]}. Revisa los pasos de abajo y vuelve a intentarlo.`;
  }
  const last = phrases.pop()!;
  return `Te faltan ${phrases.join(', ')} y ${last}. Revisa los pasos de abajo y vuelve a intentarlo.`;
}

export function getNextStepActionLabel(step: EventoReadinessStep): string {
  switch (step.id) {
    case 'informacion':
      return 'Completar información';
    case 'imagen':
      return 'Subir imagen';
    case 'fechas':
      return 'Configurar fechas';
    case 'boletas':
      return 'Configurar boletas';
    case 'cobros':
      return 'Configurar cobros';
    case 'productos':
      return 'Agregar productos';
    case 'publicacion':
      return 'Publicar evento';
    default:
      return 'Continuar';
  }
}

export function getNextStepMessage(step: EventoReadinessStep): string {
  switch (step.id) {
    case 'informacion':
      return 'Completa el título, la categoría y una descripción breve.';
    case 'imagen':
      return 'Agrega una imagen principal para listados y detalle público.';
    case 'fechas':
      return 'Define las fechas del evento y del periodo de venta.';
    case 'boletas':
      return 'Configura al menos un tipo de boleta con inventario disponible.';
    case 'cobros':
      return 'Indica si el evento es gratis o asigna una cuenta Wompi.';
    case 'productos':
      return 'Opcional: agrega productos para vender en el evento.';
    case 'publicacion':
      return 'Publica el evento para que aparezca en el catálogo y reciba ventas.';
    default:
      return 'Continúa configurando tu evento.';
  }
}
