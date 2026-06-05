import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { CuponDescuento, Evento, Producto, TipoBoleta } from '../types';

export interface CuponCarritoState {
  eventoId: number | null;
  codigoCupon: string;
  cuponAplicado: CuponDescuento | null;
  abierto: boolean;
}

export interface ItemCarritoEvento {
  tipo: TipoBoleta;
  cantidad: number;
  datosAsistente?: {
    nombre?: string;
    documento?: string;
    email?: string;
    telefono?: string;
  };
  palco_ids?: (number | null)[];
}

export interface ItemCarritoProducto {
  producto: Producto;
  cantidad: number;
}

interface CarritoPersistido {
  evento: Evento | null;
  items: ItemCarritoEvento[];
  itemsProductos: ItemCarritoProducto[];
  cupon?: CuponCarritoState;
  /** Caché por evento: si hay productos activos (evita parpadeo en carrito). */
  eventoTieneProductos?: boolean;
}

const CUPON_CARRITO_VACIO: CuponCarritoState = {
  eventoId: null,
  codigoCupon: '',
  cuponAplicado: null,
  abierto: false,
};

@Injectable({
  providedIn: 'root'
})
export class CarritoCompraService {
  private readonly storageKey = 'eventum_carrito_compra';
  private readonly legacyProductosKey = 'eventum_carrito_productos';
  private readonly eventoSubject = new BehaviorSubject<Evento | null>(null);
  private readonly itemsSubject = new BehaviorSubject<ItemCarritoEvento[]>([]);
  private readonly itemsProductosSubject = new BehaviorSubject<ItemCarritoProducto[]>([]);
  private readonly totalItemsSubject = new BehaviorSubject<number>(0);
  private readonly cuponSubject = new BehaviorSubject<CuponCarritoState>({ ...CUPON_CARRITO_VACIO });
  private eventoTieneProductosCache: boolean | null = null;

  readonly evento$ = this.eventoSubject.asObservable();
  readonly items$ = this.itemsSubject.asObservable();
  readonly itemsProductos$ = this.itemsProductosSubject.asObservable();
  readonly totalItems$ = this.totalItemsSubject.asObservable();
  readonly cupon$ = this.cuponSubject.asObservable();

  constructor() {
    this.hidratarDesdeStorage();
  }

  getEventoSnapshot(): Evento | null {
    return this.eventoSubject.getValue();
  }

  getItemsSnapshot(): ItemCarritoEvento[] {
    return this.itemsSubject.getValue();
  }

  getItemsProductosSnapshot(): ItemCarritoProducto[] {
    return this.itemsProductosSubject.getValue();
  }

  getCuponSnapshot(): CuponCarritoState {
    return this.cuponSubject.getValue();
  }

  setCodigoCupon(codigo: string): void {
    const actual = this.cuponSubject.getValue();
    this.cuponSubject.next({
      ...actual,
      codigoCupon: codigo.trim().toUpperCase(),
      eventoId: actual.eventoId ?? this.eventoSubject.getValue()?.id ?? null,
    });
    this.persistir();
  }

  setCuponAplicado(cupon: CuponDescuento | null, eventoId: number): void {
    const actual = this.cuponSubject.getValue();
    this.cuponSubject.next({
      eventoId,
      codigoCupon: cupon?.codigo ?? actual.codigoCupon,
      cuponAplicado: cupon,
      abierto: cupon ? false : actual.abierto,
    });
    this.persistir();
  }

  setCuponAbierto(abierto: boolean): void {
    const actual = this.cuponSubject.getValue();
    if (actual.abierto === abierto) return;
    this.cuponSubject.next({ ...actual, abierto });
    this.persistir();
  }

  clearCupon(): void {
    this.cuponSubject.next({ ...CUPON_CARRITO_VACIO });
    this.persistir();
  }

