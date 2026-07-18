import { Component, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CoversService } from '../../services/covers.service';
import { WompiCuentasService } from '../../services/wompi-cuentas.service';
import { EventosService } from '../../services/eventos.service';
import { UsuariosService } from '../../services/usuarios.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { coversEventumEnabled } from '../../core/covers-feature';
import {
  COVERS_DIAS_SEMANA,
  COVERS_ESTADO_SESION_LABEL,
  labelDiaSemana,
} from '../../core/covers-labels';
import {
  ConfigCoverLugar,
  EstadoSesionCover,
  MetodoPagoCoverManual,
  AccesoCoverItem,
  PersonaDentroCover,
  PlantillaCover,
  ResumenNocheCover,
  SesionCover,
  TipoCover,
  UsuarioCoverVenta,
  VentaNocheCoverItem,
} from '../../types/covers';
import { Usuario, WompiCuenta } from '../../types';

type VistaTab = 'hoy' | 'agenda' | 'config';

interface SemanaAgenda {
  key: string;
  label: string;
  sesiones: SesionCover[];
}

const METODOS_PAGO_MANUAL: Array<{ value: MetodoPagoCoverManual; label: string }> = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia / Nequi' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'cortesia', label: 'Cortesía' },
];

@Component({
  selector: 'app-covers-config-detalle',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './covers-config-detalle.html',
  styleUrl: './covers-config-detalle.css',
})
export class CoversConfigDetalle implements OnInit {
  lugarId = 0;
  config: ConfigCoverLugar | null = null;
  loading = true;
  saving = false;
  refreshing = false;
  vista: VistaTab = 'hoy';
  wompiCuentas: WompiCuenta[] = [];

  readonly diasSemana = COVERS_DIAS_SEMANA;
  readonly estadoLabels = COVERS_ESTADO_SESION_LABEL;
  readonly labelDia = labelDiaSemana;

  lugarForm = {
    covers_habilitado: false,
    covers_descripcion: '',
    covers_porcentaje_servicio: 0,
    covers_organizador_id: null as number | null,
  };

  organizadores: Usuario[] = [];
  esAdministrador = false;
  private vistaInicialAplicada = false;

  showTipoModal = false;
  editingTipo: TipoCover | null = null;
  tipoPrecioInput = '';
  tipoForm = {
    nombre: '',
    descripcion: '',
    precio_cop: 0,
    permite_reingreso: true,
    limite_por_persona: null as number | null,
    orden: 0,
    activo: true,
    wompi_cuenta_id: null as number | null,
  };

  showPlantillaModal = false;
  editingPlantilla: PlantillaCover | null = null;
  plantillaForm = {
    tipo_cover_id: 0,
    dia_semana: 5,
    hora_apertura: '22:00',
    hora_cierre: '03:00',
    aforo_maximo: null as number | null,
    cantidad_maxima_venta: null as number | null,
    dias_anticipacion: 21,
    activo: true,
  };

  showSesionModal = false;
  sesionForm = {
    tipo_cover_id: 0,
    fecha: '',
    hora_apertura: '22:00',
    hora_cierre: '03:00',
    aforo_maximo: null as number | null,
    cantidad_maxima_venta: null as number | null,
    precio_cop: null as number | null,
    estado: 'programada' as 'programada' | 'abierta',
  };

  showWizardModal = false;
  wizardPrecioInput = '';
  wizardForm = {
    nombre_tipo: 'Cover general',
    precio_cop: 25000,
    dia_semana: 5,
    hora_apertura: '22:00',
    hora_cierre: '03:00',
    covers_descripcion: '',
    aforo_maximo: null as number | null,
    cantidad_maxima_venta: null as number | null,
    permite_reingreso: true,
    wompi_cuenta_id: null as number | null,
  };

  showVentaModal = false;
  buscandoClienteVenta = false;
  ventaBusquedaHecha = false;
  ventaClienteSearch = '';
  ventaClientes: UsuarioCoverVenta[] = [];
  ventaClienteElegido: UsuarioCoverVenta | null = null;
  private ventaSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private ventaSearchSeq = 0;
  ventaForm = {
    sesion_id: 0,
    cliente_id: null as number | null,
    cantidad: 1,
    metodo_pago: 'efectivo' as MetodoPagoCoverManual,
    notas: '',
  };
  readonly metodosPagoManual = METODOS_PAGO_MANUAL;

  showCorteModal = false;
  loadingCorte = false;
  corteSesion: SesionCover | null = null;
  corteResumen: ResumenNocheCover | null = null;
  corteVentas: VentaNocheCoverItem[] = [];
  private corteLoadSeq = 0;

  showPuertaModal = false;
  loadingPuerta = false;
  puertaSesion: SesionCover | null = null;
  personasDentro: PersonaDentroCover[] = [];
  accesosRecientes: AccesoCoverItem[] = [];

  /** Panel inline en tarjeta Hoy */
  hoyPanelBySesion: Record<number, 'resumen' | 'ventas' | 'puerta'> = {};
  hoyOpsBySesion: Record<
    number,
    {
      loading: boolean;
      resumen: ResumenNocheCover | null;
      ventas: VentaNocheCoverItem[];
      dentro: PersonaDentroCover[];
      accesos: AccesoCoverItem[];
    }
  > = {};
  /** Evita que una carga vieja deje loading=true al cancelarse por otra más nueva. */
  private opsLoadSeqBySesion: Record<number, number> = {};

  /** Detalle de noche desde Agenda (misma UX que Hoy). */
  detalleNoche: SesionCover | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private coversService: CoversService,
    private wompiCuentasService: WompiCuentasService,
    private eventosService: EventosService,
    private usuariosService: UsuariosService,
    private authService: AuthService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    if (!coversEventumEnabled) {
      void this.router.navigate(['/dashboard']);
      return;
    }
    if (!this.authService.isAdministrador() && !this.authService.isOrganizador()) {
      void this.router.navigate(['/dashboard']);
      return;
    }

