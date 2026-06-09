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
  /** Cover: sesión nocturna reservada. */
  sesion_cover_id?: number;
  sesion_cover_label?: string;
}

export interface ItemCarritoProducto {
  producto: Producto;
  cantidad: number;
}

/** Línea de cover vendida sin pasar por tipos_boleta / eventos. */
export interface ItemCarritoCover {
  tipo_cover_id: number;
  tipo_cover_nombre: string;
  sesion_cover_id: number;
  sesion_cover_label: string;
  sesion_fecha?: string;
  hora_apertura?: string;
  hora_cierre?: string;
  precio: number;
  cantidad: number;
  wompi_cuenta_id?: number | null;
}

export interface LugarCoverCarrito {
  id: number;
  nombre: string;
  covers_porcentaje_servicio?: number;
}

interface CarritoPersistido {
  evento: Evento | null;
  items: ItemCarritoEvento[];
  itemsProductos: ItemCarritoProducto[];
  lugarCover?: LugarCoverCarrito | null;
  itemsCover?: ItemCarritoCover[];
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
  private readonly lugarCoverSubject = new BehaviorSubject<LugarCoverCarrito | null>(null);
  private readonly itemsCoverSubject = new BehaviorSubject<ItemCarritoCover[]>([]);
  private eventoTieneProductosCache: boolean | null = null;

  readonly evento$ = this.eventoSubject.asObservable();
  readonly items$ = this.itemsSubject.asObservable();
  readonly itemsProductos$ = this.itemsProductosSubject.asObservable();
  readonly lugarCover$ = this.lugarCoverSubject.asObservable();
  readonly itemsCover$ = this.itemsCoverSubject.asObservable();
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

  getLugarCoverSnapshot(): LugarCoverCarrito | null {
    return this.lugarCoverSubject.getValue();
  }

  getItemsCoverSnapshot(): ItemCarritoCover[] {
    return this.itemsCoverSubject.getValue();
  }

  esCarritoSoloCover(): boolean {
    return this.itemsCoverSubject.getValue().length > 0 && this.itemsSubject.getValue().length === 0;
  }

  /** Boletas, productos o contexto de evento (no compatible con covers en el mismo checkout). */
  tieneContenidoEvento(): boolean {
    return (
      this.eventoSubject.getValue() != null ||
      this.itemsSubject.getValue().length > 0 ||
      this.itemsProductosSubject.getValue().length > 0
    );
  }

  tieneContenidoCover(): boolean {
    return this.itemsCoverSubject.getValue().length > 0;
  }

  limpiarContenidoEvento(): void {
    this.itemsSubject.next([]);
    this.itemsProductosSubject.next([]);
    this.eventoSubject.next(null);
    this.clearCupon();
    this.resetEventoTieneProductosCache();
    this.persistir();
    this.actualizarTotalItems();
  }

  limpiarContenidoCover(): void {
    this.itemsCoverSubject.next([]);
    this.lugarCoverSubject.next(null);
    this.persistir();
    this.actualizarTotalItems();
  }

  /**
   * Conflicto al iniciar o continuar un carrito de covers.
   * Futuro: productos del lugar podrían convivir aquí (cover_mixto).
   */
  detectarConflictoAlAgregarCover(lugarId: number): 'evento' | 'otro_lugar' | null {
    if (this.tieneContenidoEvento()) {
      return 'evento';
    }
    const lugarActual = this.lugarCoverSubject.getValue();
    if (lugarActual && lugarActual.id !== lugarId && this.tieneContenidoCover()) {
      return 'otro_lugar';
    }
    return null;
  }

  getCantidadCoverEnCarrito(sesionCoverId: number): number {
    const item = this.itemsCoverSubject.getValue().find((it) => it.sesion_cover_id === sesionCoverId);
    return item?.cantidad ?? 0;
  }