  clearCuponSiEventoDistinto(eventoId: number | null | undefined): void {
    const cupon = this.cuponSubject.getValue();
    if (!cupon.eventoId || !eventoId || cupon.eventoId === eventoId) return;
    this.clearCupon();
  }

  getEventoTieneProductosCache(eventoId: number | null | undefined): boolean | null {
    const evento = this.eventoSubject.getValue();
    if (!eventoId || !evento || evento.id !== eventoId) return null;
    return this.eventoTieneProductosCache;
  }

  setEventoTieneProductosCache(eventoId: number, tieneProductos: boolean): void {
    const evento = this.eventoSubject.getValue();
    if (!evento || evento.id !== eventoId) return;
    if (this.eventoTieneProductosCache === tieneProductos) return;
    this.eventoTieneProductosCache = tieneProductos;
    this.persistir();
  }

  private resetEventoTieneProductosCache(): void {
    this.eventoTieneProductosCache = null;
  }

  getCantidadEnCarrito(tipoBoletaId: number): number {
    const item = this.itemsSubject.getValue().find((it) => it.tipo.id === tipoBoletaId);
    return item ? item.cantidad : 0;
  }

  getCantidadProductoEnCarrito(productoId: number): number {
    const item = this.itemsProductosSubject.getValue().find((it) => it.producto.id === productoId);
    return item ? item.cantidad : 0;
  }

  tieneLicorEnCarrito(): boolean {
    return this.itemsProductosSubject.getValue().some((it) => !!it.producto.es_licor);
  }

  getSubtotalBoletas(): number {
    return this.itemsSubject.getValue().reduce((acc, item) => acc + item.tipo.precio * item.cantidad, 0);
  }

  getSubtotalProductos(): number {
    return this.itemsProductosSubject.getValue().reduce(
      (acc, item) => acc + item.producto.precio * item.cantidad,
      0
    );
  }

  getSubtotalCombinado(): number {
    return this.getSubtotalBoletas() + this.getSubtotalProductos();
  }

  estaVacio(): boolean {
    return this.itemsSubject.getValue().length === 0 && this.itemsProductosSubject.getValue().length === 0;
  }

  syncEvento(evento: Evento): boolean {
    const actual = this.eventoSubject.getValue();
    if (actual && actual.id !== evento.id) {
      this.itemsSubject.next([]);
      this.itemsProductosSubject.next([]);
      this.clearCupon();
      this.eventoSubject.next({ ...evento });
      this.persistir();
      this.actualizarTotalItems();
      return true;
    }

    if (!actual) {
      this.eventoSubject.next({ ...evento });
      this.persistir();
    }

    return false;
  }

  agregarAlCarrito(tipo: TipoBoleta): boolean {
    const items = this.itemsSubject.getValue().map((item) => ({
      ...item,
      palco_ids: item.palco_ids ? [...item.palco_ids] : undefined
    }));
    const existente = items.find((item) => item.tipo.id === tipo.id);

    if (existente) {
      if (existente.cantidad >= tipo.cantidad_disponibles) {
        return false;
      }
      existente.cantidad += 1;
      if (this.esPalco(tipo)) {
        existente.palco_ids = existente.palco_ids || [];
        existente.palco_ids.push(null);
      }
    } else {
      if (tipo.cantidad_disponibles <= 0) {
        return false;
      }
      items.push({
        tipo: { ...tipo },
        cantidad: 1,
        datosAsistente: {},
        palco_ids: this.esPalco(tipo) ? [null] : undefined
      });
    }

    this.itemsSubject.next(items);
    this.persistir();
    this.actualizarTotalItems();
    return true;
  }

