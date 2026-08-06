/** Entrada de enlace directo en el sidebar admin/organizador. */
export interface AdminNavLink {
  kind: 'link';
  path: string;
  label: string;
  /** Omitir para ítems editoriales tipo hub (Centro de Inteligencia). */
  icon?: string;
  /** Hub = navegación principal del producto, sin icono. */
  variant?: 'hub' | 'default';
  exact?: boolean;
}

/** Grupo colapsable (p. ej. Ingresos en admin). */
export interface AdminNavGroup {
  kind: 'group';
  label: string;
  icon: string;
  expanded?: boolean;
  children: Array<{ path: string; label: string; icon: string }>;
}

export type AdminNavEntry = AdminNavLink | AdminNavGroup;

/**
 * Sección del sidebar.
 * - hub: centros del producto (sin etiqueta de sección)
 * - default: flujo editorial con label
 * - quiet: cuenta y utilidades discretas
 */
export interface AdminNavSection {
  label?: string;
  tone?: 'hub' | 'default' | 'quiet';
  /** Línea hairline antes de la sección (jerarquía por ritmo, no cajas). */
  separator?: boolean;
  entries: AdminNavEntry[];
}

export function isAdminNavGroup(entry: AdminNavEntry): entry is AdminNavGroup {
  return entry.kind === 'group';
}

export function isAdminNavLink(entry: AdminNavEntry): entry is AdminNavLink {
  return entry.kind === 'link';
}
