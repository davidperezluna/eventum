import { DateTimeUtil } from '../../utils/date-time.util';
import { OrgSalesRowKind, OrgSalesRowModel } from './org-sales-row.types';

export function mapVentaToOrgSalesRow(venta: any, index = 0): OrgSalesRowModel {
  const eventoRaw = venta?.evento;
  const eventoTitulo =
    typeof eventoRaw === 'string'
      ? eventoRaw
      : Array.isArray(eventoRaw)
        ? String(eventoRaw[0]?.titulo || '').trim()
        : String(eventoRaw?.titulo || '').trim();

  return {
    key: String(venta?.numero_transaccion || venta?.id || index),
    fecha: String(venta?.fecha_compra || ''),
    evento: eventoTitulo || 'Evento sin nombre',
    compradorEmail: String(venta?.cliente_email || '').trim(),
    compradorNombre: String(venta?.cliente_nombre || '').trim(),
    tiposEntrada: String(venta?.tipos_entrada || '').trim(),
    total: Number(venta?.total || 0),
    valorLista: Number(venta?.valor_lista ?? venta?.subtotal ?? venta?.total ?? 0),
    esManual: !!venta?.es_manual || Number(venta?.total || 0) <= 0,
    boletas: Number(venta?.boletas_vendidas || 0),
    palcos: Number(venta?.palcos_vendidos || 0),
    palcosNumeros: Array.isArray(venta?.palcos_numeros) ? venta.palcos_numeros : [],
    tipoVenta: String(venta?.tipo_venta || venta?.source || 'ventas'),
  };
}

export function orgSalesBuyerName(venta: OrgSalesRowModel): string {
  return venta.compradorNombre || venta.compradorEmail || 'Comprador sin datos';
}

export function orgSalesDetalleEntradas(venta: OrgSalesRowModel): string {
  if (venta.tiposEntrada) return venta.tiposEntrada;
  if (venta.palcosNumeros.length > 0) return `Palco #${venta.palcosNumeros.join(', #')}`;
  if (venta.tipoVenta === 'productos') return 'Productos';
  if (venta.tipoVenta === 'mixta') return 'Entradas + productos';
  if (venta.boletas > 0) {
    return venta.boletas === 1 ? '1 entrada' : `${venta.boletas} entradas`;
  }
  return '';
}

export function orgSalesIcon(venta: OrgSalesRowModel): string {
  if (venta.tipoVenta === 'mixta') return 'shopping_bag';
  if (venta.palcos > 0 || venta.palcosNumeros.length > 0) return 'table_restaurant';
  if (venta.tipoVenta === 'productos') return 'local_mall';
  return 'confirmation_number';
}

export function orgSalesKind(venta: OrgSalesRowModel): OrgSalesRowKind {
  if (venta.tipoVenta === 'mixta') return 'mixta';
  if (venta.palcos > 0 || venta.palcosNumeros.length > 0) return 'palco';
  if (venta.tipoVenta === 'productos') return 'producto';
  return 'boleta';
}

export function orgSalesFormatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function orgSalesMonto(venta: OrgSalesRowModel): string {
  if (venta.esManual) {
    const valor = venta.valorLista > 0 ? venta.valorLista : venta.total;
    return valor > 0 ? orgSalesFormatCurrency(valor) : 'Venta manual';
  }
  return orgSalesFormatCurrency(venta.total);
}

export function orgSalesEtiquetaMonto(venta: OrgSalesRowModel): string | null {
  return venta.esManual && venta.valorLista > 0 ? 'Venta manual' : null;
}

export function orgSalesFechaRelativa(fecha: string): string {
  const date = DateTimeUtil.parseStoredDate(fecha);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutos = Math.floor(diff / 60_000);
  if (minutos < 1) return 'Hace un momento';
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    timeZone: DateTimeUtil.APP_TIMEZONE,
  }).format(date);
}

export function orgSalesFechaCompleta(fecha: string): string {
  const date = DateTimeUtil.parseStoredDate(fecha);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: DateTimeUtil.APP_TIMEZONE,
  }).format(date);
}
