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
  /** Unidades de inventario vendidas (1 palco = 1, no N asientos). */
  vendidas: number;
  /** Filas/boletas físicas cuando un palco genera varias. */
  boletasAsientos?: number;
  pct?: number;
  clientesPagaron: string;
  clientesPagaronRaw: number;
  /** Desglose opcional (ranking de eventos org). */
  servicioLabel?: string;
  wompiLabel?: string;
}

export interface IntelRankingSection extends IntelCtaCapable {
  question: string;
  empty: boolean;
  emptyMessage?: string;
  rows: IntelRankingRow[];
  /** Total del ranking (p. ej. ingresos sumados). */
  totalLabel?: string;
  totalValue?: string;
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

/** Card de descuentos (cupones / rebajas) o ventas manuales / cortesía. */
export interface IntelMetricInsightSection extends IntelCtaCapable {
  question: string;
  empty: boolean;
  emptyMessage?: string;
  heroLabel: string;
  heroValue: string;
  stats: Array<{ label: string; value: string }>;
  /** Desglose opcional (p. ej. tipos de boleta en ventas manuales). */
  breakdown?: Array<{ nombre: string; meta: string }>;
  conclusion?: string;
}
