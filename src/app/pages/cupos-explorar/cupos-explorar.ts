import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CuposEventoService } from '../../services/cupos-evento.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { CuposHubNav } from '../../components/cupos-hub-nav/cupos-hub-nav';
import {
  AvisoCupoConEvento,
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

  readonly tipos: TipoAvisoCupo[] = ['busco_cupo', 'ofrezco_cupo', 'busco_grupo'];
  readonly tipoLabels = TIPO_AVISO_CUPO_LABELS;
  readonly tipoIcons = TIPO_AVISO_CUPO_ICON;

  constructor(
    private cuposService: CuposEventoService,
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
    if (aviso.es_mio) return;
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
