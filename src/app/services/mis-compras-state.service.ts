import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { BoletaComprada, Compra, CompraProducto, Evento, TrasladoBoleta } from '../types';
import { BoletaCoverCliente, CompraCoverCliente } from '../types/covers';
import { AppCacheService } from './app-cache.service';

export interface BoletaCoverMisComprasItem {
  compra: CompraCoverCliente;
  boleta: BoletaCoverCliente;
  esCedida?: boolean;
}

export interface LugarCoverMisComprasGrupo {
  key: string;
  lugarId: number;
  lugarNombre: string;
  compras: CompraCoverCliente[];
  boletas: BoletaCoverMisComprasItem[];
  totalBoletas: number;
  totalDisponibles: number;
  totalUsadas: number;
}

export interface PromoProductosMisCompras {
  eventoId: number;
  titulo: string;
  cantidad: number;
  precioMinimo: number;
  sinComprasProducto: boolean;
  totalEventosConProductos: number;
}

export interface MisComprasState {
  compras: Compra[];
  comprasProductos: CompraProducto[];
  comprasConBoletas: Array<{ compra: Compra; boletas: BoletaComprada[] }>;
  eventosConBoletas: any[];
  eventosDisponibles: Evento[];
  trasladosHistorial: TrasladoBoleta[];
  trasladosPendientesRecibir: any[];
  entradasCedidas: BoletaComprada[];
  estadoPagoFiltro: string | null;
  estadoCompraFiltro: string | null;
  eventoFiltro: number | null;
  fechaDesde: string;
  fechaHasta: string;
  searchTerm: string;
  page: number;
  total: number;
  totalPages: number;
  tabBoletasDetalle: 'sin-usar' | 'usadas' | 'sin-asignar';
  eventoExpandidoKey: string | null;
  eventoDetalleKey: string | null;
  promoProductos: PromoProductosMisCompras | null;
  comprasCover: CompraCoverCliente[];
  boletasCover: BoletaCoverMisComprasItem[];
  coverCedidas: BoletaCoverMisComprasItem[];
  trasladosPendientesRecibirCover: any[];
  tabMisComprasPrincipal: 'eventos' | 'covers' | 'acceso';
  lastUpdated: number;
}

interface MisComprasPublicState {
  compras: Compra[];
  eventosConBoletas: any[];
  eventosDisponibles: Evento[];
  estadoPagoFiltro: string | null;
  estadoCompraFiltro: string | null;
  eventoFiltro: number | null;
  fechaDesde: string;
  fechaHasta: string;
  searchTerm: string;
  page: number;
  total: number;
  totalPages: number;
  tabBoletasDetalle: 'sin-usar' | 'usadas' | 'sin-asignar';
  eventoExpandidoKey: string | null;
  eventoDetalleKey: string | null;
  promoProductos: PromoProductosMisCompras | null;
  tabMisComprasPrincipal: 'eventos' | 'covers' | 'acceso';
  lastUpdated: number;
}

interface MisComprasSensitiveState {
  comprasProductos: CompraProducto[];
  comprasConBoletas: Array<{ compra: Compra; boletas: BoletaComprada[] }>;
  trasladosHistorial: TrasladoBoleta[];
  trasladosPendientesRecibir: any[];
  entradasCedidas: BoletaComprada[];
  comprasCover: CompraCoverCliente[];
  boletasCover: BoletaCoverMisComprasItem[];
  coverCedidas: BoletaCoverMisComprasItem[];
  trasladosPendientesRecibirCover: any[];
}

@Injectable({
  providedIn: 'root'
})
export class MisComprasStateService {
  private readonly ttlMs = 2 * 60 * 1000;
  private readonly trasladosPendientesCountSubject = new BehaviorSubject(0);
  readonly trasladosPendientesCount$ = this.trasladosPendientesCountSubject.asObservable();

  constructor(private appCacheService: AppCacheService) {}

  setTrasladosPendientesCount(count: number): void {
    this.trasladosPendientesCountSubject.next(Math.max(0, count));
  }

  hydrateTrasladosPendientesCountFromState(userId: number): void {
    const state = this.getState(userId);
    if (!state) return;
    const total =
      (state.trasladosPendientesRecibir?.length ?? 0) +
      (state.trasladosPendientesRecibirCover?.length ?? 0);
    this.setTrasladosPendientesCount(total);
  }

