/** Entrada de enlace directo en el sidebar admin/organizador. */
export interface AdminNavLink {
  kind: 'link';
  path: string;
  label: string;
  icon: string;
}

/** Grupo colapsable (p. ej. Ventas). */
export interface AdminNavGroup {
  kind: 'group';
  label: string;
  icon: string;
  expanded?: boolean;
  children: Array<{ path: string; label: string; icon: string }>;
}

export type AdminNavEntry = AdminNavLink | AdminNavGroup;

/** Sección del sidebar con etiqueta opcional y entradas. */
export interface AdminNavSection {
  label?: string;
  entries: AdminNavEntry[];
}

export function isAdminNavGroup(entry: AdminNavEntry): entry is AdminNavGroup {
  return entry.kind === 'group';
}

export function isAdminNavLink(entry: AdminNavEntry): entry is AdminNavLink {
  return entry.kind === 'link';
}
