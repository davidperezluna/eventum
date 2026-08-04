import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import {
  BandejaRecibidosData,
  TrasladoRecibirCover,
  TrasladoRecibirEntrada,
  TrasladosRecibirService,
} from '../../services/traslados-recibir.service';
import { AlertService } from '../../services/alert.service';
import { TrasladoBoleta } from '../../types';
import { coversEventumEnabled } from '../../core/covers-feature';

@Component({
  selector: 'app-recibidos',
  imports: [CommonModule, RouterModule],
  templateUrl: './recibidos.html',
  styleUrl: './recibidos.css',
})
export class Recibidos implements OnInit {
  readonly coversEventumEnabled = coversEventumEnabled;

  loading = true;
  procesandoId: number | null = null;
  aceptandoTodas = false;
  entradas: TrasladoRecibirEntrada[] = [];
  covers: TrasladoRecibirCover[] = [];

  constructor(
    private trasladosRecibirService: TrasladosRecibirService,
    private alertService: AlertService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.recargar();
  }

  get totalPendientes(): number {
    return this.entradas.length + this.covers.length;
  }

  get solicitudes(): Array<TrasladoRecibirEntrada | TrasladoRecibirCover> {
    return [...this.entradas, ...(this.coversEventumEnabled ? this.covers : [])];
  }

  get procesando(): boolean {
    return this.procesandoId != null || this.aceptandoTodas;
  }

  esCover(t: TrasladoBoleta): boolean {
    return this.trasladosRecibirService.esTrasladoCover(t);
  }

  remitente(t: TrasladoBoleta): string {
    return this.trasladosRecibirService.emailOrigenTraslado(t);
  }

  detalle(t: TrasladoBoleta): string | null {
    return this.trasladosRecibirService.detalleTrasladoRecibir(t);
  }

  async recargar(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      const data = await this.trasladosRecibirService.cargarPendientes();
      this.aplicarData(data);
    } catch (e) {
      console.error('Error cargando recibidos:', e);
      await this.alertService.error('Error', 'No se pudieron cargar las solicitudes.');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  titulo(t: TrasladoBoleta): string {
    return this.trasladosRecibirService.tituloTrasladoRecibir(t);
  }

  labelAceptar(t: TrasladoBoleta): string {
    return this.trasladosRecibirService.labelAceptarTraslado(t);
  }

  tipo(t: TrasladoBoleta): string {
    return this.trasladosRecibirService.tipoTrasladoRecibir(t);
  }

  async aceptar(t: TrasladoRecibirEntrada | TrasladoRecibirCover): Promise<void> {
    if (this.procesando) return;
    this.procesandoId = t.id;
    this.cdr.detectChanges();
    try {
      const res = await this.trasladosRecibirService.aceptar(t);
      if (!res.ok) {
        await this.alertService.error('Error', res.error || 'No se pudo aceptar.');
        return;
      }
      this.trasladosRecibirService.invalidarCacheMisCompras();
      const ruta = this.trasladosRecibirService.rutaMisComprasTrasAceptar(t);
      await this.router.navigate(ruta);
    } finally {
      this.procesandoId = null;
      this.cdr.detectChanges();
    }
  }

  async aceptarTodas(): Promise<void> {
    if (this.procesando || this.totalPendientes < 2) return;

    const pendientes = [...this.solicitudes];
    const confirmado = await this.alertService.confirm(
      'Aceptar todas',
      `¿Aceptar las ${pendientes.length} solicitudes pendientes?`
    );
    if (!confirmado) return;

    this.aceptandoTodas = true;
    this.cdr.detectChanges();
    try {
      for (const t of pendientes) {
        const res = await this.trasladosRecibirService.aceptar(t);
        if (!res.ok) {
          await this.alertService.error('Error', res.error || 'No se pudo aceptar una solicitud.');
          this.trasladosRecibirService.invalidarCacheMisCompras();
          const data = await this.trasladosRecibirService.cargarPendientes();
          this.aplicarData(data);
          return;
        }
      }
      this.trasladosRecibirService.invalidarCacheMisCompras();
      const ruta = this.trasladosRecibirService.rutaMisComprasTrasAceptarVarios(pendientes);
      await this.router.navigate(ruta);
    } finally {
      this.aceptandoTodas = false;
      this.cdr.detectChanges();
    }
  }

  async rechazar(t: TrasladoBoleta): Promise<void> {
    if (this.procesando) return;
    const esCover = this.trasladosRecibirService.esTrasladoCover(t);
    const confirmado = await this.alertService.confirm(
      esCover ? 'Rechazar cover' : 'Rechazar entrada',
      esCover
        ? 'El remitente recuperará el cover si rechazas.'
        : 'El remitente recuperará la entrada si rechazas.'
    );
    if (!confirmado) return;

    this.procesandoId = t.id;
    this.cdr.detectChanges();
    try {
      const res = await this.trasladosRecibirService.rechazar(t);
      if (!res.ok) {
        await this.alertService.error('Error', res.error || 'No se pudo rechazar.');
        return;
      }
      this.trasladosRecibirService.invalidarCacheMisCompras();
      const data = await this.trasladosRecibirService.cargarPendientes();
      this.aplicarData(data);
    } finally {
      this.procesandoId = null;
      this.cdr.detectChanges();
    }
  }

  private aplicarData(data: BandejaRecibidosData): void {
    this.entradas = data.entradas;
    this.covers = data.covers;
  }
}
