export type EvPanelSummaryMetricVariant = 'default' | 'hero' | 'accent' | 'text';

export interface EvPanelSummaryMetric {
  value: string | number;
  label: string;
  variant?: EvPanelSummaryMetricVariant;
}
