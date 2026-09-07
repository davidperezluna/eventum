/* ============================================
   GA4 purchase — helpers puros (testables)
   value = Σ(price × qty − discount); service_fee aparte.
   ============================================ */

export type GaItem = {
  item_id?: string;
  item_name?: string;
  price?: number;
  quantity?: number;
  discount?: number;
  /** Título del evento (contexto del SKU). */
  item_category?: string;
  /** boleta | producto | cover */
  item_category2?: string;
};

/** value GA4 = Σ (price × quantity − discount). */
export function sumGaItemsValue(items: GaItem[] | undefined | null): number {
  if (!items?.length) return 0;
  return items.reduce((sum, item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const line = (Number(item.price) || 0) * qty;
    const discount = Math.max(0, Number(item.discount) || 0);
    return sum + Math.max(0, line - discount);
  }, 0);
}

export type GaBoletaRowForPurchase = {
  tipo_boleta_id: number;
  precio_unitario: number;
  /** Agrupa asientos de un mismo palco (unidad comercial). */
  grupo_palco_id?: string | null;
  /** Solo la fila “cabeza” del palco descuenta inventario / lleva el precio. */
  consume_inventario?: boolean | null;
  tipos_boleta?: { nombre?: string } | { nombre?: string }[] | null;
};

export type GaProductoLineForPurchase = {
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  productos?: { nombre?: string } | { nombre?: string }[] | null;
};

export type GaCoverRowForPurchase = {
  tipo_cover_id: number;
  precio_unitario: number;
  tipos_cover?: { nombre?: string } | { nombre?: string }[] | null;
};

function joinNombre(
  rel: { nombre?: string } | { nombre?: string }[] | null | undefined,
): string | undefined {
  if (!rel) return undefined;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.nombre?.trim() || undefined;
}

/**
 * Unidades comerciales desde boletas_compradas:
 * - Boleta simple: 1 fila = 1 unidad.
 * - Palco multipersona: 1 `grupo_palco_id` = 1 unidad (precio en la fila cabeza).
 */
export function buildGaItemsFromBoletaRows(
  rows: GaBoletaRowForPurchase[],
  eventoTitulo?: string | null,
  descuentoTotal?: number,
): GaItem[] {
  type Unit = { tipoId: number; name: string; price: number };
  const units: Unit[] = [];
  const palcoByGrupo = new Map<string, Unit>();

  for (const row of rows || []) {
    const tipoId = Number(row.tipo_boleta_id);
    if (!Number.isFinite(tipoId)) continue;
    const name = joinNombre(row.tipos_boleta) || `Boleta ${tipoId}`;
    const price = Number(row.precio_unitario) || 0;
    const grupo =
      row.grupo_palco_id != null && String(row.grupo_palco_id).trim()
        ? String(row.grupo_palco_id).trim()
        : null;

    if (grupo) {
      const prev = palcoByGrupo.get(grupo);
      if (!prev) {
        palcoByGrupo.set(grupo, { tipoId, name, price });
      } else if (price > prev.price) {
        prev.price = price;
        if (name) prev.name = name;
      }
      continue;
    }

    // Companion sin grupo (datos raros): no contar.
    if (row.consume_inventario === false) continue;
    units.push({ tipoId, name, price });
  }

  units.push(...palcoByGrupo.values());

  const byTipo = new Map<number, { name: string; price: number; quantity: number }>();
  for (const u of units) {
    const prev = byTipo.get(u.tipoId);
    if (prev) {
      prev.quantity += 1;
      // Precio unitario estable: el de la primera unidad (todas deberían coincidir).
      if (prev.price <= 0 && u.price > 0) prev.price = u.price;
    } else {
      byTipo.set(u.tipoId, { name: u.name, price: u.price, quantity: 1 });
    }
  }

  const items: GaItem[] = [...byTipo.entries()].map(([tipoId, g]) => ({
    item_id: String(tipoId),
    item_name: g.name,
    price: g.price,
    quantity: g.quantity,
    item_category: eventoTitulo || undefined,
    item_category2: 'boleta',
  }));

  const discount = Math.max(0, Number(descuentoTotal) || 0);
  if (discount > 0 && items.length) {
    const base = sumGaItemsValue(items);
    if (base > 0) {
      let asignado = 0;
      items.forEach((item, i) => {
        const line =
          (Number(item.price) || 0) * Math.max(1, Number(item.quantity) || 1);
        const parte =
          i === items.length - 1
            ? Math.max(0, discount - asignado)
            : Math.round((discount * line) / base);
        asignado += parte;
        items[i] = { ...item, discount: parte };
      });
    }
  }

  return items;
}