    this.esAdministrador = this.authService.isAdministrador();

    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('lugarId'));
      if (!Number.isFinite(id) || id <= 0) {
        void this.router.navigate(['/covers-config']);
        return;
      }
      this.lugarId = id;
      void this.loadConfig();
    });

    void this.loadWompiCuentas();
    if (this.esAdministrador) {
      void this.loadOrganizadores();
    }
  }

  async loadOrganizadores(): Promise<void> {
    try {
      this.organizadores = await this.usuariosService.getOrganizadores();
    } catch {
      this.organizadores = [];
    }
    this.cdr.markForCheck();
  }

  nombreOrganizador(u: Usuario): string {
    const nombre = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
    return nombre ? `${nombre} (${u.email})` : u.email;
  }

  labelResponsableActual(): string {
    const lugar = this.config?.lugar;
    if (!lugar?.covers_organizador_id) return 'Sin asignar';
    const nombre = (lugar.covers_organizador_nombre ?? '').trim();
    if (nombre && lugar.covers_organizador_email) {
      return `${nombre} (${lugar.covers_organizador_email})`;
    }
    return nombre || lugar.covers_organizador_email || `ID ${lugar.covers_organizador_id}`;
  }

  labelWompiCuenta(cuentaId: number | null | undefined): string {
    if (cuentaId == null) return 'Sin asignar';
    const cuenta = this.wompiCuentas.find((c) => c.id === cuentaId);
    return cuenta ? `${cuenta.nombre} (ID ${cuenta.id})` : `ID ${cuentaId}`;
  }

  async loadWompiCuentas(): Promise<void> {
    try {
      this.wompiCuentas = await this.wompiCuentasService.getCuentasActivas();
    } catch {
      this.wompiCuentas = [];
    }
    const defaultWompi = this.defaultWompiCuentaId();
    if (defaultWompi != null && this.wizardForm.wompi_cuenta_id == null) {
      this.wizardForm.wompi_cuenta_id = defaultWompi;
    }
    this.cdr.markForCheck();
  }

  async loadConfig(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      this.config = await this.coversService.obtenerConfigLugar(this.lugarId);
      if (!this.config) {
        await this.alertService.error('Lugar no encontrado o sin permiso.');
        void this.router.navigate(['/covers-config']);
        return;
      }
      this.syncLugarFormFromConfig();
      if (!this.vistaInicialAplicada) {
        this.vista = this.primeraVistaPendiente();
        this.vistaInicialAplicada = true;
      }
    } catch {
      await this.alertService.error('No se pudo cargar la configuración.');
      void this.router.navigate(['/covers-config']);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
      if (this.vista === 'hoy') {
        void this.cargarOpsHoy();
      }
    }
  }

  private refreshSeq = 0;

  /** Recarga silenciosa (no oculta la pantalla) para actualizar aforo/ventas. */
  async recargarHoy(): Promise<void> {
    await this.refrescarDatos({ opsHoy: true });
  }

  /** Refresco al cambiar de pestaña o pulsar Recargar. */
  private async refrescarDatos(opts: { opsHoy?: boolean } = {}): Promise<void> {
    if (!this.lugarId) return;
    const seq = ++this.refreshSeq;
    this.refreshing = true;
    this.forceViewRefresh();
    try {
      const config = await this.coversService.obtenerConfigLugar(this.lugarId);
      if (seq !== this.refreshSeq) return;
      if (!config) {
        await this.alertService.error('No se pudo actualizar.');
        return;
      }
      this.ngZone.run(() => {
        this.config = {
          ...config,
          sesiones_cover: [...(config.sesiones_cover ?? [])],
          tipos_cover: [...(config.tipos_cover ?? [])],
          plantillas_cover: [...(config.plantillas_cover ?? [])],
        };
        this.syncLugarFormFromConfig();
        this.forceViewRefresh();
      });
      if (opts.opsHoy && seq === this.refreshSeq) {
        await this.cargarOpsHoy();
      }
    } catch {
      if (seq !== this.refreshSeq) return;
      await this.alertService.error('No se pudo actualizar.');
    } finally {
      if (seq === this.refreshSeq) {
        this.refreshing = false;
        this.forceViewRefresh();
      }
    }
  }

  setHoyPanel(sesionId: number, panel: 'resumen' | 'ventas' | 'puerta'): void {
    this.hoyPanelBySesion[sesionId] = panel;
  }

  hoyPanelDe(sesionId: number): 'resumen' | 'ventas' | 'puerta' {
    return this.hoyPanelBySesion[sesionId] ?? 'resumen';
  }

  opsHoyDe(sesionId: number): {
    loading: boolean;
    resumen: ResumenNocheCover | null;
    ventas: VentaNocheCoverItem[];
    dentro: PersonaDentroCover[];
    accesos: AccesoCoverItem[];
  } {
    return (
      this.hoyOpsBySesion[sesionId] ?? {
        loading: false,
        resumen: null,
        ventas: [],
        dentro: [],
        accesos: [],
      }
    );
  }

  metodosPuertaDe(sesionId: number): Array<{ metodo: string; total: number }> {
    const map = this.opsHoyDe(sesionId).resumen?.puerta_por_metodo ?? {};
    return Object.entries(map)
      .filter(([metodo]) => metodo.toLowerCase() !== 'cortesia')
      .map(([metodo, total]) => ({
        metodo,
        total: Number(total) || 0,
      }));
  }

  async cargarOpsHoy(): Promise<void> {
    await this.cargarOpsParaSesiones(this.sesionesHoy, { replaceAll: true });
  }

  async cargarOpsSesion(sesion: SesionCover): Promise<void> {
    await this.cargarOpsParaSesiones([sesion], { replaceAll: false });
  }

  private async cargarOpsParaSesiones(
    sesiones: SesionCover[],
    opts: { replaceAll: boolean },
  ): Promise<void> {
    if (!sesiones.length) {
      if (opts.replaceAll) {
        this.hoyOpsBySesion = {};
        this.opsLoadSeqBySesion = {};
      }
      this.forceViewRefresh();
      return;
    }

    const loadIds = sesiones.map((s) => {
      const seq = (this.opsLoadSeqBySesion[s.id] ?? 0) + 1;
      this.opsLoadSeqBySesion[s.id] = seq;
      this.hoyOpsBySesion = {
        ...this.hoyOpsBySesion,
        [s.id]: {
          ...(this.hoyOpsBySesion[s.id] ?? {
            resumen: null,
            ventas: [],
            dentro: [],
            accesos: [],
          }),
          loading: true,
        },
      };
      return { sesion: s, seq };
    });
    this.forceViewRefresh();

    await Promise.all(
      loadIds.map(async ({ sesion: s, seq }) => {
        const prev = this.hoyOpsBySesion[s.id];
        try {
          const [corteRes, dentroRes, accesosRes] = await Promise.allSettled([
            this.coversService.obtenerResumenNoche(s.id),
            this.coversService.listarDentroSesion(s.id),
            this.coversService.listarAccesosSesion(s.id, 20),
          ]);
          if (seq !== this.opsLoadSeqBySesion[s.id]) return;

          const corte = corteRes.status === 'fulfilled' ? corteRes.value : null;
          const dentro = dentroRes.status === 'fulfilled' ? dentroRes.value : [];
          const accesos = accesosRes.status === 'fulfilled' ? accesosRes.value : [];

          this.ngZone.run(() => {
            this.hoyOpsBySesion = {
              ...this.hoyOpsBySesion,
              [s.id]: {
                loading: false,
                resumen: corte?.resumen ?? prev?.resumen ?? null,
                ventas: corte ? [...corte.ventas] : (prev?.ventas ?? []),
                dentro: [...dentro],
                accesos: [...accesos],
              },
            };
            this.forceViewRefresh();
          });
        } catch {
          if (seq !== this.opsLoadSeqBySesion[s.id]) return;
          this.ngZone.run(() => {
            this.hoyOpsBySesion = {
              ...this.hoyOpsBySesion,
              [s.id]: {
                loading: false,
                resumen: prev?.resumen ?? null,
                ventas: prev?.ventas ?? [],
                dentro: prev?.dentro ?? [],
                accesos: prev?.accesos ?? [],
              },
            };
            this.forceViewRefresh();
          });
        }
      }),
    );
  }

  async abrirDetalleNoche(sesion: SesionCover): Promise<void> {
    this.detalleNoche = sesion;
    this.setHoyPanel(sesion.id, 'resumen');
    this.hoyOpsBySesion = {
      ...this.hoyOpsBySesion,
      [sesion.id]: {
        ...(this.hoyOpsBySesion[sesion.id] ?? {
          resumen: null,
          ventas: [],
          dentro: [],
          accesos: [],
        }),
        loading: true,
      },
    };
    this.forceViewRefresh();
    await this.cargarOpsSesion(sesion);
  }

  volverAgenda(): void {
    this.detalleNoche = null;
    this.forceViewRefresh();
  }

  async recargarDetalleNoche(): Promise<void> {
    if (!this.detalleNoche || this.refreshing) return;
    this.refreshing = true;
    this.forceViewRefresh();
    try {
      const config = await this.coversService.obtenerConfigLugar(this.lugarId);
      if (config) {
        this.config = {
          ...config,
          sesiones_cover: [...(config.sesiones_cover ?? [])],
          tipos_cover: [...(config.tipos_cover ?? [])],
          plantillas_cover: [...(config.plantillas_cover ?? [])],
        };
        this.syncLugarFormFromConfig();
        const updated = config.sesiones_cover.find((s) => s.id === this.detalleNoche!.id);
        if (updated) this.detalleNoche = updated;
      }
      if (this.detalleNoche) await this.cargarOpsSesion(this.detalleNoche);
    } catch {
      await this.alertService.error('No se pudo actualizar.');
    } finally {
      this.refreshing = false;
      this.forceViewRefresh();
    }
  }

  get tieneTipos(): boolean {
    return (this.config?.tipos_cover.length ?? 0) > 0;
  }

  get tienePlantillas(): boolean {
    return (this.config?.plantillas_cover.length ?? 0) > 0;
  }

  contadorTab(id: VistaTab): number | null {
    if (!this.config) return null;
    if (id === 'hoy') return this.sesionesHoy.length || null;
    if (id === 'agenda') {
      return this.config.sesiones_cover.filter((s) => !this.esFechaHoy(s.fecha)).length || null;
    }
    return null;
  }

  get fechaHoyLabel(): string {
    return new Date().toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  get sesionesHoy(): SesionCover[] {
    return (this.config?.sesiones_cover ?? []).filter((s) => this.esFechaHoy(s.fecha));
  }

  get sesionesAgenda(): SesionCover[] {
    return (this.config?.sesiones_cover ?? []).filter((s) => !this.esFechaHoy(s.fecha));
  }

  get semanasAgenda(): SemanaAgenda[] {
    const byWeek = new Map<string, SemanaAgenda>();
    for (const s of this.sesionesAgenda) {
      const key = this.inicioSemanaKey(s.fecha);
      let grupo = byWeek.get(key);
      if (!grupo) {
        grupo = { key, label: this.labelSemana(key), sesiones: [] };
        byWeek.set(key, grupo);
      }
      grupo.sesiones.push(s);
    }
    const weeks = Array.from(byWeek.values()).sort((a, b) => a.key.localeCompare(b.key));
    for (const w of weeks) {
      w.sesiones.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_apertura.localeCompare(b.hora_apertura));
    }
    return weeks;
  }

  pctAforo(s: SesionCover): number {
    if (!s.aforo_maximo || s.aforo_maximo <= 0) return 0;
    return Math.min(100, Math.round((s.personas_dentro / s.aforo_maximo) * 100));
  }

  pctVenta(s: SesionCover): number {
    const max = s.cantidad_maxima_venta ?? s.aforo_maximo;
    if (!max || max <= 0) return 0;
    return Math.min(100, Math.round((s.cantidad_vendida / max) * 100));
  }

  ingresosEstimados(s: SesionCover): number {
    return (s.cantidad_vendida ?? 0) * this.precioProductoSesion(s);
  }

  /** Precio vigente del producto (tipo_cover), no el snapshot de la sesión. */
  precioProductoSesion(sesion: SesionCover): number {
    const tipo = this.config?.tipos_cover.find((t) => t.id === sesion.tipo_cover_id);
    if (tipo?.precio_cop != null && Number(tipo.precio_cop) > 0) {
      return Number(tipo.precio_cop);
    }
    return Number(sesion.precio_cop ?? 0);
  }

  private inicioSemanaKey(fecha: string): string {
    const d = new Date(fecha.slice(0, 10) + 'T12:00:00');
    const day = d.getDay(); // 0=dom
    const diff = day === 0 ? -6 : 1 - day; // lunes
    d.setDate(d.getDate() + diff);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  private labelSemana(lunesKey: string): string {
    const inicio = new Date(lunesKey + 'T12:00:00');
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return `${inicio.toLocaleDateString('es-CO', opts)} – ${fin.toLocaleDateString('es-CO', opts)}`;
  }

  labelEstadoClub(): string {
    if (!this.config?.lugar.covers_organizador_id) return 'Sin responsable';
    if (this.config.lugar.covers_habilitado) return 'Publicado';
    return 'Pausado';
  }

  /** Entra a la vista útil según el estado del club. */
  private primeraVistaPendiente(): VistaTab {
    if (this.esAdministrador && !this.config?.lugar.covers_organizador_id && !this.lugarForm.covers_organizador_id) {
      return 'config';
    }
    if (!this.tieneTipos) return 'config';
    return 'hoy';
  }

  private syncLugarFormFromConfig(): void {
    if (!this.config) return;
    this.lugarForm = {
      covers_habilitado: !!this.config.lugar.covers_habilitado,
      covers_descripcion: this.config.lugar.covers_descripcion ?? '',
      covers_porcentaje_servicio: Number(this.config.lugar.covers_porcentaje_servicio ?? 0),
      covers_organizador_id: this.config.lugar.covers_organizador_id ?? null,
    };
  }

  ingresosPulse(sesionId: number, s: SesionCover): number {
    const r = this.opsHoyDe(sesionId).resumen;
    if (r) return r.ingresos_totales;
    return this.ingresosEstimados(s);
  }

  vendidosPulse(sesionId: number, s: SesionCover): number {
    const r = this.opsHoyDe(sesionId).resumen;
    if (r) return r.covers_activos;
    return s.cantidad_vendida ?? 0;
  }

  porcentajeApp(resumen: ResumenNocheCover): number {
    const total = Number(resumen.ingresos_totales) || 0;
    if (total <= 0) return 0;
    return Math.round(((Number(resumen.app_ingresos) || 0) / total) * 100);
  }

  porcentajePuerta(resumen: ResumenNocheCover): number {
    const total = Number(resumen.ingresos_totales) || 0;
    if (total <= 0) return 0;
    return Math.max(0, 100 - this.porcentajeApp(resumen));
  }

  fondoDona(resumen: ResumenNocheCover): string {
    const total = Number(resumen.ingresos_totales) || 0;
    if (total <= 0) return 'conic-gradient(#e2e8f0 0 100%)';
    const app = this.porcentajeApp(resumen);
    return `conic-gradient(#7c3aed 0 ${app}%, #10b981 ${app}% 100%)`;
  }

  fondoDonaAforo(s: SesionCover): string {
    const pct = this.pctAforo(s);
    if (pct <= 0) return 'conic-gradient(#e2e8f0 0 100%)';
    const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#10b981';
    return `conic-gradient(${color} 0 ${pct}%, #e2e8f0 ${pct}% 100%)`;
  }

  fondoDonaVenta(s: SesionCover): string {
    const pct = this.pctVenta(s);
    if (pct <= 0) return 'conic-gradient(#e2e8f0 0 100%)';
    const color = pct >= 90 ? '#ef4444' : pct >= 60 ? '#7c3aed' : '#8b5cf6';
    return `conic-gradient(${color} 0 ${pct}%, #e2e8f0 ${pct}% 100%)`;
  }

  cupoVenta(s: SesionCover): number {
    return s.cantidad_maxima_venta ?? s.aforo_maximo ?? 0;
  }

  fechaSesionWeekday(fecha: string): string {
    return new Date(`${fecha}T12:00:00`)
      .toLocaleDateString('es-CO', { weekday: 'short' })
      .replace('.', '')
      .toUpperCase();
  }

  fechaSesionDia(fecha: string): string {
    return String(new Date(`${fecha}T12:00:00`).getDate());
  }

  fechaSesionMes(fecha: string): string {
    return new Date(`${fecha}T12:00:00`)
      .toLocaleDateString('es-CO', { month: 'short' })
      .replace('.', '')
      .toUpperCase();
  }

  cuposLibres(s: SesionCover): number {
    return Math.max(0, (s.aforo_maximo ?? 0) - (s.personas_dentro ?? 0));
  }

  cortesiasPulse(sesionId: number): number {
    return Number(this.opsHoyDe(sesionId).resumen?.cortesias ?? 0);
  }

  setVista(v: VistaTab): void {
    if ((v === 'hoy' || v === 'agenda') && !this.tieneTipos) {
      void this.alertService.warning(
        this.esAdministrador
          ? 'Crea un producto en Configurar antes de operar noches.'
          : 'Aún no hay producto. Un administrador debe crearlo.',
      );
      this.vista = 'config';
      this.detalleNoche = null;
      return;
    }
    this.vista = v;
    if (v !== 'agenda') this.detalleNoche = null;
    this.forceViewRefresh();
    if (v === 'hoy' || v === 'agenda') {
      void this.refrescarDatos({ opsHoy: v === 'hoy' });
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value ?? 0);
  }

  onTipoPrecioInputChange(rawValue: string): void {
    const digits = (rawValue ?? '').replace(/\D/g, '');
    this.tipoPrecioInput = this.formatMilesFromDigits(digits);
    this.tipoForm.precio_cop = digits.length > 0 ? Number(digits) : 0;
  }

  onWizardPrecioInputChange(rawValue: string): void {
    const digits = (rawValue ?? '').replace(/\D/g, '');
    this.wizardPrecioInput = this.formatMilesFromDigits(digits);
    this.wizardForm.precio_cop = digits.length > 0 ? Number(digits) : 0;
  }

  private formatMiles(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return '';
    }
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(Number(value));
  }

  private formatMilesFromDigits(digits: string): string {
    if (!digits) return '';
    const numeric = Number(digits);
    if (!Number.isFinite(numeric)) return '';
    return this.formatMiles(numeric);
  }

  private syncTipoPrecioInput(): void {
    this.tipoPrecioInput = this.formatMiles(this.tipoForm.precio_cop);
  }

  private syncWizardPrecioInput(): void {
    this.wizardPrecioInput = this.formatMiles(this.wizardForm.precio_cop);
  }

  formatHora(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  formatFecha(fecha: string): string {
    if (!fecha) return '—';
    const d = new Date(fecha + 'T12:00:00');
    return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  horaDesdeTime(time: string): string {
    if (!time) return '—';
    return time.slice(0, 5);
  }

  async guardarLugar(): Promise<void> {
    if (this.esAdministrador && !this.lugarForm.covers_organizador_id) {
      await this.alertService.warning(
        'Responsable requerido',
        'Asigna un organizador responsable antes de guardar.',
      );
      return;
    }
    this.saving = true;
    try {
      await this.coversService.configurarLugar(
        this.lugarId,
        this.lugarForm.covers_habilitado,
        this.lugarForm.covers_descripcion,
        this.lugarForm.covers_porcentaje_servicio,
        this.esAdministrador ? this.lugarForm.covers_organizador_id : null,
      );
      await this.alertService.success('Configuración del lugar guardada.');
      await this.loadConfig();
    } catch (e: unknown) {
      await this.alertService.error(this.msgError(e, 'No se pudo guardar.'));
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  openTipoModal(tipo?: TipoCover): void {
    if (!tipo) {
      if (!this.esAdministrador) {
        void this.alertService.warning(
          'Sin permiso',
          'Solo un administrador puede crear productos de cover.',
        );
        return;
      }
      if (!this.lugarForm.covers_organizador_id) {
        void this.alertService.warning(
          'Responsable requerido',
          'Asigna y guarda un organizador responsable en Club antes de crear productos.',
        );
        this.setVista('config');
        return;
      }
    }
    this.editingTipo = tipo ?? null;
    const wompiDefault = this.defaultWompiCuentaId();
    if (tipo) {
      this.tipoForm = {
        nombre: tipo.nombre,
        descripcion: tipo.descripcion ?? '',
        precio_cop: tipo.precio_cop,
        permite_reingreso: tipo.permite_reingreso,
        limite_por_persona: tipo.limite_por_persona ?? null,
        orden: tipo.orden ?? 0,
        activo: tipo.activo,
        wompi_cuenta_id: tipo.wompi_cuenta_id ?? null,
      };
      if (this.esAdministrador && !tipo.wompi_cuenta_id && tipo.evento_id) {
        void this.cargarWompiDelEvento(tipo.evento_id);
      } else if (this.esAdministrador && !tipo.wompi_cuenta_id && wompiDefault != null) {
        this.tipoForm.wompi_cuenta_id = wompiDefault;
      }
    } else {
      this.tipoForm = {
        nombre: '',
        descripcion: '',
        precio_cop: 25000,
        permite_reingreso: true,
        limite_por_persona: null,
        orden: 0,
        activo: true,
        wompi_cuenta_id: wompiDefault,
      };
    }
    this.syncTipoPrecioInput();
    this.showTipoModal = true;
  }

  private async cargarWompiDelEvento(eventoId: number): Promise<void> {
    try {
      const evento = await this.eventosService.getEventoById(eventoId);
      if (evento.wompi_cuenta_id != null) {
        this.tipoForm.wompi_cuenta_id = evento.wompi_cuenta_id;
        this.cdr.markForCheck();
      }
    } catch {
      // Sin bloquear edición si no se pudo leer el evento espejo
    }
  }

  closeTipoModal(): void {
    this.showTipoModal = false;
    this.editingTipo = null;
  }

  async guardarTipo(): Promise<void> {
    if (!this.editingTipo && !this.esAdministrador) {
      await this.alertService.warning('Solo un administrador puede crear productos de cover.');
      return;
    }
    if (!this.tipoForm.nombre.trim()) {
      await this.alertService.warning('Nombre requerido.');
      return;
    }
    if (
      this.esAdministrador &&
      this.wompiCuentas.length > 0 &&
      !this.tipoForm.wompi_cuenta_id
    ) {
      await this.alertService.warning('Selecciona la cuenta Wompi que cobrará este cover.');
      return;
    }
    this.saving = true;
    try {
      await this.coversService.upsertTipoCover({
        id: this.editingTipo?.id,
        lugarId: this.lugarId,
        nombre: this.tipoForm.nombre.trim(),
        descripcion: this.tipoForm.descripcion.trim() || null,
        precioCop: Number(this.tipoForm.precio_cop),
        permiteReingreso: this.tipoForm.permite_reingreso,
        limitePorPersona: this.tipoForm.limite_por_persona,
        orden: this.tipoForm.orden,
        activo: this.tipoForm.activo,
        wompiCuentaId: this.esAdministrador ? this.tipoForm.wompi_cuenta_id : null,
      });
      await this.alertService.success(
        this.editingTipo ? 'Producto actualizado.' : 'Producto creado.',
      );
      this.closeTipoModal();
      await this.loadConfig();
    } catch (e: unknown) {
      await this.alertService.error(this.msgError(e, 'No se pudo guardar el tipo.'));
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  openPlantillaModal(plantilla?: PlantillaCover): void {
    this.editingPlantilla = plantilla ?? null;
    if (plantilla) {
      this.plantillaForm = {
        tipo_cover_id: plantilla.tipo_cover_id,
        dia_semana: plantilla.dia_semana,
        hora_apertura: this.horaDesdeTime(plantilla.hora_apertura),
        hora_cierre: this.horaDesdeTime(plantilla.hora_cierre),
        aforo_maximo: plantilla.aforo_maximo ?? null,
        cantidad_maxima_venta: plantilla.cantidad_maxima_venta ?? null,
        dias_anticipacion: plantilla.dias_anticipacion ?? 21,
        activo: plantilla.activo,
      };
    } else {
      const primerTipo = this.config?.tipos_cover?.[0];
      this.plantillaForm = {
        tipo_cover_id: primerTipo?.id ?? 0,
        dia_semana: 5,
        hora_apertura: '22:00',
        hora_cierre: '03:00',
        aforo_maximo: this.config?.lugar.capacidad_maxima ?? null,
        cantidad_maxima_venta: this.config?.lugar.capacidad_maxima ?? null,
        dias_anticipacion: 21,
        activo: true,
      };
    }
    this.showPlantillaModal = true;
  }

  closePlantillaModal(): void {
    this.showPlantillaModal = false;
    this.editingPlantilla = null;
  }

  async guardarPlantilla(): Promise<void> {
    if (!this.plantillaForm.tipo_cover_id) {
      await this.alertService.warning('Selecciona un tipo de cover.');
      return;
    }
    this.saving = true;
    try {
      await this.coversService.upsertPlantillaCover({
        id: this.editingPlantilla?.id,
        tipoCoverId: this.plantillaForm.tipo_cover_id,
        diaSemana: this.plantillaForm.dia_semana,
        horaApertura: this.plantillaForm.hora_apertura,
        horaCierre: this.plantillaForm.hora_cierre,
        aforoMaximo: this.plantillaForm.aforo_maximo,
        cantidadMaximaVenta: this.plantillaForm.cantidad_maxima_venta,
        diasAnticipacion: this.plantillaForm.dias_anticipacion,
        activo: this.plantillaForm.activo,
      });
      await this.alertService.success(this.editingPlantilla ? 'Plantilla actualizada.' : 'Plantilla creada.');
      this.closePlantillaModal();
      await this.loadConfig();
    } catch (e: unknown) {
      await this.alertService.error(this.msgError(e, 'No se pudo guardar la plantilla.'));
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  openSesionModal(): void {
    const primerTipo = this.config?.tipos_cover?.find((t) => t.activo);
    this.sesionForm = {
      tipo_cover_id: primerTipo?.id ?? 0,
      fecha: new Date().toISOString().slice(0, 10),
      hora_apertura: '22:00',
      hora_cierre: '03:00',
      aforo_maximo: this.config?.lugar.capacidad_maxima ?? null,
      cantidad_maxima_venta: null,
      precio_cop: primerTipo?.precio_cop ?? null,
      estado: 'programada',
    };
    this.showSesionModal = true;
  }

  closeSesionModal(): void {
    this.showSesionModal = false;
  }

  async guardarSesion(): Promise<void> {
    if (!this.sesionForm.tipo_cover_id || !this.sesionForm.fecha) {
      await this.alertService.warning('Tipo y fecha son requeridos.');
      return;
    }
    this.saving = true;
    try {
      await this.coversService.crearSesionManual({
        tipoCoverId: this.sesionForm.tipo_cover_id,
        fecha: this.sesionForm.fecha,
        horaApertura: this.sesionForm.hora_apertura,
        horaCierre: this.sesionForm.hora_cierre,
        aforoMaximo: this.sesionForm.aforo_maximo,
        cantidadMaximaVenta: this.sesionForm.cantidad_maxima_venta,
        precioCop: this.sesionForm.precio_cop,
        estado: this.sesionForm.estado,
      });
      await this.alertService.success('Sesión creada.');
      this.closeSesionModal();
      await this.loadConfig();
    } catch (e: unknown) {
      await this.alertService.error(this.msgError(e, 'No se pudo crear la sesión.'));
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async generarSesiones(): Promise<void> {
    this.saving = true;
    try {
      const n = await this.coversService.generarSesiones();
      await this.alertService.success(`Sesiones generadas: ${n}.`);
      await this.loadConfig();
    } catch (e: unknown) {
      await this.alertService.error(this.msgError(e, 'No se pudieron generar sesiones.'));
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async cambiarEstadoSesion(sesion: SesionCover, estado: EstadoSesionCover): Promise<void> {
    if (estado === 'abierta' && !this.esFechaHoy(sesion.fecha)) {
      await this.alertService.warning(
        'No se puede abrir',
        `Solo puedes abrir la noche el día de la sesión (${this.formatFecha(sesion.fecha)}).`,
      );
      return;
    }
    const ok = await this.alertService.confirm(
      `¿Cambiar sesión del ${this.formatFecha(sesion.fecha)} a «${this.estadoLabels[estado]}»?`,
    );
    if (!ok) return;
    this.saving = true;
    try {
      await this.coversService.cambiarEstadoSesion(sesion.id, estado);
      await this.loadConfig();
      await this.syncDetalleNocheTrasCarga();
    } catch (e: unknown) {
      await this.alertService.error(this.msgError(e, 'No se pudo cambiar el estado.'));
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  private async syncDetalleNocheTrasCarga(): Promise<void> {
    if (!this.detalleNoche || !this.config) return;
    const updated = this.config.sesiones_cover.find((s) => s.id === this.detalleNoche!.id) ?? null;
    this.detalleNoche = updated;
    if (updated) await this.cargarOpsSesion(updated);
  }

  /** True si la fecha de sesión (YYYY-MM-DD) es hoy en hora local. */
  esFechaHoy(fecha: string): boolean {
    if (!fecha) return false;
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');
    return fecha.slice(0, 10) === `${y}-${m}-${d}`;
  }

  puedeAbrirSesion(sesion: SesionCover): boolean {
    return sesion.estado === 'programada' && this.esFechaHoy(sesion.fecha);
  }

  puedeVenderSesion(sesion: SesionCover): boolean {
    return (
      this.esFechaHoy(sesion.fecha) &&
      (sesion.estado === 'programada' || sesion.estado === 'abierta')
    );
  }

  get ventaSesionSeleccionada(): SesionCover | null {
    return this.config?.sesiones_cover.find((s) => s.id === this.ventaForm.sesion_id) ?? null;
  }

  get ventaClienteSeleccionado(): UsuarioCoverVenta | null {
    return this.ventaClienteElegido;
  }

  get ventaTotalEstimado(): number {
    const s = this.ventaSesionSeleccionada;
    if (!s) return 0;
    if (this.ventaForm.metodo_pago === 'cortesia') return 0;
    return this.precioProductoSesion(s) * Math.max(1, this.ventaForm.cantidad || 1);
  }

  nombreUsuarioVenta(u: UsuarioCoverVenta): string {
    const nombre = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
    return nombre || 'Sin nombre';
  }

  labelUsuarioVenta(u: UsuarioCoverVenta): string {
    const nombre = this.nombreUsuarioVenta(u);
    const doc = (u.documento_identidad ?? '').trim();
    if (doc) return `${nombre} · ${doc}`;
    return `${nombre} · ${u.email}`;
  }

  openVentaModal(sesion?: SesionCover): void {
    const target =
      sesion ??
      this.sesionesHoy.find((s) => this.puedeVenderSesion(s)) ??
      this.sesionesHoy[0] ??
      null;
    if (!target || !this.puedeVenderSesion(target)) {
      void this.alertService.warning(
        'Sin noche vendible',
        'Solo puedes vender o asignar covers el día de la noche, si está programada o abierta.',
      );
      return;
    }
    this.ventaForm = {
      sesion_id: target.id,
      cliente_id: null,
      cantidad: 1,
      metodo_pago: 'efectivo',
      notas: '',
    };
    this.ventaClienteSearch = '';
    this.ventaClientes = [];
    this.ventaClienteElegido = null;
    this.ventaBusquedaHecha = false;
    this.showVentaModal = true;
  }

  closeVentaModal(): void {
    if (this.ventaSearchTimer) {
      clearTimeout(this.ventaSearchTimer);
      this.ventaSearchTimer = null;
    }
    this.ventaSearchSeq++;
    this.buscandoClienteVenta = false;
    this.showVentaModal = false;
  }

  onVentaSearchChange(value: string): void {
    this.ventaClienteSearch = value;
    if (this.ventaSearchTimer) {
      clearTimeout(this.ventaSearchTimer);
      this.ventaSearchTimer = null;
    }
    const q = value.trim();
    if (q.length < 2) {
      this.ventaClientes = [];
      this.ventaBusquedaHecha = false;
      this.buscandoClienteVenta = false;
      this.cdr.detectChanges();
      return;
    }
    this.buscandoClienteVenta = true;
    this.cdr.detectChanges();
    this.ventaSearchTimer = setTimeout(() => {
      void this.ejecutarBusquedaVenta(q);
    }, 300);
  }

  private async ejecutarBusquedaVenta(q: string): Promise<void> {
    const seq = ++this.ventaSearchSeq;
    try {
      const resultados = await this.coversService.buscarUsuariosParaVentaCover(q, 20);
      if (seq !== this.ventaSearchSeq) return;
      this.ngZone.run(() => {
        this.ventaClientes = resultados;
        this.ventaBusquedaHecha = true;
        this.buscandoClienteVenta = false;
        this.cdr.detectChanges();
      });
    } catch {
      if (seq !== this.ventaSearchSeq) return;
      this.ngZone.run(() => {
        this.ventaClientes = [];
        this.ventaBusquedaHecha = true;
        this.buscandoClienteVenta = false;
        this.cdr.detectChanges();
      });
    }
  }

  async buscarClientesVenta(): Promise<void> {
    const q = this.ventaClienteSearch.trim();
    if (q.length < 2) {
      this.ventaBusquedaHecha = false;
      this.ventaClientes = [];
      await this.alertService.warning('Escribe al menos 2 caracteres.');
      return;
    }
    this.buscandoClienteVenta = true;
    this.ventaBusquedaHecha = false;
    this.ventaClientes = [];
    this.cdr.detectChanges();
    await this.ejecutarBusquedaVenta(q);
  }

  seleccionarClienteVenta(u: UsuarioCoverVenta): void {
    this.ventaClienteElegido = u;
    this.ventaForm.cliente_id = u.id;
    this.ventaClientes = [];
    this.ventaBusquedaHecha = false;
    this.ventaClienteSearch = '';
  }

  cambiarClienteVenta(): void {
    this.ventaClienteElegido = null;
    this.ventaForm.cliente_id = null;
    this.ventaClientes = [];
    this.ventaBusquedaHecha = false;
    this.ventaClienteSearch = '';
  }

  async openCorteModal(sesion: SesionCover): Promise<void> {
    this.corteSesion = sesion;
    this.showCorteModal = true;
    await this.cargarCorte(sesion);
  }

  private async cargarCorte(sesion: SesionCover): Promise<void> {
    const seq = ++this.corteLoadSeq;
    this.loadingCorte = true;
    this.corteResumen = null;
    this.corteVentas = [];
    this.cdr.detectChanges();
    try {
      const data = await this.coversService.obtenerResumenNoche(sesion.id);
      if (seq !== this.corteLoadSeq) return;
      this.ngZone.run(() => {
        this.corteResumen = data.resumen;
        this.corteVentas = [...data.ventas];
        this.loadingCorte = false;
        this.forceViewRefresh();
      });
    } catch (e: unknown) {
      if (seq !== this.corteLoadSeq) return;
      this.ngZone.run(() => {
        this.loadingCorte = false;
        this.forceViewRefresh();
      });
      await this.alertService.error(this.msgError(e, 'No se pudo cargar el corte.'));
      this.showCorteModal = false;
    }
  }

  closeCorteModal(): void {
    this.corteLoadSeq++;
    this.showCorteModal = false;
  }

  async refrescarCorte(): Promise<void> {
    if (!this.corteSesion || this.loadingCorte) return;
    await this.cargarCorte(this.corteSesion);
  }

  private forceViewRefresh(): void {
    this.cdr.detectChanges();
    setTimeout(() => this.cdr.detectChanges(), 0);
  }

  labelMetodoPago(metodo: string | null | undefined): string {
    const m = (metodo ?? '').toLowerCase();
    if (m === 'efectivo') return 'Efectivo';
    if (m === 'transferencia') return 'Transferencia';
    if (m === 'tarjeta') return 'Tarjeta';
    if (m === 'cortesia') return 'Cortesía';
    if (m === 'wompi' || !m) return 'App / Wompi';
    return metodo || 'Otro';
  }

  labelOrigen(origen: string | null | undefined): string {
    return origen === 'manual' ? 'Puerta' : 'App';
  }

  puedeAnularVenta(v: VentaNocheCoverItem): boolean {
    return v.boleta_estado !== 'cancelada' && v.estado_acceso === 'pendiente';
  }

  async anularVenta(v: VentaNocheCoverItem): Promise<void> {
    if (!this.puedeAnularVenta(v)) {
      await this.alertService.warning('No se puede anular', 'El cover ya fue usado o está anulado.');
      return;
    }
    const ok = await this.alertService.confirm(
      `¿Anular cover de ${v.cliente_nombre || v.cliente_email || 'cliente'}?`,
    );
    if (!ok) return;
    this.saving = true;
    try {
      await this.coversService.anularBoletaCover(v.boleta_id, 'Anulado desde corte de caja');
      await this.alertService.success('Cover anulado.');
      if (this.showCorteModal && this.corteSesion) {
        await this.cargarCorte(this.corteSesion);
      }
      await this.loadConfig();
      await this.cargarOpsHoy();
      await this.syncDetalleNocheTrasCarga();
    } catch (e: unknown) {
      await this.alertService.error(this.msgError(e, 'No se pudo anular.'));
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async openPuertaModal(sesion: SesionCover): Promise<void> {
    this.puertaSesion = sesion;
    this.showPuertaModal = true;
    this.loadingPuerta = true;
    this.personasDentro = [];
    this.accesosRecientes = [];
    this.cdr.detectChanges();
    try {
      const [dentro, accesos] = await Promise.all([
        this.coversService.listarDentroSesion(sesion.id),
        this.coversService.listarAccesosSesion(sesion.id, 40),
      ]);
      this.ngZone.run(() => {
        this.personasDentro = dentro;
        this.accesosRecientes = accesos;
        this.loadingPuerta = false;
        this.cdr.detectChanges();
      });
    } catch (e: unknown) {
      this.ngZone.run(() => {
        this.loadingPuerta = false;
        this.cdr.detectChanges();
      });
      await this.alertService.error(this.msgError(e, 'No se pudo cargar el tablero de puerta.'));
      this.showPuertaModal = false;
    }
  }

  closePuertaModal(): void {
    this.showPuertaModal = false;
  }

  async refrescarPuerta(): Promise<void> {
    if (!this.puertaSesion) return;
    await this.openPuertaModal(this.puertaSesion);
  }

  formatHoraCorta(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  metodosPuertaEntries(): Array<{ metodo: string; total: number }> {
    const map = this.corteResumen?.puerta_por_metodo ?? {};
    return Object.entries(map)
      .filter(([metodo]) => metodo.toLowerCase() !== 'cortesia')
      .map(([metodo, total]) => ({
        metodo,
        total: Number(total) || 0,
      }));
  }

  async confirmarVentaManual(): Promise<void> {
    if (!this.ventaForm.sesion_id || !this.ventaForm.cliente_id) {
      await this.alertService.warning('Selecciona la noche y un usuario registrado.');
      return;
    }
    const cantidad = Math.max(1, Math.floor(Number(this.ventaForm.cantidad) || 0));
    if (cantidad < 1 || cantidad > 20) {
      await this.alertService.warning('La cantidad debe estar entre 1 y 20.');
      return;
    }
    const cliente = this.ventaClienteSeleccionado;
    const ok = await this.alertService.confirm(
      `¿Asignar ${cantidad} cover(s) a ${cliente ? this.labelUsuarioVenta(cliente) : 'este usuario'}?`,
    );
    if (!ok) return;

    this.saving = true;
    try {
      const res = await this.coversService.venderCoverManual({
        sesionCoverId: this.ventaForm.sesion_id,
        clienteId: this.ventaForm.cliente_id,
        cantidad,
        metodoPago: this.ventaForm.metodo_pago,
        notas: this.ventaForm.notas.trim() || null,
      });
      await this.alertService.success(
        `Listo: ${res.cantidad} cover(s) · ${this.formatCurrency(res.total)} · ${res.numero_transaccion}`,
      );
      this.closeVentaModal();
      await this.loadConfig();
      await this.cargarOpsHoy();
      await this.syncDetalleNocheTrasCarga();
    } catch (e: unknown) {
      await this.alertService.error(this.msgError(e, 'No se pudo registrar la venta.'));
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  openWizard(): void {
    if (!this.esAdministrador) {
      void this.alertService.warning(
        'Sin permiso',
        'Solo un administrador puede usar el asistente para crear covers.',
      );
      return;
    }
    if (!this.lugarForm.covers_organizador_id) {
      void this.alertService.warning(
        'Responsable requerido',
        'Asigna y guarda un organizador responsable en Club antes de continuar.',
      );
      this.setVista('config');
      return;
    }
    this.wizardForm.covers_descripcion = this.lugarForm.covers_descripcion;
    this.wizardForm.aforo_maximo = this.config?.lugar.capacidad_maxima ?? null;
    this.wizardForm.cantidad_maxima_venta = this.config?.lugar.capacidad_maxima ?? null;
    if (this.wizardForm.wompi_cuenta_id == null) {
      this.wizardForm.wompi_cuenta_id = this.defaultWompiCuentaId();
    }
    this.syncWizardPrecioInput();
    this.showWizardModal = true;
  }

  closeWizard(): void {
    this.showWizardModal = false;
  }

  async ejecutarWizard(): Promise<void> {
    if (this.wompiCuentas.length > 0 && !this.wizardForm.wompi_cuenta_id) {
      await this.alertService.warning('Selecciona la cuenta Wompi para cobrar.');
      return;
    }
    this.saving = true;
    try {
      this.config = await this.coversService.inicializarCoverLugar({
        lugarId: this.lugarId,
        nombreTipo: this.wizardForm.nombre_tipo.trim(),
        precioCop: Number(this.wizardForm.precio_cop),
        diaSemana: this.wizardForm.dia_semana,
        horaApertura: this.wizardForm.hora_apertura,
        horaCierre: this.wizardForm.hora_cierre,
        coversDescripcion: this.wizardForm.covers_descripcion.trim() || null,
        aforoMaximo: this.wizardForm.aforo_maximo,
        cantidadMaximaVenta: this.wizardForm.cantidad_maxima_venta,
        permiteReingreso: this.wizardForm.permite_reingreso,
        wompiCuentaId: this.wizardForm.wompi_cuenta_id,
        generarSesiones: true,
      });
      this.syncLugarFormFromConfig();
      await this.alertService.success('Cover inicializado: tipo, plantilla, checkout y sesiones.');
      this.closeWizard();
    } catch (e: unknown) {
      await this.alertService.error(this.msgError(e, 'No se pudo inicializar el cover.'));
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  plantillasDeTipo(tipoId: number): PlantillaCover[] {
    return (this.config?.plantillas_cover ?? []).filter((p) => p.tipo_cover_id === tipoId);
  }

  private defaultWompiCuentaId(): number | null {
    return this.wompiCuentas.length === 1 ? this.wompiCuentas[0].id : null;
  }

  private msgError(e: unknown, fallback: string): string {
    const err = e as { message?: string; error_description?: string };
    return err?.message || err?.error_description || fallback;
  }
}
