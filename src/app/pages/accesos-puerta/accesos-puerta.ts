import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subject, Subscription, takeUntil } from 'rxjs';
import QRCode from 'qrcode';
import {
  accionCoverAccesoPuerta,
  CoverAccesoPuertaItem,
  coverAccesoUtilizadoEnPuerta,
  getEstadoCoverClass,
  getEstadoCoverLabel,
  hintQrCoverAcceso,
  iconoBotonQrCover,
  labelBotonQrCover,
  labelTiempoRestanteSesionCover,
  mensajeEstadoPuerta,
  sesionProgresoCover,
} from '../../core/cover-acceso-puerta';
import { formatHoraCover, labelSesionCover } from '../../core/covers-labels';
import { coversEventumEnabled } from '../../core/covers-feature';
import {
  AccesosPuertaService,
  CoverAccesoNotificacionEvento,
} from '../../services/accesos-puerta.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { BoletaCoverCliente } from '../../types/covers';
import { TipoEstadoPago } from '../../types';

@Component({
  selector: 'app-accesos-puerta',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './accesos-puerta.html',
  styleUrls: ['../cupos-evento/cupos-evento.css', './accesos-puerta.css'],
})
export class AccesosPuerta implements OnInit, OnDestroy {
  readonly coversEventumEnabled = coversEventumEnabled;
  readonly mensajeAutoCloseMs = 2800;

  @ViewChild('carousel') carouselRef?: ElementRef<HTMLElement>;

  loading = false;
  isRefreshing = false;
  accesos: CoverAccesoPuertaItem[] = [];
  focusedIndex = 0;
  nowTick = Date.now();

  showCoverQrModal = false;
  coverSeleccionado: CoverAccesoPuertaItem | null = null;
  coverQrCodeUrl = '';
  loadingCoverQR = false;

  showMensajeIngresoModal = false;
  mensajeIngresoTitulo = '';
  mensajeIngresoDetalle = '';
  mensajeIngresoReferencia = '';
  mensajeIngresoEvento = '';
  mensajeIngresoTipo: 'cover' | 'cover-salida' = 'cover';

  private readonly destroy$ = new Subject<void>();
  private notificacionSub: Subscription | null = null;
  private activosSub: Subscription | null = null;
  private refreshIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
  private mensajeAutoCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private readonly refreshIndicatorDelayMs = 800;
  private hadCachedDataOnInit = false;
  private readonly qrThumbs = new Map<number, string>();
  private readonly qrThumbPending = new Set<number>();

