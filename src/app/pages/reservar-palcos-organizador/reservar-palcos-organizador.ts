import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EvSelect, EvSelectOption } from '../../components/ev-select/ev-select';
import { EvButton } from '../../components/ev-button';
import { EvDrawerFooter } from '../../components/ev-drawer/ev-drawer-footer';
import { DrawerRef, EV_DRAWER_DATA, EvDrawerContent } from '../../core/drawer';
import type { EventoPalcosPanelData } from '../../panels/evento-palcos/evento-palcos.types';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import { BoletasService } from '../../services/boletas.service';
import { EventosService } from '../../services/eventos.service';
import { PalcosService } from '../../services/palcos.service';
import { EstadoPalco, Evento, Palco, TipoBoleta } from '../../types';

type FiltroEstadoPalco = 'todos' | 'disponibles' | 'mios' | 'checkout' | 'vendidos';

@Component({
  selector: 'app-reservar-palcos-organizador',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, EvSelect, EvButton, EvDrawerFooter],
  templateUrl: './reservar-palcos-organizador.html',
  styleUrl: './reservar-palcos-organizador.css',
})
export class ReservarPalcosOrganizador implements OnInit, EvDrawerContent {
  readonly drawerRef = inject(DrawerRef<boolean>, { optional: true });
  readonly drawerData = inject<EventoPalcosPanelData | null>(EV_DRAWER_DATA, { optional: true });
  eventoId = 0;
  evento: Evento | null = null;
  tiposPalco: TipoBoleta[] = [];
  tipoSeleccionadoId: number | null = null;
  palcos: Palco[] = [];
  seleccionados = new Set<number>();
  loading = true;
  loadingPalcos = false;
  saving = false;
  liberandoId: number | null = null;
  error: string | null = null;
  busqueda = '';
  filtroEstado: FiltroEstadoPalco = 'todos';
  filtroEstadoOptions: EvSelectOption<FiltroEstadoPalco>[] = [];
  private dataChanged = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private eventosService: EventosService,
    private boletasService: BoletasService,
    private palcosService: PalcosService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.eventoId = this.drawerData?.eventoId ?? Number(this.route.snapshot.paramMap.get('id'));
    void this.iniciar();
  }

  get isDrawer(): boolean {
    return this.drawerRef != null;
  }

  evDrawerHasUnsavedChanges(): boolean {
    return false;
  }

  private async iniciar(): Promise<void> {
    try {
      await this.authService.waitForInitialization();
      const usuario = this.authService.getUsuario();
      const puedeOperarPalcos =
        !!usuario
        && (this.authService.isOrganizador() || this.authService.isAdministrador())
        && !this.authService.isShowcaseOrganizador();
      if (!puedeOperarPalcos || !this.eventoId) {
        if (this.isDrawer) {
          this.error = 'No tienes acceso a la reserva operativa de palcos.';
        } else {
          void this.router.navigate(['/eventos']);
        }
        return;
      }

      const [evento, tipos] = await Promise.all([
        this.eventosService.getEventoById(this.eventoId),
        this.boletasService.getTiposBoleta(this.eventoId),
      ]);
      if (
        this.authService.isOrganizador()
        && Number(evento.organizador_id) !== Number(usuario.id)
      ) {
        throw new Error('Este evento no pertenece a tu cuenta.');
      }

      this.evento = evento;
      this.tiposPalco = tipos.filter((tipo) => !!tipo.es_palco);
      this.tipoSeleccionadoId = this.tiposPalco[0]?.id ?? null;
      if (this.tipoSeleccionadoId) await this.cargarPalcos();
    } catch (error: any) {
      console.error('Error iniciando reserva de palcos:', error);
      this.error = error?.message || 'No pudimos cargar los palcos del evento.';
    } finally {
      this.loading = false;
      this.drawerRef?.setLoading(false);
      this.cdr.detectChanges();
    }
  }

  async seleccionarTipo(tipoId: number): Promise<void> {
    if (this.tipoSeleccionadoId === tipoId || this.loadingPalcos) return;
    this.tipoSeleccionadoId = tipoId;
    this.seleccionados.clear();
    await this.cargarPalcos();
  }

  private async cargarPalcos(): Promise<void> {
    if (!this.tipoSeleccionadoId) return;
    this.loadingPalcos = true;
    this.error = null;
    this.cdr.detectChanges();
    try {
      this.palcos = await this.boletasService.getPalcosPorTipo(this.tipoSeleccionadoId);
      this.actualizarFiltroEstadoOptions();
      this.seleccionados.clear();
    } catch (error: any) {
      this.error = error?.message || 'No pudimos cargar la disponibilidad.';
      this.palcos = [];
      this.actualizarFiltroEstadoOptions();
    } finally {
      this.loadingPalcos = false;
      this.cdr.detectChanges();
    }
  }

  get tipoSeleccionado(): TipoBoleta | null {
    return this.tiposPalco.find((tipo) => tipo.id === this.tipoSeleccionadoId) ?? null;
  }

  get disponibles(): number {
    return this.palcos.filter((palco) => this.esDisponible(palco)).length;
  }

  get reservados(): number {
    return this.palcos.filter((palco) => String(palco.estado) === EstadoPalco.RESERVADO).length;
  }

  get reservasManuales(): number {
    return this.palcos.filter((palco) => this.esReservaManual(palco)).length;
  }

  get reservasCheckout(): number {
    return this.palcos.filter((palco) => this.esReservaCheckout(palco)).length;
  }

  get vendidos(): number {
    return this.palcos.filter((palco) => String(palco.estado) === EstadoPalco.VENDIDO).length;
  }

  esDisponible(palco: Palco): boolean {
    return String(palco.estado) === EstadoPalco.DISPONIBLE;
  }

  esReservaManual(palco: Palco): boolean {
    return String(palco.estado) === EstadoPalco.RESERVADO
      && palco.compra_id == null
      && palco.transaccion_checkout_id == null;
  }

  esReservaCheckout(palco: Palco): boolean {
    return String(palco.estado) === EstadoPalco.RESERVADO && !this.esReservaManual(palco);
  }

  get palcosVisibles(): Palco[] {
    const termino = this.busqueda.trim().replace(/^#/, '').toLowerCase();
    return this.palcos.filter((palco) => {
      const coincideNumero = !termino || String(palco.numero).toLowerCase().includes(termino);
      if (!coincideNumero) return false;

      switch (this.filtroEstado) {
        case 'disponibles': return this.esDisponible(palco);
        case 'mios': return this.esReservaManual(palco);
        case 'checkout': return this.esReservaCheckout(palco);
        case 'vendidos': return String(palco.estado) === EstadoPalco.VENDIDO;
        default: return true;
      }
    });
  }

  private actualizarFiltroEstadoOptions(): void {
    this.filtroEstadoOptions = [
      { value: 'todos', label: `Todos (${this.palcos.length})` },
      { value: 'disponibles', label: `Disponibles (${this.disponibles})` },
      { value: 'mios', label: `Reservados por ti (${this.reservasManuales})` },
      { value: 'checkout', label: `Compra en curso (${this.reservasCheckout})` },
      { value: 'vendidos', label: `Vendidos (${this.vendidos})` },
    ];
  }

  seleccionarFiltroEstado(filtro: FiltroEstadoPalco): void {
    this.filtroEstado = filtro;
  }

  limpiarSeleccion(): void {
    this.seleccionados.clear();
  }

  togglePalco(palco: Palco): void {
    if (!this.esDisponible(palco) || this.saving) return;
    const next = new Set(this.seleccionados);
    next.has(palco.id) ? next.delete(palco.id) : next.add(palco.id);
    this.seleccionados = next;
  }

  async reservarSeleccion(): Promise<void> {
    if (this.seleccionados.size === 0 || this.saving) return;
    const numeros = this.palcos
      .filter((palco) => this.seleccionados.has(palco.id))
      .map((palco) => `#${palco.numero}`)
      .join(', ');
    const ok = await this.alertService.confirm(
      'Reservar palcos',
      `Vas a bloquear ${numeros}. Los clientes no podrán comprarlos hasta que los liberes.`
    );
    if (!ok) return;

    this.saving = true;
    this.cdr.detectChanges();
    try {
      const cantidad = await this.palcosService.reservarPalcosOrganizador(
        this.eventoId,
        [...this.seleccionados],
      );
      this.dataChanged = true;
      this.alertService.success('Palcos reservados', `${cantidad} palco${cantidad === 1 ? '' : 's'} quedó bloqueado para venta pública.`);
      await this.cargarPalcos();
    } catch (error: any) {
      this.alertService.error('No se pudo completar la reserva', error?.message || 'La disponibilidad cambió.');
      await this.cargarPalcos();
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async liberar(palco: Palco): Promise<void> {
    if (!this.esReservaManual(palco) || this.liberandoId != null) return;
    const ok = await this.alertService.confirm(
      'Liberar palco',
      `El palco #${palco.numero} volverá a estar disponible para los clientes.`
    );
    if (!ok) return;
    this.liberandoId = palco.id;
    this.cdr.detectChanges();
    try {
      await this.palcosService.liberarPalcoOrganizador(this.eventoId, palco.id);
      this.dataChanged = true;
      this.alertService.success('Palco disponible', `El palco #${palco.numero} ya puede venderse.`);
      await this.cargarPalcos();
    } catch (error: any) {
      this.alertService.error('No se pudo liberar', error?.message || 'Intenta nuevamente.');
    } finally {
      this.liberandoId = null;
      this.cdr.detectChanges();
    }
  }

  estadoLabel(palco: Palco): string {
    if (this.esDisponible(palco)) return 'Disponible';
    if (this.esReservaManual(palco)) return 'Reservado por ti';
    if (String(palco.estado) === EstadoPalco.RESERVADO) return 'Compra en curso';
    if (String(palco.estado) === EstadoPalco.VENDIDO) return 'Vendido';
    return String(palco.estado || 'No disponible');
  }

  estadoIcon(palco: Palco): string {
    if (this.esDisponible(palco)) return this.seleccionados.has(palco.id) ? 'check' : 'event_seat';
    if (this.esReservaManual(palco)) return 'lock';
    if (this.esReservaCheckout(palco)) return 'schedule';
    if (String(palco.estado) === EstadoPalco.VENDIDO) return 'check_circle';
    return 'block';
  }

  closePanel(): void {
    void this.drawerRef?.close(this.dataChanged);
  }

  trackPalco(_: number, palco: Palco): number { return palco.id; }
  trackTipo(_: number, tipo: TipoBoleta): number { return tipo.id; }
}