  agregarProductoAlCarrito(producto: Producto): boolean {
    const disponibles = producto.cantidad_disponibles ?? Math.max(
      0,
      producto.cantidad_total - (producto.cantidad_vendidas ?? 0)
    );
    if (disponibles <= 0) {
      return false;
    }

    const items = this.itemsProductosSubject.getValue().map((item) => ({
      ...item,
      producto: { ...item.producto }
    }));
    const existente = items.find((item) => item.producto.id === producto.id);
    const limite = producto.limite_por_persona ?? disponibles;

    if (existente) {
      if (existente.cantidad >= disponibles || existente.cantidad >= limite) {
        return false;
      }
      existente.cantidad += 1;
    } else {
      items.push({ producto: { ...producto }, cantidad: 1 });
    }

    this.itemsProductosSubject.next(items);
    this.persistir();
    this.actualizarTotalItems();
    return true;
  }

  quitarDelCarrito(tipoBoletaId: number): void {
    const items = this.itemsSubject.getValue().map((item) => ({
      ...item,
      palco_ids: item.palco_ids ? [...item.palco_ids] : undefined
    }));
    const index = items.findIndex((item) => item.tipo.id === tipoBoletaId);
    if (index === -1) return;

    const item = items[index];
    if (item.cantidad > 1) {
      item.cantidad -= 1;
      if (this.esPalco(item.tipo) && item.palco_ids) {
        item.palco_ids = item.palco_ids.slice(0, item.cantidad);
      }
    } else {
      items.splice(index, 1);
    }

    this.itemsSubject.next(items);
    this.persistir();
    this.actualizarTotalItems();
  }

  quitarProductoDelCarrito(productoId: number): void {
    const items = this.itemsProductosSubject.getValue().map((item) => ({
      ...item,
      producto: { ...item.producto }
    }));
    const index = items.findIndex((item) => item.producto.id === productoId);
    if (index === -1) return;

    if (items[index].cantidad > 1) {
      items[index].cantidad -= 1;
    } else {
      items.splice(index, 1);
    }

    this.itemsProductosSubject.next(items);
    this.persistir();
    this.actualizarTotalItems();
  }

  eliminarDelCarrito(tipoBoletaId: number): void {
    const filtrados = this.itemsSubject
      .getValue()
      .filter((item) => item.tipo.id !== tipoBoletaId)
      .map((item) => ({
        ...item,
        palco_ids: item.palco_ids ? [...item.palco_ids] : undefined
      }));
    this.itemsSubject.next(filtrados);
    this.persistir();
    this.actualizarTotalItems();
  }

  eliminarProductoDelCarrito(productoId: number): void {
    const filtrados = this.itemsProductosSubject
      .getValue()
      .filter((item) => item.producto.id !== productoId)
      .map((item) => ({ ...item, producto: { ...item.producto } }));
    this.itemsProductosSubject.next(filtrados);
    this.persistir();
    this.actualizarTotalItems();
  }

  reemplazarItems(items: ItemCarritoEvento[]): void {
    const clonados = items.map((item) => ({
      ...item,
      tipo: { ...item.tipo },
      palco_ids: item.palco_ids ? [...item.palco_ids] : undefined
    }));
    this.itemsSubject.next(clonados);
    this.persistir();
    this.actualizarTotalItems();
  }

  reemplazarItemsProductos(items: ItemCarritoProducto[]): void {
    const clonados = items.map((item) => ({
      ...item,
      producto: { ...item.producto }
    }));
    this.itemsProductosSubject.next(clonados);
    this.persistir();
    this.actualizarTotalItems();
  }

  vaciarCarrito(): void {
    this.itemsSubject.next([]);
    this.itemsProductosSubject.next([]);
    this.eventoSubject.next(null);
    this.clearCupon();
    this.resetEventoTieneProductosCache();
    this.persistir();
    this.actualizarTotalItems();
  }

  private actualizarTotalItems(): void {
    const boletas = this.itemsSubject.getValue().reduce((acc, item) => acc + item.cantidad, 0);
    const productos = this.itemsProductosSubject.getValue().reduce((acc, item) => acc + item.cantidad, 0);
    this.totalItemsSubject.next(boletas + productos);
  }

