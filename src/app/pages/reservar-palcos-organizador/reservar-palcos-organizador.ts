import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import { BoletasService } from '../../services/boletas.service';
import { EventosService } from '../../services/eventos.service';
import { PalcosService } from '../../services/palcos.service';
import { EstadoPalco, Evento, Palco, TipoBoleta } from '../../types';

@Component({
  selector: 'app-reservar-palcos-organizador',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './reservar-palcos-organizador.html',
  styleUrl: './reservar-palcos-organizador.css',
})
export class ReservarPalcosOrganizador implements OnInit {
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
    this.eventoId = Number(this.route.snapshot.paramMap.get('id'));
    void this.iniciar();
  }

  private async iniciar(): Promise<void> {
    try {
      await this.authService.waitForInitialization();
      const usuario = this.authService.getUsuario();
      if (!usuario || usuario.tipo_usuario_id !== 2 || !this.eventoId || this.authService.isShowcaseOrganizador()) {
        void this.router.navigate(['/eventos']);
        return;
      }

      const [evento, tipos] = await Promise.all([
        this.eventosService.getEventoById(this.eventoId),
        this.boletasService.getTiposBoleta(this.eventoId),
      ]);
      if (Number(evento.organizador_id) !== Number(usuario.id)) {
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
      this.seleccionados.clear();
    } catch (error: any) {
      this.error = error?.message || 'No pudimos cargar la disponibilidad.';
      this.palcos = [];
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
    if (this.esReservaManual(palco)) return 'Reserva manual';
    if (String(palco.estado) === EstadoPalco.RESERVADO) return 'En proceso de compra';
    if (String(palco.estado) === EstadoPalco.VENDIDO) return 'Vendido';
    return String(palco.estado || 'No disponible');
  }

  trackPalco(_: number, palco: Palco): number { return palco.id; }
  trackTipo(_: number, tipo: TipoBoleta): number { return tipo.id; }
}
