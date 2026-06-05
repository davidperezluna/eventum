import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { EventosService } from '../../services/eventos.service';
import { Evento } from '../../types';
import { CuposEventoService } from '../../services/cupos-evento.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { CuposHubNav } from '../../components/cupos-hub-nav/cupos-hub-nav';
import {
  AvisoCupoConEvento,
  TIPO_AVISO_CUPO_HINT,
  TIPO_AVISO_CUPO_ICON,
  TIPO_AVISO_CUPO_LABELS,
  TipoAvisoCupo,
} from '../../types/cupos';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

type FiltroCupo = 'todos' | TipoAvisoCupo;

@Component({
  selector: 'app-cupos-explorar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CuposHubNav, DateFormatPipe],
  templateUrl: './cupos-explorar.html',
  styleUrls: ['../cupos-evento/cupos-evento.css', './cupos-explorar.css'],
})
export class CuposExplorar implements OnInit {
  loading = true;
  avisos: AvisoCupoConEvento[] = [];
  filtro: FiltroCupo = 'todos';
  respuestasCupos = 0;

  showInteres = false;
  interesAviso: AvisoCupoConEvento | null = null;
  interesMensaje = '';

  showCrear = false;
  crearPaso: 'evento' | 'formulario' = 'evento';
  eventosParaPublicar: Evento[] = [];
  loadingEventos = false;
  eventoSeleccionadoId: number | null = null;
  crearTipo: TipoAvisoCupo = 'busco_cupo';
  crearDescripcion = '';
  crearCupos = 1;
  crearZona = '';
  crearPrecio: number | null = null;

  readonly tipos: TipoAvisoCupo[] = ['busco_cupo', 'ofrezco_cupo', 'busco_grupo'];
  readonly tipoLabels = TIPO_AVISO_CUPO_LABELS;
  readonly tipoIcons = TIPO_AVISO_CUPO_ICON;
  readonly tipoHints = TIPO_AVISO_CUPO_HINT;

  constructor(
    private cuposService: CuposEventoService,
    private eventosService: EventosService,
    private authService: AuthService,
    private alertService: AlertService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    void this.inicializar();
  }

  get isLoggedIn(): boolean {
    return !!this.authService.getCurrentUser();
  }

  private refreshView(): void {
    this.ngZone.run(() => this.cdr.detectChanges());
  }

  private async inicializar(): Promise<void> {
    if (this.isLoggedIn) {
      try {
        const r = await this.cuposService.resumenMisCupos();
        this.respuestasCupos = r.total_respuestas;
      } catch {
        this.respuestasCupos = 0;
      }
    }
    await this.loadAvisos();
  }

  async loadAvisos(): Promise<void> {
    this.loading = true;
    this.refreshView();
    try {
      const tipo = this.filtro !== 'todos' ? this.filtro : null;
      this.avisos = await this.cuposService.listarGlobal(tipo);
    } catch (e: unknown) {
      console.error(e);
      this.avisos = [];
    } finally {
      this.loading = false;
      this.refreshView();
    }
  }

  setFiltro(f: FiltroCupo): void {
    this.filtro = f;
    void this.loadAvisos();
  }

  requiereLogin(accion: string): boolean {
    if (this.isLoggedIn) return true;
    void this.alertService.warning('Inicia sesión', `Debes iniciar sesión para ${accion}.`);
    void this.router.navigate(['/login'], { queryParams: { returnUrl: '/cupos' } });
    return false;
  }

  abrirInteres(aviso: AvisoCupoConEvento): void {
    if (!this.requiereLogin('contactar')) return;
    if (aviso.es_mio || aviso.ya_interesado) return;
    this.interesAviso = aviso;
    this.interesMensaje = '';
    this.showInteres = true;
  }

  cerrarInteres(): void {
    this.showInteres = false;
    this.interesAviso = null;
  }

  async enviarInteres(): Promise<void> {
    if (!this.interesAviso) return;
    const msg = this.interesMensaje.trim();
    if (msg.length < 5) {
      void this.alertService.warning('Mensaje corto', 'Escribe al menos 5 caracteres.');
      return;
    }
    try {
      await this.cuposService.registrarInteres(this.interesAviso.id, msg);
      this.cerrarInteres();
      void this.alertService.success('Interés enviado', 'El autor verá tu mensaje en Mis publicaciones.');
      await this.loadAvisos();
    } catch (e: unknown) {
      void this.alertService.error('No se envió', e instanceof Error ? e.message : 'Error');
    }
  }