  private esPalco(tipo: TipoBoleta): boolean {
    return Math.max(1, Number(tipo.personas_por_unidad ?? 1)) > 1;
  }

  private hidratarDesdeStorage(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      let evento: Evento | null = null;
      let items: ItemCarritoEvento[] = [];
      let itemsProductos: ItemCarritoProducto[] = [];
      let cupon: CuponCarritoState = { ...CUPON_CARRITO_VACIO };
      let eventoTieneProductos: boolean | null = null;

      if (raw) {
        const parsed = JSON.parse(raw) as CarritoPersistido;
        evento = parsed?.evento ?? null;
        items = Array.isArray(parsed?.items) ? parsed.items : [];
        itemsProductos = Array.isArray(parsed?.itemsProductos) ? parsed.itemsProductos : [];
        if (parsed?.cupon) {
          cupon = {
            eventoId: parsed.cupon.eventoId ?? null,
            codigoCupon: parsed.cupon.codigoCupon ?? '',
            cuponAplicado: parsed.cupon.cuponAplicado ?? null,
            abierto: !!parsed.cupon.abierto,
          };
        }
        if (typeof parsed?.eventoTieneProductos === 'boolean' && evento) {
          eventoTieneProductos = parsed.eventoTieneProductos;
        }
      }

      const legacyRaw = localStorage.getItem(this.legacyProductosKey);
      if (legacyRaw) {
        try {
          const legacy = JSON.parse(legacyRaw) as { evento?: Evento | null; items?: ItemCarritoProducto[] };
          if (!evento && legacy.evento) {
            evento = legacy.evento;
          }
          if (Array.isArray(legacy.items) && legacy.items.length > 0) {
            itemsProductos = this.fusionarItemsProductos(itemsProductos, legacy.items);
          }
        } finally {
          localStorage.removeItem(this.legacyProductosKey);
        }
      }

      if (cupon.eventoId && evento && cupon.eventoId !== evento.id) {
        cupon = { ...CUPON_CARRITO_VACIO };
      }

      this.eventoSubject.next(evento);
      this.itemsSubject.next(items);
      this.itemsProductosSubject.next(itemsProductos);
      this.cuponSubject.next(cupon);
      this.eventoTieneProductosCache = eventoTieneProductos;
    } catch (error) {
      console.warn('No se pudo restaurar el carrito desde storage:', error);
      this.eventoSubject.next(null);
      this.itemsSubject.next([]);
      this.itemsProductosSubject.next([]);
      this.cuponSubject.next({ ...CUPON_CARRITO_VACIO });
      this.eventoTieneProductosCache = null;
    } finally {
      this.actualizarTotalItems();
    }
  }

  private fusionarItemsProductos(
    base: ItemCarritoProducto[],
    extra: ItemCarritoProducto[]
  ): ItemCarritoProducto[] {
    const map = new Map<number, ItemCarritoProducto>();
    for (const item of base) {
      map.set(item.producto.id, { ...item, producto: { ...item.producto } });
    }
    for (const item of extra) {
      const prev = map.get(item.producto.id);
      if (prev) {
        prev.cantidad += item.cantidad;
      } else {
        map.set(item.producto.id, { ...item, producto: { ...item.producto } });
      }
    }
    return [...map.values()];
  }

  private persistir(): void {
    const cupon = this.cuponSubject.getValue();
    const payload: CarritoPersistido = {
      evento: this.eventoSubject.getValue(),
      items: this.itemsSubject.getValue(),
      itemsProductos: this.itemsProductosSubject.getValue(),
      cupon:
        cupon.codigoCupon || cupon.cuponAplicado || cupon.abierto
          ? cupon
          : undefined,
      eventoTieneProductos:
        typeof this.eventoTieneProductosCache === 'boolean'
          ? this.eventoTieneProductosCache
          : undefined,
    };
    localStorage.setItem(this.storageKey, JSON.stringify(payload));
  }
}