export function buildGaItemsFromProductoLines(
  lines: GaProductoLineForPurchase[],
  eventoTitulo?: string | null,
): GaItem[] {
  return (lines || [])
    .filter((l) => l.producto_id != null)
    .map((l) => ({
      item_id: `producto-${l.producto_id}`,
      item_name: joinNombre(l.productos) || `Producto ${l.producto_id}`,
      price: Number(l.precio_unitario) || 0,
      quantity: Math.max(1, Number(l.cantidad) || 1),
      item_category: eventoTitulo || undefined,
      item_category2: 'producto' as const,
    }));
}

/** Agrupa boletas cover por tipo. */
export function buildGaItemsFromCoverRows(
  rows: GaCoverRowForPurchase[],
  lugarNombre?: string | null,
): GaItem[] {
  const byTipo = new Map<
    number,
    { name: string; price: number; quantity: number }
  >();

  for (const row of rows || []) {
    const tipoId = Number(row.tipo_cover_id);
    if (!Number.isFinite(tipoId)) continue;
    const price = Number(row.precio_unitario) || 0;
    const name = joinNombre(row.tipos_cover) || `Cover ${tipoId}`;
    const prev = byTipo.get(tipoId);
    if (prev) {
      prev.quantity += 1;
    } else {
      byTipo.set(tipoId, { name, price, quantity: 1 });
    }
  }

  return [...byTipo.entries()].map(([tipoId, g]) => ({
    item_id: `cover-${tipoId}`,
    item_name: g.name,
    price: g.price,
    quantity: g.quantity,
    item_category: lugarNombre || undefined,
    item_category2: 'cover',
  }));
}

export type GaPurchasePayload = {
  transaction_id: string;
  currency: 'COP';
  value: number;
  service_fee: number;
  total_paid: number;
  payment_gateway: 'wompi';
  items: GaItem[];
};

/** Arma el payload ecommerce de purchase (value sin fee). */
export function buildGaPurchasePayload(params: {
  transactionId: string;
  items: GaItem[];
  serviceFee?: number;
  fallbackValue?: number;
}): GaPurchasePayload | null {
  const transactionId = String(params.transactionId || '').trim();
  if (!transactionId) return null;

  const items = (params.items || []).filter((i) => i.item_name || i.item_id);
  const value = items.length
    ? sumGaItemsValue(items)
    : Math.max(0, Number(params.fallbackValue) || 0);
  const serviceFee = Math.max(0, Number(params.serviceFee) || 0);

  return {
    transaction_id: transactionId,
    currency: 'COP',
    value,
    service_fee: serviceFee,
    total_paid: value + serviceFee,
    payment_gateway: 'wompi',
    items,
  };
}

/** purchase válido para enviar (ítems reales y value > 0). */
export function isSendableGaPurchase(
  payload: GaPurchasePayload | null | undefined,
): boolean {
  if (!payload) return false;
  if (!payload.items?.length) return false;
  if (!(Number(payload.value) > 0)) return false;
  return true;
}

/** ¿Debe enviarse purchase según el estado unificado de pago-resultado? */
export function shouldTrackGaPurchase(
  estado: 'completado' | 'pendiente' | 'fallido' | 'otro' | string | null | undefined,
): boolean {
  return estado === 'completado';
}

const DEFAULT_PURCHASE_TRACKED_KEY = 'eventum_ga_purchase_tracked';

/**
 * Reserva un transaction_id en storage. true = primera vez (debe enviarse).
 * false = ya se envió purchase para ese id.
 */
export function claimGaPurchaseTrackingId(
  transactionId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null,
  key: string = DEFAULT_PURCHASE_TRACKED_KEY,
): boolean {
  const id = String(transactionId || '').trim();
  if (!id) return false;
  if (!storage) return true;

  try {
    const raw = storage.getItem(key);
    const tracked: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (tracked.includes(id)) {
      return false;
    }
    tracked.push(id);
    storage.setItem(key, JSON.stringify(tracked.slice(-50)));
    return true;
  } catch {
    return true;
  }
}
