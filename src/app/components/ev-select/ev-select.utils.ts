import { EvSelectOption } from './ev-select.types';

export function mapToEvSelectOptions<T, V = unknown>(
  items: readonly T[],
  getLabel: (item: T) => string,
  getValue: (item: T) => V,
): EvSelectOption<V>[] {
  return items.map((item) => ({
    label: getLabel(item),
    value: getValue(item),
  }));
}

export function withEvSelectPlaceholder(
  options: EvSelectOption[],
  placeholder: EvSelectOption,
): EvSelectOption[] {
  return [placeholder, ...options];
}
