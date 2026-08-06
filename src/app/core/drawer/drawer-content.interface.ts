import { EvDrawerDiscardPrompt } from './drawer.types';

/**
 * Contrato opcional para componentes embebidos en un drawer.
 * Permite que el shell consulte cambios sin guardar antes de cerrar.
 */
export interface EvDrawerContent {
  evDrawerHasUnsavedChanges?(): boolean;
  evDrawerDiscardPrompt?(): EvDrawerDiscardPrompt | void;
}

export function isEvDrawerContent(value: unknown): value is EvDrawerContent {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('evDrawerHasUnsavedChanges' in value || 'evDrawerDiscardPrompt' in value)
  );
}
