import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { EventosService } from '../../services/eventos.service';
import { Evento } from '../../types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { CuposEventoService } from '../../services/cupos-evento.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { SupabaseService } from '../../services/supabase.service';
import {
  AvisoCupoMio,
  InteresCupo,
  ResumenMisCupos,
  TIPO_AVISO_CUPO_HINT,
  TIPO_AVISO_CUPO_ICON,
  TIPO_AVISO_CUPO_LABELS,
  TipoAvisoCupo,
} from '../../types/cupos';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { CuposHubNav } from '../../components/cupos-hub-nav/cupos-hub-nav';
import { CUPOS_LABELS } from '../../core/cupos-labels';
import { irALoginCliente } from '../../core/login-redirect';

@Component({
  selector: 'app-mis-cupos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe, CuposHubNav],
  templateUrl: './mis-cupos.html',
  styleUrls: ['../cupos-evento/cupos-evento.css', '../cupos-explorar/cupos-explorar.css', './mis-cupos.css'],
})
export class MisCupos implements OnInit, OnDestroy {
  readonly cuposLabels = CUPOS_LABELS;

  loading = true;
  avisos: AvisoCupoMio[] = [];
  resumen: ResumenMisCupos = { avisos_activos: 0, total_respuestas: 0 };

  avisoExpandidoId: number | null = null;
  intereses: InteresCupo[] = [];
  loadingIntereses = false;

  private notificacionesChannel: RealtimeChannel | null = null;

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
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    if (!this.authService.getCurrentUser()) {
      void this.router.navigate(['/login'], { queryParams: { returnUrl: '/mis-cupos' } });
      return;
    }
    void this.cargar();
    this.iniciarRealtime();
  }

  ngOnDestroy(): void {
    this.detenerRealtime();
  }

  get totalRespuestas(): number {
    return this.resumen.total_respuestas;
  }

  private refreshView(): void {
    this.ngZone.run(() => this.cdr.detectChanges());
  }

  async cargar(): Promise<void> {
    this.loading = true;
    this.refreshView();
    try {
      const [resumen, avisos] = await Promise.all([
        this.cuposService.resumenMisCupos(),
        this.cuposService.listarMisAvisos(),
      ]);
      this.resumen = resumen;
      this.avisos = avisos;
      if (this.avisoExpandidoId && !avisos.some((a) => a.id === this.avisoExpandidoId)) {
        this.avisoExpandidoId = null;
        this.intereses = [];
      }
    } catch (e: unknown) {
      console.error(e);
      this.avisos = [];
      this.resumen = { avisos_activos: 0, total_respuestas: 0 };
    } finally {
      this.loading = false;
      this.refreshView();
    }
  }

  private iniciarRealtime(): void {
    const usuarioId = this.authService.getUsuario()?.id;
    if (!usuarioId) return;

    this.detenerRealtime();
    this.notificacionesChannel = this.supabaseService
      .getClient()
      .channel(`mis-cupos-notif-${usuarioId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones_usuario',
          filter: `usuario_id=eq.${usuarioId}`,
        },
        (payload) => {
          this.ngZone.run(() => {
            const row = payload.new as { tipo?: string | null; titulo?: string | null; mensaje?: string | null };
            if (String(row?.tipo || '').toLowerCase() !== 'cupo_interes') return;
            void this.alertService.snackbarSuccess(
              String(row?.titulo || 'Nueva respuesta'),
              String(row?.mensaje || ''),
            );
            void this.cargar().then(async () => {
              const avisoId = Number(
                (payload.new as { metadata?: Record<string, unknown> }).metadata?.['aviso_id'] ?? 0,
              );
              if (avisoId > 0) {
                const aviso = this.avisos.find((a) => a.id === avisoId);
                if (aviso && !this.estaExpandido(avisoId)) {
                  await this.toggleRespuestas(aviso);
                }
              }
            });
          });
        },
      )
      .subscribe();
  }

  private detenerRealtime(): void {
    if (this.notificacionesChannel) {
      void this.supabaseService.getClient().removeChannel(this.notificacionesChannel);
      this.notificacionesChannel = null;
    }
  }

  irEventoCupos(aviso: AvisoCupoMio): void {
    void this.router.navigate(['/cupos-evento', aviso.evento_id], {
      queryParams: { mis: '1', expand: aviso.id },
    });
  }

  async toggleRespuestas(aviso: AvisoCupoMio): Promise<void> {
    if (this.avisoExpandidoId === aviso.id) {
      this.avisoExpandidoId = null;
      this.intereses = [];
      this.refreshView();
      return;
    }
    this.avisoExpandidoId = aviso.id;
    this.loadingIntereses = true;
    this.refreshView();
    try {
      this.intereses = await this.cuposService.listarInteresesMiAviso(aviso.id);
    } catch {
      this.intereses = [];
    } finally {
      this.loadingIntereses = false;
      this.refreshView();
    }
  }

  async cerrarAviso(aviso: AvisoCupoMio): Promise<void> {
    const ok = await this.alertService.confirm('Cerrar aviso', '¿Ya no necesitas este aviso público?');
    if (!ok) return;
    try {
      await this.cuposService.cerrarAviso(aviso.id);
      if (this.avisoExpandidoId === aviso.id) {
        this.avisoExpandidoId = null;
        this.intereses = [];
      }
      void this.alertService.snackbarSuccess('Aviso cerrado');
      await this.cargar();
    } catch (e: unknown) {
      void this.alertService.error('Error', e instanceof Error ? e.message : 'Error al cerrar');
    }
  }

  async copiarEmail(email: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(email);
      void this.alertService.snackbarSuccess('Correo copiado');
    } catch {
      void this.alertService.info('Correo', email);
    }
  }

  formatPrecio(n: number | null): string {
    if (n == null || !Number.isFinite(n)) return '';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(n);
  }

  estaExpandido(avisoId: number): boolean {
    return this.avisoExpandidoId === avisoId;
  }

  trackAviso(_i: number, a: AvisoCupoMio): number {
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

  get eventoSeleccionado(): Evento | null {
    if (!this.eventoSeleccionadoId) return null;
    return this.eventosParaPublicar.find((e) => e.id === this.eventoSeleccionadoId) ?? null;
  }

  abrirNuevoAviso(): void {
    if (!this.authService.getCurrentUser()) {
      irALoginCliente(this.router, '/mis-cupos', 'publicar');
      return;
    }
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
      const avisoId = await this.cuposService.crear({
        eventoId: this.eventoSeleccionadoId,
        tipo: this.crearTipo,
        descripcion: desc,
        cupos: this.crearCupos,
        zonaTexto: this.crearZona.trim() || undefined,
        precioReferenciaCop: this.crearPrecio,
      });
      this.cerrarCrear();
      void this.alertService.success('Aviso publicado', 'Ya aparece en Mis publicaciones.');
      await this.cargar();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al publicar';
      void this.alertService.error('No se publicó', msg);
    }
  }

  trackEvento(_i: number, e: Evento): number {
    return e.id;
  }
}
