import { EvNoticeVariant } from '../../components/ev-notice';

export type IntelCtaAction = 'share' | 'operaciones' | 'escanear' | 'boletas' | 'productos' | 'cupones';

export type IntelCtaVariant = 'primary' | 'secondary';

export interface IntelCountdown {
  days: number;
  hours: number;
  minutes: number;
}

export interface IntelHeroMoment {
  headline: string;
  aforoLine: string;
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
  id: 'aforo' | 'asistentes';
  icon: string;
  label: string;
  value: string;
  phrase: string;
  detail: string;
  barPct?: number;
}

/** Presentación financiera del hero — datos vía buildFinanzasOrganizadorView. */
export interface IntelFinanzasHeroView {
  empty: boolean;
  showProductos: boolean;
  ventasGeneradas: string;
  ventasGeneradasMoneda: string;
  ventasGeneradasBoletas: string;
  ventasGeneradasProductos: string;
  descuentosEstimados: string;
  servicioEventum: string;
  comisionWompi: string;
  servicioPct: number;
  wompiPct: number;
  showDeducciones: boolean;
  recibirasAprox: string;
  recibirasAproxMoneda: string;
  recibirasAproxBoletas: string;
  recibirasAproxProductos: string;
}

export interface IntelActionNow {
  variant: EvNoticeVariant;
  message: string;
  ctaLabel: string;
  ctaAction: IntelCtaAction;
}

export interface IntelCtaCapable {
  ctaLabel?: string;
  ctaAction?: IntelCtaAction;
  ctaVariant?: IntelCtaVariant;
}

export interface IntelVentasSection extends IntelCtaCapable {
  question: string;
  empty: boolean;
  emptyMessage?: string;
  showProductos: boolean;
  /** Desglose bruto por rubro — complementa el total del hero, no lo repite. */
  clientesPagaronBoletas: string;
  clientesPagaronProductos: string;
  descuentosEstimados: string;
  servicioEventum: string;
  comisionWompi: string;
  descuentosPct: number;
  servicioPct: number;
  wompiPct: number;
  showDeducciones: boolean;
  /** Desglose neto por rubro. */
  recibirasAproxBoletas: string;
  recibirasAproxProductos: string;
  conclusion?: string;
}

export interface IntelRankingRow {
  nombre: string;
  vendidas: number;
  pct?: number;
  clientesPagaron: string;
  clientesPagaronRaw: number;
}

export interface IntelRankingSection extends IntelCtaCapable {
  question: string;
  empty: boolean;
  emptyMessage?: string;
  rows: IntelRankingRow[];
  conclusion?: string;
}

export interface IntelHoyInsight {
  id: string;
  icon: string;
  text: string;
  /** Destaca visualmente el insight principal del día. */
  emphasis?: boolean;
}

export interface IntelHoySection extends IntelCtaCapable {
  question: string;
  empty: boolean;
  emptyMessage?: string;
  insights: IntelHoyInsight[];
  /** @deprecated Usar insights */
  lines?: string[];
  conclusion?: string;
}

export interface IntelOportunidad extends IntelCtaCapable {
  text: string;
}

export interface IntelOportunidadesSection {
  question: string;
  items: IntelOportunidad[];
  conclusion?: string;
}

export interface IntelAforoTotals {
  vendidas: number;
  total: number;
  pct: number;
}
