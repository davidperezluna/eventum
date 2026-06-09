import { ChangeDetectorRef, Component, HostListener, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CoversService } from '../../services/covers.service';
import { ClubDetalleState, ClubesStateService } from '../../services/clubes-state.service';
import { CarritoCompraService } from '../../services/carrito-compra.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import {
  DetalleLugarCoverPublico,
  LugarCoverPublico,
  SesionCoverPublica,
  TipoCoverPublico,
} from '../../types/covers';
import { COVERS_LABELS, formatHoraCover } from '../../core/covers-labels';
import { resolverConflictoCoverAntesDeAgregar } from '../../core/carrito-conflicto';
import { ClientConfirmDialogService } from '../../services/client-confirm-dialog.service';
import { irALoginCliente } from '../../core/login-redirect';
@Component({
  selector: 'app-club-detalle',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './club-detalle.html',
  styleUrls: ['../cupos-evento/cupos-evento.css', './club-detalle.css'],
})
export class ClubDetalle implements OnInit, OnDestroy {
  readonly coversLabels = COVERS_LABELS;

  lugarId = 0;
  loading = false;
  isRefreshing = false;
  detalle: DetalleLugarCoverPublico | null = null;
  private carritoSubscription?: Subscription;
  private refreshIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshStartedAt: number | null = null;
  private readonly refreshIndicatorDelayMs = 800;
  private hadCachedDataOnInit = false;

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private coversService: CoversService,
    private clubesStateService: ClubesStateService,
    private carritoCompraService: CarritoCompraService,
    private authService: AuthService,
    private alertService: AlertService,
    private clientConfirmDialog: ClientConfirmDialogService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {
    const id = Number(this.route.snapshot.paramMap.get('lugarId'));
    if (Number.isFinite(id) && id > 0) {
      const cachedState = this.clubesStateService.getDetalleState(id);
      if (cachedState?.detalle) {
        this.lugarId = id;
        this.applyCachedState(cachedState);
        this.hadCachedDataOnInit = true;
      }
    }
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('lugarId'));
    if (!Number.isFinite(id) || id <= 0) {
      void this.router.navigate(['/clubes']);
      return;
    }
    this.lugarId = id;
    this.carritoSubscription = this.carritoCompraService.itemsCover$.subscribe(() => {
      this.cdr.detectChanges();
    });

    const cachedState = this.clubesStateService.getDetalleState(id);
    if (cachedState?.detalle) {
      this.applyCachedState(cachedState);
      this.loading = false;
      this.hadCachedDataOnInit = true;
      setTimeout(() => window.scrollTo({ top: cachedState.scrollY, behavior: 'auto' }), 0);
    } else {
      this.loading = true;
    }