  getSubtotalCovers(): number {
    return this.itemsCoverSubject.getValue().reduce(
      (acc, item) => acc + Number(item.precio) * item.cantidad,
      0,
    );
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

  getCantidadEnCarrito(tipoBoletaId: number, sesionCoverId?: number): number {
    const item = this.findLinea(tipoBoletaId, sesionCoverId);
    return item ? item.cantidad : 0;
  }

  private findLinea(tipoBoletaId: number, sesionCoverId?: number): ItemCarritoEvento | undefined {
    return this.itemsSubject.getValue().find(
      (it) =>
        it.tipo.id === tipoBoletaId &&
        (it.sesion_cover_id ?? undefined) === (sesionCoverId ?? undefined),
    );
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
    return this.getSubtotalBoletas() + this.getSubtotalCovers() + this.getSubtotalProductos();
  }

  estaVacio(): boolean {
    return (
      this.itemsSubject.getValue().length === 0 &&
      this.itemsCoverSubject.getValue().length === 0 &&
      this.itemsProductosSubject.getValue().length === 0
    );
  }

  quitarCoverDelCarrito(sesionCoverId: number): void {
    const items = this.itemsCoverSubject.getValue().map((item) => ({ ...item }));
    const index = items.findIndex((item) => item.sesion_cover_id === sesionCoverId);
    if (index === -1) return;
    if (items[index].cantidad > 1) {
      items[index].cantidad -= 1;
    } else {
      items.splice(index, 1);
    }
    if (items.length === 0) {
      this.lugarCoverSubject.next(null);
    }
    this.itemsCoverSubject.next(items);
    this.persistir();
    this.actualizarTotalItems();
  }

  eliminarCoverDelCarrito(sesionCoverId: number): void {
    const filtrados = this.itemsCoverSubject.getValue().filter((item) => item.sesion_cover_id !== sesionCoverId);
    if (filtrados.length === 0) {
      this.lugarCoverSubject.next(null);
    }
    this.itemsCoverSubject.next(filtrados);
    this.persistir();
    this.actualizarTotalItems();
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

  agregarCoverIndependiente(params: {
    lugar: LugarCoverCarrito;
    tipoCoverId: number;
    tipoCoverNombre: string;
    sesionCoverId: number;
    sesionCoverLabel: string;
    sesionFecha?: string;
    horaApertura?: string;
    horaCierre?: string;
    precioSesion: number;
    wompiCuentaId?: number | null;
    maxCantidad?: number;
  }): boolean {
    const max = Math.max(1, params.maxCantidad ?? Number.MAX_SAFE_INTEGER);
    this.lugarCoverSubject.next({ ...params.lugar });

    const items = this.itemsCoverSubject.getValue().map((item) => ({ ...item }));
    const existente = items.find((item) => item.sesion_cover_id === params.sesionCoverId);

    if (existente) {
      if (existente.cantidad >= max) return false;
      existente.cantidad += 1;
    } else {
      if (max <= 0) return false;
      items.push({
        tipo_cover_id: params.tipoCoverId,
        tipo_cover_nombre: params.tipoCoverNombre,
        sesion_cover_id: params.sesionCoverId,
        sesion_cover_label: params.sesionCoverLabel,
        sesion_fecha: params.sesionFecha,
        hora_apertura: params.horaApertura,
        hora_cierre: params.horaCierre,
        precio: Number(params.precioSesion),
        cantidad: 1,
        wompi_cuenta_id: params.wompiCuentaId ?? null,
      });
    }

    this.itemsCoverSubject.next(items);
    this.persistir();
    this.actualizarTotalItems();
    return true;
  }

  /** @deprecated Usar agregarCoverIndependiente */
  agregarCoverAlCarrito(params: {
    evento: Evento;
    tipo: TipoBoleta;
    sesionCoverId: number;
    sesionCoverLabel: string;
    precioSesion: number;
    maxCantidad?: number;
  }): boolean {
    const max = Math.max(1, params.maxCantidad ?? params.tipo.cantidad_disponibles ?? 1);
    const tipoConPrecio: TipoBoleta = { ...params.tipo, precio: params.precioSesion };
    const conflicto = this.syncEvento(params.evento);
    if (conflicto) {
      // syncEvento vació el carrito al cambiar de evento
    }

    const items = this.itemsSubject.getValue().map((item) => ({
      ...item,
      palco_ids: item.palco_ids ? [...item.palco_ids] : undefined,
    }));
    const existente = items.find(
      (item) => item.tipo.id === tipoConPrecio.id && item.sesion_cover_id === params.sesionCoverId,
    );

    if (existente) {
      if (existente.cantidad >= max) return false;
      existente.cantidad += 1;
    } else {
      if (max <= 0) return false;
      items.push({
        tipo: { ...tipoConPrecio },
        cantidad: 1,
        datosAsistente: {},
        palco_ids: undefined,
        sesion_cover_id: params.sesionCoverId,
        sesion_cover_label: params.sesionCoverLabel,
      });
    }

    this.itemsSubject.next(items);
    this.persistir();
    this.actualizarTotalItems();
    return true;
  }

  /** Stock de boletas según tipo (sin límite por persona). */
  stockBoleta(tipo: TipoBoleta): number {
    const vendidas = Number(tipo.cantidad_vendidas ?? 0);
    const total = Number(tipo.cantidad_total ?? 0);
    const calculado = Number.isFinite(total) ? Math.max(0, total - vendidas) : 0;
    const raw = Number(tipo.cantidad_disponibles);
    if (!Number.isFinite(raw)) {
      return calculado;
    }
    return Math.max(0, raw);
  }

  /** Máximo permitido en carrito: stock (opcionalmente acotado) + límite por persona. */
  maxCantidadBoleta(tipo: TipoBoleta, stockOverride?: number | null): number {
    const stockBase =
      stockOverride != null && Number.isFinite(stockOverride)
        ? Math.max(0, stockOverride)
        : this.stockBoleta(tipo);
    const limite = tipo.limite_por_persona;
    if (limite != null && limite > 0) {
      return Math.min(stockBase, limite);
    }
    return stockBase;
  }

  agregarAlCarrito(
    tipo: TipoBoleta,
    sesionCoverId?: number,
    maxCantidad?: number,
  ): boolean {
    const max = Math.max(0, maxCantidad ?? this.maxCantidadBoleta(tipo));
    if (max <= 0) {
      return false;
    }

    const items = this.itemsSubject.getValue().map((item) => ({
      ...item,
      palco_ids: item.palco_ids ? [...item.palco_ids] : undefined
    }));
    const existente = items.find(
      (item) => item.tipo.id === tipo.id && (item.sesion_cover_id ?? undefined) === (sesionCoverId ?? undefined),
    );

    if (existente) {
      if (existente.cantidad >= max) {
        return false;
      }
      existente.cantidad += 1;
      if (this.esPalco(tipo)) {
        existente.palco_ids = existente.palco_ids || [];
        existente.palco_ids.push(null);
      }
    } else {
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

  quitarDelCarrito(tipoBoletaId: number, sesionCoverId?: number): void {
    const items = this.itemsSubject.getValue().map((item) => ({
      ...item,
      palco_ids: item.palco_ids ? [...item.palco_ids] : undefined
    }));
    const index = items.findIndex(
      (item) =>
        item.tipo.id === tipoBoletaId &&
        (item.sesion_cover_id ?? undefined) === (sesionCoverId ?? undefined),
    );
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

  eliminarDelCarrito(tipoBoletaId: number, sesionCoverId?: number): void {
    const filtrados = this.itemsSubject
      .getValue()
      .filter(
        (item) =>
          !(
            item.tipo.id === tipoBoletaId &&
            (item.sesion_cover_id ?? undefined) === (sesionCoverId ?? undefined)
          ),
      )
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
    this.itemsCoverSubject.next([]);
    this.itemsProductosSubject.next([]);
    this.eventoSubject.next(null);
    this.lugarCoverSubject.next(null);
    this.clearCupon();
    this.resetEventoTieneProductosCache();
    this.persistir();
    this.actualizarTotalItems();
  }

  private actualizarTotalItems(): void {
    const boletas = this.itemsSubject.getValue().reduce((acc, item) => acc + item.cantidad, 0);
    const covers = this.itemsCoverSubject.getValue().reduce((acc, item) => acc + item.cantidad, 0);
    const productos = this.itemsProductosSubject.getValue().reduce((acc, item) => acc + item.cantidad, 0);
    this.totalItemsSubject.next(boletas + covers + productos);
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
      let lugarCover: LugarCoverCarrito | null = null;
      let itemsCover: ItemCarritoCover[] = [];

      if (raw) {
        const parsed = JSON.parse(raw) as CarritoPersistido;
        evento = parsed?.evento ?? null;
        items = Array.isArray(parsed?.items) ? parsed.items : [];
        itemsProductos = Array.isArray(parsed?.itemsProductos) ? parsed.itemsProductos : [];
        lugarCover = parsed?.lugarCover ?? null;
        itemsCover = Array.isArray(parsed?.itemsCover) ? parsed.itemsCover : [];
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
      this.lugarCoverSubject.next(lugarCover);
      this.itemsCoverSubject.next(itemsCover);
      this.cuponSubject.next(cupon);
      this.eventoTieneProductosCache = eventoTieneProductos;
    } catch (error) {
      console.warn('No se pudo restaurar el carrito desde storage:', error);
      this.eventoSubject.next(null);
      this.itemsSubject.next([]);
      this.itemsCoverSubject.next([]);
      this.lugarCoverSubject.next(null);
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
      lugarCover: this.lugarCoverSubject.getValue(),
      itemsCover: this.itemsCoverSubject.getValue(),
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