  getState(userId: number): MisComprasState | null {
    const publicState = this.appCacheService.get<MisComprasPublicState>(this.publicCacheKey(userId), 'local');
    if (!publicState) return null;
    const sensitiveState = this.appCacheService.get<MisComprasSensitiveState>(this.sensitiveCacheKey(userId), 'session');

    const state: MisComprasState = {
      ...publicState,
      comprasProductos: sensitiveState?.comprasProductos || [],
      comprasConBoletas: sensitiveState?.comprasConBoletas || [],
      trasladosHistorial: sensitiveState?.trasladosHistorial || [],
      trasladosPendientesRecibir: sensitiveState?.trasladosPendientesRecibir || [],
      entradasCedidas: sensitiveState?.entradasCedidas || [],
      comprasCover: sensitiveState?.comprasCover || [],
      boletasCover: sensitiveState?.boletasCover || [],
      coverCedidas: sensitiveState?.coverCedidas || [],
      trasladosPendientesRecibirCover: sensitiveState?.trasladosPendientesRecibirCover || [],
      tabMisComprasPrincipal: publicState.tabMisComprasPrincipal || 'eventos',
    };
    return this.cloneState(state);
  }

  saveState(userId: number, state: MisComprasState): void {
    const safeState = this.cloneState(state);

    const publicState: MisComprasPublicState = {
      compras: safeState.compras,
      eventosConBoletas: this.stripSensitiveBoletas(safeState.eventosConBoletas),
      eventosDisponibles: safeState.eventosDisponibles,
      estadoPagoFiltro: safeState.estadoPagoFiltro,
      estadoCompraFiltro: safeState.estadoCompraFiltro,
      eventoFiltro: safeState.eventoFiltro,
      fechaDesde: safeState.fechaDesde,
      fechaHasta: safeState.fechaHasta,
      searchTerm: safeState.searchTerm,
      page: safeState.page,
      total: safeState.total,
      totalPages: safeState.totalPages,
      tabBoletasDetalle: safeState.tabBoletasDetalle,
      eventoExpandidoKey: safeState.eventoExpandidoKey,
      eventoDetalleKey: safeState.eventoDetalleKey,
      promoProductos: safeState.promoProductos ? { ...safeState.promoProductos } : null,
      tabMisComprasPrincipal: safeState.tabMisComprasPrincipal || 'eventos',
      lastUpdated: safeState.lastUpdated
    };

    const sensitiveState: MisComprasSensitiveState = {
      comprasProductos: safeState.comprasProductos,
      comprasConBoletas: safeState.comprasConBoletas,
      trasladosHistorial: safeState.trasladosHistorial,
      trasladosPendientesRecibir: safeState.trasladosPendientesRecibir,
      entradasCedidas: safeState.entradasCedidas,
      comprasCover: safeState.comprasCover,
      boletasCover: safeState.boletasCover,
      coverCedidas: safeState.coverCedidas,
      trasladosPendientesRecibirCover: safeState.trasladosPendientesRecibirCover,
    };

    this.appCacheService.set(this.publicCacheKey(userId), publicState, 'local');
    this.appCacheService.set(this.sensitiveCacheKey(userId), sensitiveState, 'session');
  }

  isCacheFresh(userId: number, now: number = Date.now()): boolean {
    const state = this.getState(userId);
    if (!state) return false;
    return now - state.lastUpdated < this.ttlMs;
  }

  clear(userId: number): void {
    this.appCacheService.remove(this.publicCacheKey(userId), 'local');
    this.appCacheService.remove(this.sensitiveCacheKey(userId), 'session');
    this.setTrasladosPendientesCount(0);
  }

  private publicCacheKey(userId: number): string {
    return `eventum:cache:v1:mis-compras:public:user:${userId}`;
  }

  private sensitiveCacheKey(userId: number): string {
    return `eventum:cache:v1:mis-compras:sensitive:user:${userId}`;
  }

  private cloneState(state: MisComprasState): MisComprasState {
    return {
      ...state,
      compras: [...state.compras],
      comprasProductos: [...(state.comprasProductos || [])],
      comprasConBoletas: state.comprasConBoletas.map((i) => ({ compra: i.compra, boletas: [...i.boletas] })),
      eventosConBoletas: [...state.eventosConBoletas],
      promoProductos: state.promoProductos ? { ...state.promoProductos } : null,
      eventosDisponibles: [...state.eventosDisponibles],
      trasladosHistorial: [...state.trasladosHistorial],
      trasladosPendientesRecibir: [...state.trasladosPendientesRecibir],
      entradasCedidas: [...state.entradasCedidas],
      comprasCover: [...(state.comprasCover || [])],
      boletasCover: (state.boletasCover || []).map((item) => ({
        compra: { ...item.compra },
        boleta: { ...item.boleta },
        esCedida: item.esCedida,
      })),
      coverCedidas: (state.coverCedidas || []).map((item) => ({
        compra: { ...item.compra },
        boleta: { ...item.boleta },
        esCedida: item.esCedida,
      })),
      trasladosPendientesRecibirCover: [...(state.trasladosPendientesRecibirCover || [])],
      tabMisComprasPrincipal: state.tabMisComprasPrincipal || 'eventos',
    };
  }

  private stripSensitiveBoletas(eventosConBoletas: any[]): any[] {
    return (eventosConBoletas || []).map((evento) => ({
      ...evento,
      tipos: (evento?.tipos || []).map((tipo: any) => ({
        ...tipo,
        boletas: []
      }))
    }));
  }
}