    void this.cargar({ background: this.hadCachedDataOnInit });
  }

  ngOnDestroy(): void {
    this.carritoSubscription?.unsubscribe();
    this.persistState(Date.now());
    this.stopSilentRefreshIndicator();
  }

  @HostListener('window:beforeunload')
  @HostListener('window:pagehide')
  onPageExit(): void {
    this.persistState(Date.now());
  }

  get lugar(): LugarCoverPublico | null {
    return this.detalle?.lugar ?? null;
  }

  get sesiones(): SesionCoverPublica[] {
    return this.detalle?.sesiones ?? [];
  }

  get isLoggedIn(): boolean {
    return !!this.authService.getCurrentUser();
  }

  private refreshView(): void {
    this.ngZone.run(() => this.cdr.detectChanges());
  }

  async cargar(options?: { background?: boolean }): Promise<void> {
    const background = options?.background ?? false;
    const hasVisibleData = !!this.detalle && this.detalle.lugar.id === this.lugarId;
    const silentRefreshMode = background || hasVisibleData;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (offline && hasVisibleData) {
      console.info('[ClubDetalle] Sin conexión, usando datos cacheados', { lugarId: this.lugarId });
      this.loading = false;
      this.stopSilentRefreshIndicator();
      this.refreshView();
      return;
    }

    this.loading = !silentRefreshMode && !hasVisibleData;
    if (silentRefreshMode) {
      this.startSilentRefreshIndicator();
    } else {
      this.stopSilentRefreshIndicator();
    }
    this.refreshView();

    const refreshStartedAt = Date.now();
    const previousDetalle = this.detalle;

    try {
      const detalle = await this.coversService.obtenerLugarCoverPublico(this.lugarId);
      if (!detalle) {
        if (silentRefreshMode) {
          this.detalle = previousDetalle;
        } else {
          void this.router.navigate(['/clubes']);
        }
        return;
      }

      this.detalle = detalle;
      this.persistState(Date.now());
    } catch {
      if (silentRefreshMode) {
        this.detalle = previousDetalle;
      } else {
        this.detalle = null;
        void this.router.navigate(['/clubes']);
      }
    } finally {
      this.loading = false;
      this.stopSilentRefreshIndicator();
      if (silentRefreshMode) {
        console.info('[ClubDetalle] Refresco silencioso finalizado', {
          durationMs: Date.now() - refreshStartedAt,
          lugarId: this.lugarId,
          sesiones: this.detalle?.sesiones.length ?? 0,
        });
      }
      this.refreshView();
    }
  }

  private applyCachedState(state: ClubDetalleState): void {
    this.detalle = {
      lugar: { ...state.detalle.lugar },
      tipos_cover: [...state.detalle.tipos_cover],
      sesiones: [...state.detalle.sesiones],
    };
  }

  private persistState(lastUpdated: number): void {
    if (!this.lugarId || !this.detalle) return;
    this.clubesStateService.saveDetalleState(this.lugarId, {
      detalle: this.detalle,
      scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
      lastUpdated,
    });
  }

  private startSilentRefreshIndicator(): void {
    this.refreshStartedAt = Date.now();
    console.info('[ClubDetalle] Refresco silencioso iniciado', { lugarId: this.lugarId });

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

    if (this.refreshStartedAt) {
      this.refreshStartedAt = null;
    }

    this.isRefreshing = false;
  }

  tipoPorSesion(sesion: SesionCoverPublica): TipoCoverPublico | undefined {
    return this.detalle?.tipos_cover.find((t) => t.id === sesion.tipo_cover_id);
  }

  cuposDisponibles(sesion: SesionCoverPublica): number {
    const venta = sesion.cupos_venta_disponibles;
    const dentro = sesion.cupos_dentro_disponibles ?? 0;
    if (venta == null) return dentro;
    return Math.min(dentro, venta);
  }

  sesionAgotada(sesion: SesionCoverPublica): boolean {
    return this.cuposDisponibles(sesion) <= 0;
  }

  horarioSesion(sesion: SesionCoverPublica): string {
    return `${formatHoraCover(sesion.hora_apertura)} – ${formatHoraCover(sesion.hora_cierre)}`;
  }

  fechaSesionCompacta(sesion: SesionCoverPublica): string {
    const fecha = new Date(`${sesion.fecha}T12:00:00`);
    return fecha.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  private fechaSesionDate(sesion: SesionCoverPublica): Date {
    return new Date(`${sesion.fecha}T12:00:00`);
  }

  fechaSesionWeekday(sesion: SesionCoverPublica): string {
    return this.fechaSesionDate(sesion)
      .toLocaleDateString('es-CO', { weekday: 'short' })
      .replace('.', '')
      .toUpperCase();
  }

  fechaSesionDia(sesion: SesionCoverPublica): string {
    return String(this.fechaSesionDate(sesion).getDate());
  }

  fechaSesionMes(sesion: SesionCoverPublica): string {
    return this.fechaSesionDate(sesion)
      .toLocaleDateString('es-CO', { month: 'short' })
      .replace('.', '')
      .toUpperCase();
  }

  labelCarritoSesion(sesion: SesionCoverPublica): string {
    const fecha = new Date(`${sesion.fecha}T12:00:00`);
    const dia = fecha.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${dia} · ${this.horarioSesion(sesion)}`;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  getCantidadEnCarrito(sesion: SesionCoverPublica): number {
    return this.carritoCompraService.getCantidadCoverEnCarrito(sesion.id);
  }

  coverDisponibleParaVenta(sesion: SesionCoverPublica): boolean {
    const tipoCover = this.tipoPorSesion(sesion);
    if (!tipoCover || this.sesionAgotada(sesion)) return false;
    return !!(sesion.wompi_cuenta_id ?? tipoCover.wompi_cuenta_id);
  }

  maxCoverPermitidosEnCarrito(sesion: SesionCoverPublica, tipoCover: TipoCoverPublico): number {
    const cupos = this.cuposDisponibles(sesion);
    const limite = tipoCover.limite_por_persona;
    if (limite != null && limite > 0) {
      return Math.min(cupos, limite);
    }
    return cupos;
  }

  private avisoBloqueoAgregarCover(
    sesion: SesionCoverPublica,
    tipoCover: TipoCoverPublico,
  ): { titulo: string; mensaje: string } | null {
    const yaEnCarrito = this.getCantidadEnCarrito(sesion);
    const maxPermitido = this.maxCoverPermitidosEnCarrito(sesion, tipoCover);
    if (yaEnCarrito < maxPermitido) {
      return null;
    }

    const limite = tipoCover.limite_por_persona;
    if (limite != null && limite > 0 && yaEnCarrito >= limite) {
      return {
        titulo: 'Límite alcanzado',
        mensaje: `Solo puedes comprar ${limite} cover(s) de este tipo por persona.`,
      };
    }

    return {
      titulo: 'Sin cupo',
      mensaje: 'No hay más entradas disponibles para esta sesión.',
    };
  }

  async agregarCoverAlCarrito(sesion: SesionCoverPublica): Promise<void> {
    if (!this.coverDisponibleParaVenta(sesion)) {
      this.alertService.warning('Agotado', 'No hay entradas disponibles para esta sesión.');
      return;
    }

    if (!this.isLoggedIn) {
      irALoginCliente(this.router, `/club/${this.lugarId}`, 'pagar');
      return;
    }

    const tipoCover = this.tipoPorSesion(sesion)!;
    const wompiId = sesion.wompi_cuenta_id ?? tipoCover.wompi_cuenta_id ?? null;
    if (!wompiId) {
      this.alertService.error(
        'Cover no disponible',
        'El organizador debe asignar una cuenta Wompi al tipo de cover antes de vender online.',
      );
      return;
    }

    const bloqueo = this.avisoBloqueoAgregarCover(sesion, tipoCover);
    if (bloqueo) {
      this.alertService.warning(bloqueo.titulo, bloqueo.mensaje);
      return;
    }

    const maxCantidad = this.maxCoverPermitidosEnCarrito(sesion, tipoCover);

    const clubNombre = this.lugar?.nombre ?? 'Club';
    const puedeContinuar = await resolverConflictoCoverAntesDeAgregar(
      this.clientConfirmDialog,
      this.carritoCompraService,
      this.lugarId,
      clubNombre,
    );
    if (!puedeContinuar) {
      return;
    }

    const agregado = this.carritoCompraService.agregarCoverIndependiente({
      lugar: {
        id: this.lugarId,
        nombre: clubNombre,
        covers_porcentaje_servicio: Number(this.lugar?.covers_porcentaje_servicio ?? 0),
      },
      tipoCoverId: sesion.tipo_cover_id,
      tipoCoverNombre: sesion.tipo_cover_nombre,
      sesionCoverId: sesion.id,
      sesionCoverLabel: this.labelCarritoSesion(sesion),
      sesionFecha: sesion.fecha,
      horaApertura: sesion.hora_apertura,
      horaCierre: sesion.hora_cierre,
      precioSesion: sesion.precio_cop,
      wompiCuentaId: wompiId,
      maxCantidad,
    });

    if (!agregado) {
      const fallback = this.avisoBloqueoAgregarCover(sesion, tipoCover);
      this.alertService.warning(
        fallback?.titulo ?? 'Sin cupo',
        fallback?.mensaje ?? 'No hay más entradas disponibles para esta sesión.',
      );
    }
    this.cdr.detectChanges();
  }

  quitarCoverDelCarrito(sesion: SesionCoverPublica): void {
    this.carritoCompraService.quitarCoverDelCarrito(sesion.id);
    this.cdr.detectChanges();
  }

  eliminarCoverDelCarrito(sesion: SesionCoverPublica): void {
    this.carritoCompraService.eliminarCoverDelCarrito(sesion.id);
    this.cdr.detectChanges();
  }

  puedeAgregarMasCover(sesion: SesionCoverPublica): boolean {
    if (!this.coverDisponibleParaVenta(sesion)) return false;
    const tipoCover = this.tipoPorSesion(sesion);
    if (!tipoCover) return false;
    return this.avisoBloqueoAgregarCover(sesion, tipoCover) === null;
  }

  trackSesion(_index: number, sesion: SesionCoverPublica): number {
    return sesion.id;
  }
}
