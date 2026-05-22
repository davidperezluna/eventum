import { environment } from '../../environments/environment';

/** Origen público del sitio (dev/prod). En local usa window.location.origin. */
export function getAppOrigin(): string {
  const configured = (environment as { publicAppUrl?: string }).publicAppUrl?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export function getPagoResultadoUrl(query = ''): string {
  const base = `${getAppOrigin()}/pago-resultado`;
  if (!query) {
    return base;
  }
  return query.startsWith('?') ? `${base}${query}` : `${base}?${query}`;
}
