import { AdminNavSection } from './admin-nav.types';

/** Menú administrador — agrupado por secciones, rutas sin cambios. */
export function buildAdminNavSections(coversEnabled: boolean): AdminNavSection[] {
  return [
    {
      entries: [{ kind: 'link', path: '/dashboard', label: 'Dashboard', icon: 'dashboard' }],
    },
    {
      entries: [{ kind: 'link', path: '/eventos', label: 'Eventos', icon: 'event' }],
    },
    {
      label: 'Operación',
      entries: [
        {
          kind: 'group',
          label: 'Ventas',
          icon: 'payments',
          expanded: false,
          children: [
            { path: '/ventas', label: 'Ventas boletas', icon: 'confirmation_number' },
            { path: '/ventas-productos', label: 'Ventas productos', icon: 'inventory_2' },
            { path: '/ventas-palcos', label: 'Ventas palcos', icon: 'weekend' },
            { path: '/boletas-usadas', label: 'Boletas usadas', icon: 'how_to_reg' },
            { path: '/boletas', label: 'Boletas sin usar', icon: 'confirmation_number' },
            { path: '/transacciones-checkout', label: 'Transacciones', icon: 'receipt_long' },
            { path: '/wompi-reconcile', label: 'Reconciliación Wompi', icon: 'compare_arrows' },
            { path: '/ventas-manual', label: 'Venta manual', icon: 'point_of_sale' },
            { path: '/probar-compras', label: 'Probar compras', icon: 'storefront' },
          ],
        },
        { kind: 'link', path: '/lectores-parametrizacion', label: 'Lectores', icon: 'qr_code_scanner' },
      ],
    },
    {
      label: 'Catálogo',
      entries: [
        { kind: 'link', path: '/productos', label: 'Productos', icon: 'local_mall' },
        { kind: 'link', path: '/palcos', label: 'Palcos', icon: 'event_seat' },
        ...(coversEnabled
          ? [{ kind: 'link' as const, path: '/covers-config', label: 'Covers', icon: 'local_bar' }]
          : []),
      ],
    },
    {
      label: 'Administración',
      entries: [
        { kind: 'link', path: '/usuarios', label: 'Usuarios', icon: 'people' },
        { kind: 'link', path: '/categorias', label: 'Categorías', icon: 'category' },
        { kind: 'link', path: '/lugares', label: 'Lugares', icon: 'place' },
        { kind: 'link', path: '/calificaciones', label: 'Calificaciones', icon: 'star' },
        { kind: 'link', path: '/notificaciones', label: 'Notificaciones', icon: 'notifications' },
        { kind: 'link', path: '/probar-email', label: 'Probar email', icon: 'mail' },
        { kind: 'link', path: '/reportes', label: 'Reportes', icon: 'assessment' },
      ],
    },
  ];
}


/** Menú organizador estándar — portafolio de eventos. */
export function buildOrganizadorNavSections(_coversEnabled = false): AdminNavSection[] {
  return buildOrganizadorNavCore(false);
}

/** Menú showcase organizador — mismo núcleo + Laboratorio demo. */
export function buildShowcaseNavSections(): AdminNavSection[] {
  return buildOrganizadorNavCore(true);
}

function buildOrganizadorNavCore(showcase: boolean): AdminNavSection[] {
  return [
    {
      entries: [
        { kind: 'link', path: '/dashboard-organizador', label: 'Dashboard', icon: 'dashboard' },
        { kind: 'link', path: '/eventos', label: 'Mis eventos', icon: 'event' },
        { kind: 'link', path: '/ventas-organizador', label: 'Mis ventas', icon: 'payments' },
        ...(showcase
          ? [{ kind: 'link' as const, path: '/demo-laboratorio', label: 'Laboratorio', icon: 'science' }]
          : []),
      ],
    },
  ];
}