  constructor(
    private accesosPuertaService: AccesosPuertaService,
    private authService: AuthService,
    private alertService: AlertService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    if (!this.coversEventumEnabled) {
      void this.router.navigate(['/eventos-cliente']);
      return;
    }

    const userId = this.authService.getUsuarioId();
    if (!userId) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: '/accesos-puerta' },
      });
      return;
    }

    this.hadCachedDataOnInit = this.accesosPuertaService.hydrateFromCache(userId);
    if (this.hadCachedDataOnInit) {
      this.accesos = this.accesosPuertaService.getActivos();
      this.loading = false;
      this.ensureQrThumbs(this.accesos);
    } else {
      this.loading = true;
    }

    this.clockTimer = setInterval(() => {
      this.nowTick = Date.now();
      this.refreshView();
    }, 30_000);

    this.activosSub = this.accesosPuertaService.activos$
      .pipe(takeUntil(this.destroy$))
      .subscribe((items) => {
        this.accesos = items;
        if (this.focusedIndex >= items.length) {
          this.focusedIndex = Math.max(0, items.length - 1);
        }
        this.ensureQrThumbs(items);
        this.cdr.detectChanges();
      });

    this.accesosPuertaService.activarRealtimePagina();
    this.notificacionSub = this.accesosPuertaService.notificacionCover$
      .pipe(takeUntil(this.destroy$))
      .subscribe((evento) => this.onNotificacionCover(evento));

    void this.cargar({ background: this.hadCachedDataOnInit });
  }

  ngOnDestroy(): void {
    this.accesosPuertaService.desactivarRealtimePagina();
    this.stopSilentRefreshIndicator();
    this.cancelarCierreMensajeIngreso();
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
    this.notificacionSub = null;
    this.activosSub = null;
  }

  private refreshView(): void {
    this.ngZone.run(() => this.cdr.detectChanges());
  }

  async cargar(options?: { background?: boolean }): Promise<void> {
    const background = options?.background ?? this.accesos.length > 0;
    const silentRefreshMode = background || this.accesos.length > 0;

    if (typeof navigator !== 'undefined' && !navigator.onLine && this.accesos.length > 0) {
      this.loading = false;
      this.stopSilentRefreshIndicator();
      this.refreshView();
      return;
    }

    this.loading = !silentRefreshMode && this.accesos.length === 0;
    if (silentRefreshMode) {
      this.startSilentRefreshIndicator();
    } else {
      this.stopSilentRefreshIndicator();
    }
    this.refreshView();

    try {
      await this.accesosPuertaService.refresh({ background: silentRefreshMode });
    } finally {
      this.loading = false;
      this.stopSilentRefreshIndicator();
      this.refreshView();
    }
  }

  accion(item: CoverAccesoPuertaItem): 'entrada' | 'salida' {
    return accionCoverAccesoPuerta(item);
  }

  labelBoton(item: CoverAccesoPuertaItem): string {
    return labelBotonQrCover(item);
  }

  iconoBoton(item: CoverAccesoPuertaItem): string {
    return iconoBotonQrCover(item);
  }

  estadoLabel(boleta: BoletaCoverCliente): string {
    return getEstadoCoverLabel(boleta);
  }

  estadoClass(boleta: BoletaCoverCliente): string {
    return getEstadoCoverClass(boleta);
  }

  mensajeEstado(item: CoverAccesoPuertaItem): string {
    return mensajeEstadoPuerta(item);
  }

  progresoSesion(boleta: BoletaCoverCliente): number {
    void this.nowTick;
    return sesionProgresoCover(boleta, new Date(this.nowTick));
  }

  tiempoRestante(boleta: BoletaCoverCliente): string {
    void this.nowTick;
    return labelTiempoRestanteSesionCover(boleta, new Date(this.nowTick));
  }

  qrThumb(item: CoverAccesoPuertaItem): string | null {
    return this.qrThumbs.get(item.boleta.id) ?? null;
  }

  irAlIndice(index: number): void {
    const el = this.carouselRef?.nativeElement;
    if (!el) {
      this.focusedIndex = index;
      return;
    }
    const card = el.children.item(index) as HTMLElement | null;
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
    this.focusedIndex = index;
  }

  onCarouselScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const cards = Array.from(el.querySelectorAll<HTMLElement>('.ap-pass'));
    if (cards.length === 0) return;

    const center = el.scrollLeft + el.clientWidth / 2;
    let closest = 0;
    let minDist = Number.POSITIVE_INFINITY;
    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(center - cardCenter);
      if (dist < minDist) {
        minDist = dist;
        closest = index;
      }
    });

    if (closest !== this.focusedIndex) {
      this.focusedIndex = closest;
      this.refreshView();
    }
  }

  labelSesion(boleta: BoletaCoverCliente): string {
    return labelSesionCover({
      fecha: boleta.sesion_fecha,
      hora_apertura: boleta.sesion_hora_apertura,
      hora_cierre: boleta.sesion_hora_cierre,
      tipo_cover_nombre: boleta.tipo_cover_nombre,
    });
  }

  fechaSesion(boleta: BoletaCoverCliente): string {
    const fecha = new Date(`${boleta.sesion_fecha}T12:00:00`);
    return fecha.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  horarioSesion(boleta: BoletaCoverCliente): string {
    const apertura = formatHoraCover(boleta.sesion_hora_apertura);
    const cierre = formatHoraCover(boleta.sesion_hora_cierre);
    return apertura && cierre ? `${apertura} – ${cierre}` : apertura || cierre || '—';
  }

  hintQr(item: CoverAccesoPuertaItem | null): string {
    return hintQrCoverAcceso(item);
  }

  coverAccesoUtilizado(boleta: BoletaCoverCliente): boolean {
    return coverAccesoUtilizadoEnPuerta(boleta);
  }

  private ensureQrThumbs(items: CoverAccesoPuertaItem[]): void {
    for (const item of items) {
      if (!this.accesosPuertaService.puedeMostrarQr(item)) continue;
      const id = item.boleta.id;
      if (this.qrThumbs.has(id) || this.qrThumbPending.has(id)) continue;
      const codigo = item.boleta.codigo_qr?.trim();
      if (!codigo) continue;
      this.qrThumbPending.add(id);
      void QRCode.toDataURL(codigo, {
        width: 128,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      })
        .then((url) => {
          this.qrThumbs.set(id, url);
          this.refreshView();
        })
        .catch(() => {
          /* mini QR opcional */
        })
        .finally(() => {
          this.qrThumbPending.delete(id);
        });
    }
  }

  private invalidarQrThumb(boletaId: number): void {
    if (!boletaId) return;
    this.qrThumbs.delete(boletaId);
    this.qrThumbPending.delete(boletaId);
  }

  async verQr(item: CoverAccesoPuertaItem): Promise<void> {
    if (item.compra.estado_pago !== TipoEstadoPago.COMPLETADO) {
      this.alertService.warning('Pago pendiente', 'El QR estará disponible cuando el pago se confirme.');
      return;
    }
    if (!item.boleta.codigo_qr?.trim()) {
      this.alertService.warning('QR en preparación', 'Esta entrada aún no tiene código QR.');
      return;
    }

    this.coverSeleccionado = item;
    this.showCoverQrModal = true;

    const existingThumb = this.qrThumbs.get(item.boleta.id);
    if (existingThumb) {
      this.coverQrCodeUrl = existingThumb;
      this.loadingCoverQR = false;
      this.refreshView();
      return;
    }

    this.coverQrCodeUrl = '';
    this.loadingCoverQR = true;
    this.refreshView();

    try {
      this.coverQrCodeUrl = await QRCode.toDataURL(item.boleta.codigo_qr!, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      this.qrThumbs.set(item.boleta.id, this.coverQrCodeUrl);
    } catch (err) {
      console.error('[AccesosPuerta] Error generando QR:', err);
      this.coverQrCodeUrl = '';
    } finally {
      this.loadingCoverQR = false;
      this.refreshView();
    }
  }

  cerrarCoverQrModal(): void {
    this.showCoverQrModal = false;
    this.coverSeleccionado = null;
    this.coverQrCodeUrl = '';
    this.loadingCoverQR = false;
    this.refreshView();
  }

  private onNotificacionCover(evento: CoverAccesoNotificacionEvento): void {
    const meta = evento.metadata ?? {};
    const boletaId = Number(meta['boleta_cover_id'] ?? 0);

    const qrAbierto =
      this.showCoverQrModal &&
      this.coverSeleccionado &&
      boletaId === this.coverSeleccionado.boleta.id;

    if (qrAbierto) {
      this.cerrarCoverQrModal();
    }

    if (boletaId) {
      this.invalidarQrThumb(boletaId);
    }

    const esSalida = evento.tipo === 'cover_salida_registrada';
    const lugar = String(meta['lugar_nombre'] || '').trim();
    const tipoCover = String(meta['tipo_cover_nombre'] || '').trim();
    const qr = String(meta['codigo_qr'] || '').trim();
    const estadoAcceso = String(meta['estado_acceso'] || '').toLowerCase();
    const permiteReingreso = meta['permite_reingreso'] !== false;
    const detalleSalida =
      estadoAcceso === 'consumida' || !permiteReingreso
        ? 'Tu salida fue registrada. Esta entrada ya fue consumida.'
        : 'Tu salida fue registrada. Puedes reingresar con el mismo QR cuando quieras.';

    this.mensajeIngresoTipo = esSalida ? 'cover-salida' : 'cover';
    this.mensajeIngresoTitulo = esSalida ? 'Hasta pronto' : 'Bienvenido al club';
    this.mensajeIngresoDetalle = esSalida
      ? detalleSalida
      : 'Tu entrada de cover fue registrada en puerta.';
    this.mensajeIngresoReferencia = qr || tipoCover || '';
    this.mensajeIngresoEvento = lugar || '';
    this.showMensajeIngresoModal = true;
    this.refreshView();

    this.ensureQrThumbs(this.accesos);
    this.programarCierreMensajeIngreso();
    void this.cargar({ background: true });
  }

  private programarCierreMensajeIngreso(): void {
    this.cancelarCierreMensajeIngreso();
    this.mensajeAutoCloseTimer = setTimeout(() => {
      this.cerrarMensajeIngreso();
    }, this.mensajeAutoCloseMs);
  }

  private cancelarCierreMensajeIngreso(): void {
    if (this.mensajeAutoCloseTimer) {
      clearTimeout(this.mensajeAutoCloseTimer);
      this.mensajeAutoCloseTimer = null;
    }
  }

  cerrarMensajeIngreso(): void {
    this.cancelarCierreMensajeIngreso();
    this.showMensajeIngresoModal = false;
    this.ensureQrThumbs(this.accesos);
    this.refreshView();
  }

  irAMisComprasClub(lugarId: number): void {
    void this.router.navigate(['/mis-compras/club', String(lugarId)]);
  }

  private startSilentRefreshIndicator(): void {
    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
    }
    this.isRefreshing = false;
    this.refreshIndicatorTimer = setTimeout(() => {
      this.isRefreshing = true;
      this.refreshView();
    }, this.refreshIndicatorDelayMs);
  }

  private stopSilentRefreshIndicator(): void {
    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
      this.refreshIndicatorTimer = null;
    }
    this.isRefreshing = false;
  }
}
