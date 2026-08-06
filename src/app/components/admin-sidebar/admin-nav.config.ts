import { AdminNavSection } from './admin-nav.types';

/** Extrae el id de evento activo desde la URL del panel organizador. */
export function extractOrganizerEventIdFromUrl(url: string): number | null {
  const match = url.split('?')[0].match(/\/eventos\/(\d+)(?:\/|$)/);
  if (!match) return null;
  const id = Number.parseInt(match[1], 10);
  return Number.isFinite(id) ? id : null;
}

/** Menú administrador — rutas sin cambios. */
export function buildAdminNavSections(coversEnabled: boolean): AdminNavSection[] {
  return [
    {
      separator: false,
      entries: [
        { kind: 'link', path: '/dashboard', label: 'Inicio', icon: 'home', exact: true },
        { kind: 'link', path: '/eventos', label: 'Eventos', icon: 'event' },
      ],
    },
    {
      label: 'Operación',
      separator: true,
      entries: [
        {
          kind: 'group',
          label: 'Ingresos',
          icon: 'payments',
          expanded: false,
          children: [
            { path: '/ventas', label: 'Entradas vendidas', icon: 'confirmation_number' },
            { path: '/ventas-productos', label: 'Productos vendidos', icon: 'inventory_2' },
            { path: '/ventas-palcos', label: 'Palcos vendidos', icon: 'weekend' },
            { path: '/boletas-usadas', label: 'Asistentes registrados', icon: 'group' },
            { path: '/boletas', label: 'Boletas pendientes', icon: 'local_activity' },
            { path: '/transacciones-checkout', label: 'Transacciones', icon: 'receipt_long' },
            { path: '/wompi-reconcile', label: 'Conciliar pagos', icon: 'compare_arrows' },
            { path: '/ventas-manual', label: 'Venta manual', icon: 'point_of_sale' },
            { path: '/probar-compras', label: 'Probar compras', icon: 'storefront' },
          ],
        },
        { kind: 'link', path: '/escanear-qr', label: 'Escanear entradas', icon: 'qr_code_scanner' },
        { kind: 'link', path: '/lectores-parametrizacion', label: 'Lectores', icon: 'sensors' },
      ],
    },
    {
      label: 'Catálogo',
      separator: true,
      entries: [
        { kind: 'link', path: '/productos', label: 'Productos', icon: 'shopping_bag' },
        { kind: 'link', path: '/palcos', label: 'Palcos', icon: 'event_seat' },
        ...(coversEnabled
          ? [{ kind: 'link' as const, path: '/covers-config', label: 'Covers', icon: 'local_bar' }]
          : []),
      ],
    },
    {
      label: 'Plataforma',
      separator: true,
      tone: 'quiet',
      entries: [
        { kind: 'link', path: '/usuarios', label: 'Usuarios', icon: 'group' },
        { kind: 'link', path: '/categorias', label: 'Categorías', icon: 'category' },
        { kind: 'link', path: '/lugares', label: 'Lugares', icon: 'place' },
        { kind: 'link', path: '/calificaciones', label: 'Calificaciones', icon: 'star' },
        { kind: 'link', path: '/notificaciones', label: 'Notificaciones', icon: 'notifications' },
        { kind: 'link', path: '/reportes', label: 'Reportes', icon: 'assessment' },
      ],
    },
    {
      label: 'Cuenta',
      separator: true,
      tone: 'quiet',
      entries: [{ kind: 'link', path: '/perfil', label: 'Perfil', icon: 'person' }],
    },
  ];
}

/** Menú organizador estándar (no showcase). */
export function buildOrganizadorNavSections(coversEnabled: boolean): AdminNavSection[] {
  return [
    {
      entries: [
        {
          kind: 'link',
          path: '/dashboard-organizador',
          label: 'Inicio',
          icon: 'home',
          exact: true,
        },
      ],
    },
    ...(coversEnabled
      ? [
          {
            label: 'Ventas',
            separator: true,
            entries: [{ kind: 'link' as const, path: '/covers-config', label: 'Covers', icon: 'local_bar' }],
          },
        ]
      : []),
    {
      label: 'Cuenta',
      separator: true,
      tone: 'quiet' as const,
      entries: [{ kind: 'link', path: '/perfil', label: 'Perfil', icon: 'person' }],
    },
  ];
}

/** Menú showcase organizador — jerarquía editorial premium. */
export function buildShowcaseNavSections(
  eventId: number | null,
  coversEnabled: boolean
): AdminNavSection[] {
  const eventBase = eventId != null ? `/eventos/${eventId}` : null;

  return [
    {
      tone: 'hub',
      entries: [
        {
          kind: 'link',
          path: eventBase ? `${eventBase}/inteligencia` : '/eventos',
          label: 'Centro de Inteligencia',
          variant: 'hub',
        },
        {
          kind: 'link',
          path: eventBase ? `${eventBase}/operaciones` : '/eventos',
          label: 'Centro de Operaciones',
          variant: 'hub',
        },
      ],
    },
    {
      label: 'Evento',
      separator: true,
      entries: [
        { kind: 'link', path: '/escanear-qr', label: 'Escanear entradas', icon: 'qr_code_scanner' },
        { kind: 'link', path: '/lectores-parametrizacion', label: 'Lectores', icon: 'sensors' },
        { kind: 'link', path: '/boletas-usadas', label: 'Asistentes', icon: 'group' },
        { kind: 'link', path: '/boletas', label: 'Boletas', icon: 'local_activity' },
      ],
    },
    {
      label: 'Ventas',
      separator: true,
      entries: [
        { kind: 'link', path: '/productos', label: 'Productos', icon: 'shopping_bag' },
        { kind: 'link', path: '/palcos', label: 'Palcos', icon: 'event_seat' },
        ...(coversEnabled
          ? [{ kind: 'link' as const, path: '/covers-config', label: 'Covers', icon: 'local_bar' }]
          : []),
      ],
    },
    {
      label: 'Cuenta',
      separator: true,
      tone: 'quiet',
      entries: [{ kind: 'link', path: '/perfil', label: 'Perfil', icon: 'person' }],
    },
  ];
}
