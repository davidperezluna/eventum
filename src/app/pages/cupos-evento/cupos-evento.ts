import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../services/supabase.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EventosService } from '../../services/eventos.service';
import { CuposEventoService } from '../../services/cupos-evento.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { Evento } from '../../types';
import { CuposHubNav } from '../../components/cupos-hub-nav/cupos-hub-nav';
import {
  AvisoCupo,
  InteresCupo,
  MOTIVO_REPORTE_CUPO,
  TIPO_AVISO_CUPO_HINT,
  TIPO_AVISO_CUPO_ICON,
  TIPO_AVISO_CUPO_LABELS,
  TIPO_AVISO_CUPO_LABELS_SHORT,
  TipoAvisoCupo,
} from '../../types/cupos';
import { CUPOS_LABELS } from '../../core/cupos-labels';
import { irALoginCliente } from '../../core/login-redirect';

type FiltroCupo = 'todos' | TipoAvisoCupo;
type VistaCupos = 'explorar' | 'mis';

@Component({
  selector: 'app-cupos-evento',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CuposHubNav],
  templateUrl: './cupos-evento.html',
  styleUrls: ['./cupos-evento.css', '../cupos-explorar/cupos-explorar.css'],
})
export class CuposEvento implements OnInit, OnDestroy {
  readonly cuposLabels = CUPOS_LABELS;

  evento: Evento | null = null;
  eventoId = 0;
  loadingEvento = true;
  loadingAvisos = false;
  avisos: AvisoCupo[] = [];
  filtro: FiltroCupo = 'todos';
  vista: VistaCupos = 'explorar';

  showCrear = false;
  showInteres = false;
  intereses: InteresCupo[] = [];
  loadingIntereses = false;
  avisoExpandidoId: number | null = null;

  crearTipo: TipoAvisoCupo = 'busco_cupo';
  crearDescripcion = '';
  crearCupos = 1;
  crearZona = '';
  crearPrecio: number | null = null;

  interesAviso: AvisoCupo | null = null;
  interesMensaje = '';
  respuestasCupos = 0;

  private notificacionesChannel: RealtimeChannel | null = null;

