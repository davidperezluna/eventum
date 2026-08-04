import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { TrasladosBoletaService } from './traslados-boleta.service';
import { BoletasService } from './boletas.service';
import { CoversService } from './covers.service';
import { MisComprasStateService } from './mis-compras-state.service';
import { BoletaComprada, BoletaCoverCliente, TrasladoBoleta } from '../types';
import { coversEventumEnabled } from '../core/covers-feature';

export type TrasladoRecibirEntrada = TrasladoBoleta & { boletaDetail?: BoletaComprada };
export type TrasladoRecibirCover = TrasladoBoleta & { coverDetail?: BoletaCoverCliente };

export interface BandejaRecibidosData {
  entradas: TrasladoRecibirEntrada[];
  covers: TrasladoRecibirCover[];
}

@Injectable({ providedIn: 'root' })
export class TrasladosRecibirService {
  constructor(
    private authService: AuthService,
    private trasladosBoletaService: TrasladosBoletaService,
    private boletasService: BoletasService,
    private coversService: CoversService,
    private misComprasStateService: MisComprasStateService
  ) {}

  esTrasladoCover(t: TrasladoBoleta): boolean {
    return Number(t.boleta_cover_id ?? 0) > 0;
  }

  emailOrigenTraslado(t: TrasladoBoleta): string {
    const directo = t.usuario_origen?.email?.trim() || t.usuario_origen_email?.trim();
    if (directo) {
      return directo;
    }
    return '—';
  }

  tituloTrasladoRecibir(t: TrasladoRecibirEntrada | TrasladoRecibirCover): string {
    if (this.esTrasladoCover(t)) {
      const cover = t as TrasladoRecibirCover;
      return (
        cover.lugar_nombre?.trim() ||
        cover.coverDetail?.lugar_nombre?.trim() ||
        cover.evento_titulo?.trim() ||
        'Cover'
      );
    }
    const entrada = t as TrasladoRecibirEntrada;
    return (
      entrada.boletaDetail?.evento?.titulo?.trim() ||
      entrada.evento_titulo?.trim() ||
      'Evento'
    );
  }

  metaTrasladoRecibir(t: TrasladoRecibirEntrada | TrasladoRecibirCover): string {
    const origen = this.emailOrigenTraslado(t);
    if (this.esTrasladoCover(t)) {
      return `De ${origen} · ${this.nombreTipoCoverTraslado(t)}`;
    }
    const palco = (t as TrasladoRecibirEntrada).boletaDetail?.numero_palco;
    return palco != null ? `De ${origen} · Palco ${palco}` : `De ${origen}`;
  }

  labelAceptarTraslado(t: TrasladoBoleta): string {
    return this.esTrasladoCover(t) ? 'Aceptar cover' : 'Aceptar entrada';
  }

  iconoTrasladoRecibir(t: TrasladoBoleta): string {
    return this.esTrasladoCover(t) ? 'local_bar' : 'confirmation_number';
  }

  tipoTrasladoRecibir(t: TrasladoBoleta): string {
    return this.esTrasladoCover(t) ? 'Cover' : 'Entrada';
  }

  detalleTrasladoRecibir(t: TrasladoRecibirEntrada | TrasladoRecibirCover): string | null {
    if (this.esTrasladoCover(t)) {
      return this.nombreTipoCoverTraslado(t);
    }
    const palco = (t as TrasladoRecibirEntrada).boletaDetail?.numero_palco;
    return palco != null ? `Palco ${palco}` : null;
  }

  nombreTipoCoverTraslado(t: TrasladoBoleta): string {
    const cover = t as TrasladoRecibirCover;
    return (
      t.tipo_cover_nombre?.trim() ||
      cover.coverDetail?.tipo_cover_nombre?.trim() ||
      'Cover general'
    );
  }

