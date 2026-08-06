export interface EvSelectOption<T = unknown> {
  value: T;
  label: string;
  disabled?: boolean;
}

export type EvSelectSize = 'md' | 'sm';
export type EvSelectVariant = 'form' | 'toolbar';
export type EvSelectSearchMode = boolean | 'auto';
