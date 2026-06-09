import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  CoverAccesoPuertaContext,
  CoverAccesoPuertaItem,
  filtrarAccesosPuertaActivos,
  puedeMostrarQrCover,
} from '../core/cover-acceso-puerta';
import { BoletaCoverCliente, CompraCoverCliente } from '../types/covers';
import { EstadoTrasladoBoleta, TrasladoBoleta, TipoEstadoPago } from '../types';
import { AuthService } from './auth.service';
import { CoversService } from './covers.service';
import { TrasladosBoletaService } from './traslados-boleta.service';
import { SupabaseService } from './supabase.service';
import { AccesosPuertaStateService } from './accesos-puerta-state.service';

export interface CoverAccesoNotificacionEvento {
  tipo: 'cover_entrada_registrada' | 'cover_salida_registrada';
  metadata: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root',
})
export class AccesosPuertaService {
  private readonly activosSubject = new BehaviorSubject<CoverAccesoPuertaItem[]>([]);
  private readonly notificacionSubject = new Subject<CoverAccesoNotificacionEvento>();

  readonly activos$ = this.activosSubject.asObservable();
  readonly count$ = this.activos$.pipe(map((items) => items.length));
  readonly tieneAccesos$ = this.activos$.pipe(map((items) => items.length > 0));
  readonly notificacionCover$ = this.notificacionSubject.asObservable();

  private allItems: CoverAccesoPuertaItem[] = [];
  private trasladoSalienteIds = new Set<number>();
  private channel: RealtimeChannel | null = null;
  private realtimeUsuarioId: number | null = null;
  private pageRealtimeActivo = false;

  constructor(
    private authService: AuthService,
    private coversService: CoversService,
    private trasladosBoletaService: TrasladosBoletaService,
    private supabaseService: SupabaseService,
    private accesosPuertaStateService: AccesosPuertaStateService,
    private ngZone: NgZone
  ) {}

  getActivos(): CoverAccesoPuertaItem[] {
    return this.activosSubject.value.map((item) => ({
      compra: { ...item.compra },
      boleta: { ...item.boleta },
      esCedida: item.esCedida,
    }));
  }

  getCount(): number {
    return this.activosSubject.value.length;
  }

  puedeMostrarQr(item: CoverAccesoPuertaItem): boolean {
    return puedeMostrarQrCover(item, this.buildContext());
  }

  private buildContext(): CoverAccesoPuertaContext {
    return {
      usuarioId: this.authService.getUsuarioId(),
      trasladoSalienteBoletaCoverIds: this.trasladoSalienteIds,
    };
  }

  private emitActivos(): void {
    const activos = filtrarAccesosPuertaActivos(this.allItems, this.buildContext());
    this.activosSubject.next(activos);

    const userId = this.authService.getUsuarioId();
    if (userId) {
      this.accesosPuertaStateService.saveState(userId, {
        allItems: this.allItems,
        activos,
        lastUpdated: Date.now(),
      });
    }
  }

  hydrateFromCache(userId: number): boolean {
    const cached = this.accesosPuertaStateService.getState(userId);
    if (!cached) return false;
    this.allItems = cached.allItems.map((item) => ({
      compra: { ...item.compra },
      boleta: { ...item.boleta },
      esCedida: item.esCedida,
    }));
    this.activosSubject.next(
      cached.activos.map((item) => ({
        compra: { ...item.compra },
        boleta: { ...item.boleta },
        esCedida: item.esCedida,
      }))
    );
    return true;
  }

  syncFromBoletasCover(
    boletas: CoverAccesoPuertaItem[],
    trasladoSalientePorBoletaCoverId?: Map<number, unknown>
  ): void {
    if (trasladoSalientePorBoletaCoverId) {
      this.trasladoSalienteIds = new Set(trasladoSalientePorBoletaCoverId.keys());
    }
    this.allItems = boletas.map((item) => ({
      compra: { ...item.compra },
      boleta: { ...item.boleta },
      esCedida: item.esCedida,
    }));
    this.emitActivos();
  }

  aplicarAccesoEnCaliente(metadata: Record<string, unknown>): boolean {
    const boletaCoverId = Number(metadata['boleta_cover_id'] ?? 0);
    if (!Number.isFinite(boletaCoverId) || boletaCoverId <= 0) {
      return false;
    }

    const estadoRaw = String(metadata['estado_acceso'] || '').toLowerCase();
    if (!estadoRaw) {
      return false;
    }

    let found = false;
    this.allItems = this.allItems.map((item) => {
      if (item.boleta.id !== boletaCoverId) {
        return item;
      }
      found = true;
      return {
        ...item,
        boleta: {
          ...item.boleta,
          estado_acceso: estadoRaw as BoletaCoverCliente['estado_acceso'],
        },
      };
    });

    if (found) {
      this.emitActivos();
    }
    return found;
  }

  activarRealtimePagina(): void {
    this.pageRealtimeActivo = true;
    this.iniciarRealtimeSiCorresponde();
  }

  desactivarRealtimePagina(): void {
    this.pageRealtimeActivo = false;
    this.detenerRealtime();
  }

