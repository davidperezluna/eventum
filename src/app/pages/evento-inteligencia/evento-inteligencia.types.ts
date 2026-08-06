import { EvNoticeVariant } from '../../components/ev-notice';

export type IntelCtaAction = 'share' | 'operaciones' | 'escanear' | 'boletas' | 'productos';

export interface IntelCountdown {
  days: number;
  hours: number;
  minutes: number;
}

export interface IntelHeroMoment {
  /** Narrativa principal: "Faltan 2 horas para el evento" */
  headline: string;
  /** Línea de aforo: "0% del aforo vendido" */
  aforoLine: string;
  /** Línea de disponibilidad: "100 entradas disponibles" */
  availabilityLine: string;
  disponibles: number;
  salesPhrase: string;
  salesDetail: string;
  aforoPct: number;
  countdown: IntelCountdown | null;
  countdownCaption: string;
  showCountdown: boolean;
}

export interface IntelPulseCard {
  id: 'recaudo' | 'aforo' | 'asistentes';
  icon: string;
  label: string;
  value: string;
  /** Frase contextual completa — no solo el número */
  phrase: string;
  detail: string;
  barPct?: number;
}

export interface IntelActionNow {
  variant: EvNoticeVariant;
  message: string;
  ctaLabel: string;
  ctaAction: IntelCtaAction;
}

export interface IntelStorySection {
  id: string;
  question: string;
  headline: string;
  narrative: string;
  insight?: string;
  empty: boolean;
  emptyHeadline?: string;
  emptyNarrative?: string;
  ctaLabel?: string;
  ctaAction?: IntelCtaAction;
}

export interface IntelAforoTotals {
  vendidas: number;
  total: number;
  pct: number;
}