  async reportarAviso(aviso: AvisoCupoConEvento): Promise<void> {
    if (!this.requiereLogin('reportar')) return;
    const ok = await this.alertService.confirm('Reportar aviso', '¿Contenido sospechoso o estafa?');
    if (!ok) return;
    try {
      await this.cuposService.reportar(aviso.id);
      void this.alertService.snackbarSuccess('Reporte recibido');
      await this.loadAvisos();
    } catch (e: unknown) {
      void this.alertService.error('Error', e instanceof Error ? e.message : 'Error');
    }
  }

  publicarEnEvento(aviso: AvisoCupoConEvento): void {
    void this.router.navigate(['/cupos-evento', aviso.evento_id], { queryParams: { publicar: '1' } });
  }

  get eventoSeleccionado(): Evento | null {
    if (!this.eventoSeleccionadoId) return null;
    return this.eventosParaPublicar.find((e) => e.id === this.eventoSeleccionadoId) ?? null;
  }

  abrirNuevoAviso(): void {
    if (!this.requiereLogin('publicar')) return;
    this.crearPaso = 'evento';
    this.eventoSeleccionadoId = null;
    this.crearTipo = 'busco_cupo';
    this.crearDescripcion = '';
    this.crearCupos = 1;
    this.crearZona = '';
    this.crearPrecio = null;
    this.showCrear = true;
    void this.cargarEventosParaPublicar();
  }

  cerrarCrear(): void {
    this.showCrear = false;
    this.crearPaso = 'evento';
    this.eventoSeleccionadoId = null;
  }

  private async cargarEventosParaPublicar(): Promise<void> {
    this.loadingEventos = true;
    this.refreshView();
    try {
      const abiertos = await this.eventosService.getEventosAbiertosParaCupos(60);
      const porId = new Map(abiertos.map((e) => [e.id, e]));

      for (const aviso of this.avisos) {
        if (porId.has(aviso.evento_id)) continue;
        try {
          const ev = await this.eventosService.getEventoById(aviso.evento_id);
          if (ev?.activo !== false) {
            porId.set(ev.id, ev);
          }
        } catch {
          /* omitir evento no accesible */
        }
      }

      this.eventosParaPublicar = [...porId.values()].sort(
        (a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime(),
      );
    } catch {
      this.eventosParaPublicar = [];
    } finally {
      this.loadingEventos = false;
      this.refreshView();
    }
  }

  elegirEvento(eventoId: number): void {
    this.eventoSeleccionadoId = eventoId;
    this.crearPaso = 'formulario';
    this.refreshView();
  }

  volverElegirEvento(): void {
    this.crearPaso = 'evento';
    this.refreshView();
  }

  async publicarNuevoAviso(): Promise<void> {
    if (!this.eventoSeleccionadoId) {
      void this.alertService.warning('Elige un evento', 'Selecciona el evento donde publicarás.');
      return;
    }
    const desc = this.crearDescripcion.trim();
    if (desc.length < 10) {
      void this.alertService.warning('Descripción corta', 'Escribe al menos 10 caracteres.');
      return;
    }
    try {
      await this.cuposService.crear({
        eventoId: this.eventoSeleccionadoId,
        tipo: this.crearTipo,
        descripcion: desc,
        cupos: this.crearCupos,
        zonaTexto: this.crearZona.trim() || undefined,
        precioReferenciaCop: this.crearPrecio,
      });
      this.cerrarCrear();
      void this.alertService.success('Aviso publicado', 'Ya aparece en Explorar y en el tablón del evento.');
      await this.loadAvisos();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al publicar';
      void this.alertService.error('No se publicó', msg);
    }
  }

  trackEvento(_i: number, e: Evento): number {
    return e.id;
  }

  formatPrecio(n: number | null): string {
    if (n == null || !Number.isFinite(n)) return '';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(n);
  }

  trackAviso(_i: number, a: AvisoCupoConEvento): number {
    return a.id;
  }

  tiempoRelativo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 48) return `hace ${h} h`;
    return `hace ${Math.floor(h / 24)} d`;
  }
}