  readonly tipos: TipoAvisoCupo[] = ['busco_cupo', 'ofrezco_cupo', 'busco_grupo'];
  readonly tipoLabels = TIPO_AVISO_CUPO_LABELS;
  readonly tipoLabelsShort = TIPO_AVISO_CUPO_LABELS_SHORT;
  readonly tipoIcons = TIPO_AVISO_CUPO_ICON;
  readonly tipoHints = TIPO_AVISO_CUPO_HINT;

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private eventosService: EventosService,
    private cuposService: CuposEventoService,
    private authService: AuthService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private supabaseService: SupabaseService,
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('eventoId'));
    if (!Number.isFinite(id) || id <= 0) {
      void this.router.navigate(['/eventos-cliente']);
      return;
    }
    this.eventoId = id;
    if (this.route.snapshot.queryParamMap.get('mis') === '1') {
      this.vista = 'mis';
    }
    void this.loadEvento();
    void this.inicializarPagina();
    this.iniciarRealtimeRespuestas();
    if (this.route.snapshot.queryParamMap.get('publicar') === '1' && this.isLoggedIn) {
      setTimeout(() => this.abrirCrear(), 0);
    }
  }

  private async cargarResumenCupos(): Promise<void> {
    if (!this.isLoggedIn) return;
    try {
      const r = await this.cuposService.resumenMisCupos();
      this.respuestasCupos = r.total_respuestas;
      this.refreshView();
    } catch {
      this.respuestasCupos = 0;
    }
  }

  ngOnDestroy(): void {
    this.detenerRealtimeRespuestas();
  }

  private async inicializarPagina(): Promise<void> {
    await this.cargarResumenCupos();
    await this.loadAvisos();
    const expandId = Number(this.route.snapshot.queryParamMap.get('expand') || 0);
    if (expandId > 0 && this.vista === 'mis') {
      const aviso = this.avisosMios.find((a) => a.id === expandId);
      if (aviso) {
        await this.toggleRespuestas(aviso);
      }
    }
  }

  private iniciarRealtimeRespuestas(): void {
    const usuarioId = this.authService.getUsuario()?.id;
    if (!usuarioId || !this.isLoggedIn) return;

    this.detenerRealtimeRespuestas();
    this.notificacionesChannel = this.supabaseService
      .getClient()
      .channel(`cupos-evento-notif-${usuarioId}-${this.eventoId}`)
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
            const row = payload.new as {
              tipo?: string | null;
              titulo?: string | null;
              mensaje?: string | null;
              metadata?: Record<string, unknown> | null;
            };
            if (String(row?.tipo || '').toLowerCase() !== 'cupo_interes') return;

            const eventoId = Number(row?.metadata?.['evento_id'] ?? 0);
            if (eventoId !== this.eventoId) return;

            const avisoId = Number(row?.metadata?.['aviso_id'] ?? 0);
            void this.alertService.snackbarSuccess(
              String(row?.titulo || 'Nueva respuesta'),
              String(row?.mensaje || 'Alguien mostró interés en tu aviso.'),
            );
            void (async () => {
              if (this.vista !== 'mis') {
                this.vista = 'mis';
                void this.router.navigate([], {
                  relativeTo: this.route,
                  queryParams: {
                    mis: '1',
                    expand: avisoId > 0 ? avisoId : null,
                  },
                  queryParamsHandling: 'merge',
                  replaceUrl: true,
                });
              }
              await this.loadAvisos();
              if (avisoId > 0) {
                const aviso = this.avisosMios.find((a) => a.id === avisoId);
                if (aviso && !this.estaExpandido(avisoId)) {
                  await this.toggleRespuestas(aviso);
                }
              }
            })();
          });
        },
      )
      .subscribe();
  }

  private detenerRealtimeRespuestas(): void {
    if (this.notificacionesChannel) {
      void this.supabaseService.getClient().removeChannel(this.notificacionesChannel);
      this.notificacionesChannel = null;
    }
  }

  get isLoggedIn(): boolean {
    return !!this.authService.getCurrentUser();
  }

  get avisosMios(): AvisoCupo[] {
    return this.avisos.filter((a) => a.es_mio);
  }

  get avisosExplorar(): AvisoCupo[] {
    return this.avisos;
  }

  get listaVisible(): AvisoCupo[] {
    return this.vista === 'mis' ? this.avisosMios : this.avisosExplorar;
  }

  get totalInteresesEnMisAvisos(): number {
    return this.avisosMios.reduce((sum, a) => sum + (a.intereses_count || 0), 0);
  }

  private refreshView(): void {
    this.ngZone.run(() => this.cdr.detectChanges());
  }

  private async loadEvento(): Promise<void> {
    this.loadingEvento = true;
    this.refreshView();
    try {
      this.evento = await this.eventosService.getEventoById(this.eventoId);
    } catch {
      this.evento = null;
    } finally {
      this.loadingEvento = false;
      this.refreshView();
    }
  }

  async loadAvisos(): Promise<void> {
    this.loadingAvisos = true;
    this.refreshView();
    try {
      const tipo =
        this.vista === 'explorar' && this.filtro !== 'todos' ? this.filtro : null;
      this.avisos = await this.cuposService.listarPorEvento(this.eventoId, tipo);
      if (this.vista === 'mis' && this.avisoExpandidoId) {
        const sigue = this.avisosMios.some((a) => a.id === this.avisoExpandidoId);
        if (!sigue) {
          this.avisoExpandidoId = null;
          this.intereses = [];
        }
      }
    } catch (e: unknown) {
      console.error(e);
      this.avisos = [];
    } finally {
      this.loadingAvisos = false;
      this.refreshView();
    }
  }

  setVista(v: VistaCupos): void {
    if (v === 'mis' && !this.requiereLogin('mis-publicaciones')) {
      return;
    }
    this.vista = v;
    this.avisoExpandidoId = null;
    this.intereses = [];
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: v === 'mis' ? { mis: '1' } : { mis: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    void this.loadAvisos();
  }

  setFiltro(f: FiltroCupo): void {
    if (this.vista !== 'explorar') return;
    this.filtro = f;
    void this.loadAvisos();
  }

  requiereLogin(motivo: string): boolean {
    if (this.isLoggedIn) return true;
    irALoginCliente(this.router, `/cupos-evento/${this.eventoId}`, motivo);
    return false;
  }

  abrirCrear(): void {
    if (!this.requiereLogin('publicar')) return;
    this.crearTipo = 'busco_cupo';
    this.crearDescripcion = '';
    this.crearCupos = 1;
    this.crearZona = '';
    this.crearPrecio = null;
    this.showCrear = true;
  }

  cerrarCrear(): void {
    this.showCrear = false;
  }

  async publicarAviso(): Promise<void> {
    const desc = this.crearDescripcion.trim();
    if (desc.length < 10) {
      void this.alertService.warning('Descripción corta', 'Escribe al menos 10 caracteres.');
      return;
    }
    try {
      const avisoId = await this.cuposService.crear({
        eventoId: this.eventoId,
        tipo: this.crearTipo,
        descripcion: desc,
        cupos: this.crearCupos,
        zonaTexto: this.crearZona.trim() || undefined,
        precioReferenciaCop: this.crearPrecio,
      });
      this.showCrear = false;
      void this.alertService.success(
        'Aviso publicado',
        'Te llevamos a Mis publicaciones para que veas las respuestas cuando lleguen.',
      );
      this.vista = 'mis';
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { mis: '1', expand: avisoId },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      await this.loadAvisos();
      this.avisoExpandidoId = avisoId;
      await this.cargarIntereses(avisoId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al publicar';
      void this.alertService.error('No se publicó', msg);
    }
  }

  abrirInteres(aviso: AvisoCupo): void {
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
      void this.alertService.success(
        'Interés enviado',
        'El autor verá tu mensaje en Mis publicaciones y recibirá una notificación.',
      );
      await this.loadAvisos();
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Error al enviar';
      void this.alertService.error('No se envió', err);
    }
  }

  async toggleRespuestas(aviso: AvisoCupo): Promise<void> {
    if (!aviso.es_mio) return;
    if (this.avisoExpandidoId === aviso.id) {
      this.avisoExpandidoId = null;
      this.intereses = [];
      this.refreshView();
      return;
    }
    this.avisoExpandidoId = aviso.id;
    await this.cargarIntereses(aviso.id);
  }

  private async cargarIntereses(avisoId: number): Promise<void> {
    this.loadingIntereses = true;
    this.refreshView();
    try {
      this.intereses = await this.cuposService.listarInteresesMiAviso(avisoId);
    } catch {
      this.intereses = [];
    } finally {
      this.loadingIntereses = false;
      this.refreshView();
    }
  }

  async cerrarAviso(aviso: AvisoCupo): Promise<void> {
    const ok = await this.alertService.confirm('Cerrar aviso', '¿Ya no necesitas este aviso público?');
    if (!ok) return;
    try {
      await this.cuposService.cerrarAviso(aviso.id);
      if (this.avisoExpandidoId === aviso.id) {
        this.avisoExpandidoId = null;
        this.intereses = [];
      }
      void this.alertService.snackbarSuccess('Aviso cerrado');
      await this.loadAvisos();
    } catch (e: unknown) {
      void this.alertService.error('Error', e instanceof Error ? e.message : 'Error al cerrar');
    }
  }

  async reportarAviso(aviso: AvisoCupo): Promise<void> {
    if (!this.requiereLogin('reportar')) return;
    if (aviso.ya_reportado) return;
    const ok = await this.alertService.confirm(
      'Reportar aviso',
      `¿${MOTIVO_REPORTE_CUPO}? Lo revisaremos.`,
      'Reportar',
    );
    if (!ok) return;
    try {
      await this.cuposService.reportar(aviso.id, MOTIVO_REPORTE_CUPO);
      void this.alertService.snackbarSuccess('Reporte recibido. Gracias.');
      await this.loadAvisos();
    } catch (e: unknown) {
      void this.alertService.error('Error', e instanceof Error ? e.message : 'Error al reportar');
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

  irTraslado(): void {
    void this.router.navigate(['/mis-compras']);
  }

  irComprar(): void {
    void this.router.navigate(['/detalle-evento', this.eventoId]);
  }

  formatPrecio(n: number | null): string {
    if (n == null || !Number.isFinite(n)) return '';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(n);
  }

  trackAviso(_index: number, aviso: AvisoCupo): number {
    return aviso.id;
  }

  estaExpandido(avisoId: number): boolean {
    return this.avisoExpandidoId === avisoId;
  }

  labelRespuestas(n: number): string {
    return n === 1 ? '1 respuesta' : `${n} respuestas`;
  }

  tiempoRelativo(iso: string): string {
    const d = new Date(iso).getTime();
    const diff = Date.now() - d;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 48) return `hace ${h} h`;
    const days = Math.floor(h / 24);
    return `hace ${days} d`;
  }
}