  async cargarPendientes(): Promise<BandejaRecibidosData> {
    const uid = this.authService.getUsuarioId();
    if (!uid) {
      return { entradas: [], covers: [] };
    }

    const pend = await this.trasladosBoletaService.listarPendientesRecibir(uid);
    const pendEvento = pend.filter(
      (t) => Number(t.boleta_id ?? 0) > 0 && Number(t.boleta_cover_id ?? 0) === 0
    );
    const pendCover = pend.filter((t) => Number(t.boleta_cover_id ?? 0) > 0);

    const ids = pendEvento.map((p) => p.boleta_id!).filter((id) => id > 0);
    const detMap = new Map<number, BoletaComprada>();
    if (ids.length) {
      const det = await this.boletasService.getBoletasByIds(ids);
      det.forEach((b) => detMap.set(b.id, b));
    }

    const entradas: TrasladoRecibirEntrada[] = pendEvento.map((t) => ({
      ...t,
      boletaDetail: t.boleta_id ? detMap.get(t.boleta_id) : undefined,
    }));

    const coverDetMap = new Map<number, BoletaCoverCliente>();
    if (pendCover.length && coversEventumEnabled) {
      try {
        const boletas = await this.coversService.listarBoletasCoverCliente();
        boletas.forEach((b) => coverDetMap.set(b.id, b));
      } catch {
        // ignorar
      }
    }

    const covers: TrasladoRecibirCover[] = pendCover.map((t) => ({
      ...t,
      coverDetail: t.boleta_cover_id ? coverDetMap.get(t.boleta_cover_id) : undefined,
    }));

    this.misComprasStateService.setTrasladosPendientesCount(entradas.length + covers.length);
    return { entradas, covers };
  }

  async aceptar(t: TrasladoBoleta) {
    return this.esTrasladoCover(t)
      ? this.trasladosBoletaService.aceptarCover(t.id)
      : this.trasladosBoletaService.aceptar(t.id);
  }

  async rechazar(t: TrasladoBoleta) {
    return this.esTrasladoCover(t)
      ? this.trasladosBoletaService.rechazarCover(t.id)
      : this.trasladosBoletaService.rechazar(t.id);
  }

  /** Ruta de Mis compras donde queda visible el ítem recién aceptado. */
  rutaMisComprasTrasAceptar(t: TrasladoRecibirEntrada | TrasladoRecibirCover): string[] {
    return this.rutaMisComprasTrasAceptarVarios([t]);
  }

  /** Tras aceptar varias: mismo evento/club → detalle; mezcla o varios destinos → listado. */
  rutaMisComprasTrasAceptarVarios(
    solicitudes: Array<TrasladoRecibirEntrada | TrasladoRecibirCover>
  ): string[] {
    if (!solicitudes.length) {
      return ['/mis-compras'];
    }

    const entradas = solicitudes.filter((t) => !this.esTrasladoCover(t)) as TrasladoRecibirEntrada[];
    const covers = solicitudes.filter((t) => this.esTrasladoCover(t)) as TrasladoRecibirCover[];

    if (entradas.length > 0 && covers.length > 0) {
      return ['/mis-compras'];
    }

    if (entradas.length > 0) {
      const eventoIds = entradas.map((t) => this.eventoIdTraslado(t));
      if (eventoIds.every((id) => id != null) && new Set(eventoIds).size === 1) {
        return ['/mis-compras/evento', String(eventoIds[0])];
      }
      return ['/mis-compras'];
    }

    const lugarIds = covers.map((t) => this.lugarIdTraslado(t));
    if (lugarIds.every((id) => id != null) && new Set(lugarIds).size === 1) {
      return ['/mis-compras/club', String(lugarIds[0])];
    }
    return ['/mis-compras'];
  }

  eventoIdTraslado(t: TrasladoRecibirEntrada): number | null {
    const id = t.evento_id ?? t.boletaDetail?.evento?.id ?? null;
    if (id == null || Number(id) <= 0) {
      return null;
    }
    return Number(id);
  }

  lugarIdTraslado(t: TrasladoRecibirCover): number | null {
    const id = t.lugar_id ?? t.coverDetail?.lugar_id ?? null;
    if (id == null || Number(id) <= 0) {
      return null;
    }
    return Number(id);
  }

  invalidarCacheMisCompras(): void {
    const uid = this.authService.getUsuarioId();
    if (uid) {
      this.misComprasStateService.clear(uid);
    }
  }
}