  private iniciarRealtimeSiCorresponde(): void {
    if (!this.pageRealtimeActivo) {
      return;
    }

    const usuarioId = this.authService.getUsuarioId();
    if (!usuarioId) {
      this.detenerRealtime();
      return;
    }

    if (this.channel && this.realtimeUsuarioId === usuarioId) {
      return;
    }

    this.detenerRealtime();
    this.realtimeUsuarioId = usuarioId;

    this.channel = this.supabaseService
      .getClient()
      .channel(`accesos-puerta-${usuarioId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones_usuario',
        },
        (payload) => {
          this.ngZone.run(() => {
            const row = payload.new as {
              usuario_id?: number | string | null;
              tipo?: string | null;
              metadata?: Record<string, unknown> | null;
            };
            const rowUsuarioId = Number(row?.usuario_id ?? 0);
            if (!Number.isFinite(rowUsuarioId) || rowUsuarioId !== usuarioId) {
              return;
            }

            const tipo = String(row?.tipo || '').toLowerCase();
            if (tipo !== 'cover_entrada_registrada' && tipo !== 'cover_salida_registrada') {
              return;
            }

            const metadata = row.metadata ?? {};
            this.aplicarAccesoEnCaliente(metadata);
            this.notificacionSubject.next({
              tipo,
              metadata,
            });
          });
        }
      )
      .subscribe();
  }

  private detenerRealtime(): void {
    if (this.channel) {
      void this.supabaseService.getClient().removeChannel(this.channel);
      this.channel = null;
    }
    this.realtimeUsuarioId = null;
  }

  clear(): void {
    this.allItems = [];
    this.trasladoSalienteIds.clear();
    this.activosSubject.next([]);
    this.detenerRealtime();
    this.pageRealtimeActivo = false;
  }

  async refresh(options?: { background?: boolean }): Promise<void> {
    const uid = this.authService.getUsuarioId();
    if (!uid) {
      this.clear();
      return;
    }

    const background = options?.background ?? this.allItems.length > 0;
    if (!background) {
      this.allItems = [];
      this.emitActivos();
    }

    try {
      const [comprasRaw, allBoletas, trasladosSalientes] = await Promise.all([
        this.coversService.listarComprasCoverCliente(),
        this.coversService.listarBoletasCoverCliente(),
        this.trasladosBoletaService.listarTrasladosSalientes(uid).catch(() => [] as TrasladoBoleta[]),
      ]);

      this.trasladoSalienteIds = new Set(
        (trasladosSalientes || [])
          .filter((t) => this.esEstadoTrasladoSalienteActivo(t.estado))
          .map((t) => Number(t.boleta_cover_id))
          .filter((id) => Number.isFinite(id) && id > 0)
      );

      const compras = comprasRaw.filter(
        (compra) => (compra.estado_pago || '').toLowerCase() === TipoEstadoPago.COMPLETADO
      );

      const ownedItems: CoverAccesoPuertaItem[] = [];
      for (const compra of compras) {
        const boletas = allBoletas.filter((boleta) => {
          if (boleta.compra_cover_id !== compra.id) return false;
          const titular = boleta.titular_cliente_id ?? compra.cliente_id;
          return titular === uid && (boleta.estado || '').toLowerCase() !== 'cancelada';
        });
        for (const boleta of boletas) {
          ownedItems.push({
            compra,
            boleta: {
              ...boleta,
              lugar_nombre: boleta.lugar_nombre || compra.lugar_nombre,
            },
            esCedida: false,
          });
        }
      }

      let cedidas: CoverAccesoPuertaItem[] = [];
      try {
        const cedidasRaw = await this.coversService.getCoversCedidosTitular(uid, allBoletas);
        cedidas = cedidasRaw
          .filter((boleta) => (boleta.estado || '').toLowerCase() !== 'cancelada')
          .map((boleta) => ({
            compra: this.compraVistaParaCoverCedido(boleta),
            boleta,
            esCedida: true,
          }));
      } catch {
        cedidas = [];
      }

      this.allItems = [...ownedItems, ...cedidas];
      this.emitActivos();
    } catch (err) {
      console.error('[AccesosPuerta] Error refrescando:', err);
      if (!background) {
        this.allItems = [];
        this.emitActivos();
      }
    }
  }

  private compraVistaParaCoverCedido(boleta: BoletaCoverCliente): CompraCoverCliente {
    return {
      id: boleta.compra_cover_id,
      cliente_id: boleta.compra_cliente_id ?? 0,
      numero_transaccion: boleta.compra_numero_transaccion,
      lugar_id: boleta.lugar_id,
      lugar_nombre: boleta.lugar_nombre,
      total: 0,
      estado_pago: boleta.compra_estado_pago,
      estado_compra: boleta.compra_estado_compra,
      fecha_compra: boleta.compra_fecha_compra,
      boletas_count: 1,
    };
  }

  private esEstadoTrasladoSalienteActivo(estado: string | undefined): boolean {
    const e = String(estado ?? '');
    return e === EstadoTrasladoBoleta.ENVIADO || e === EstadoTrasladoBoleta.RECIBIDO;
  }
}
