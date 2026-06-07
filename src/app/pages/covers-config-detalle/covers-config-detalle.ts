import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CoversService } from '../../services/covers.service';
import { CategoriasService } from '../../services/categorias.service';
import { WompiCuentasService } from '../../services/wompi-cuentas.service';
import { EventosService } from '../../services/eventos.service';
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
  PlantillaCover,
  SesionCover,
  TipoCover,
} from '../../types/covers';
import { CategoriaEvento, WompiCuenta } from '../../types';

type VistaTab = 'lugar' | 'tipos' | 'plantillas' | 'sesiones';

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
  vista: VistaTab = 'lugar';
  categorias: CategoriaEvento[] = [];
  wompiCuentas: WompiCuenta[] = [];

  readonly diasSemana = COVERS_DIAS_SEMANA;
  readonly estadoLabels = COVERS_ESTADO_SESION_LABEL;
  readonly labelDia = labelDiaSemana;

  lugarForm = {
    covers_habilitado: false,
    covers_descripcion: '',
    covers_porcentaje_servicio: 0,
  };

  showTipoModal = false;
  editingTipo: TipoCover | null = null;
  tipoForm = {
    nombre: '',
    descripcion: '',
    precio_cop: 0,
    permite_reingreso: true,
    limite_por_persona: null as number | null,
    orden: 0,
    activo: true,
    categoria_id: null as number | null,
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
    categoria_id: null as number | null,
    wompi_cuenta_id: null as number | null,
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private coversService: CoversService,
    private categoriasService: CategoriasService,
    private wompiCuentasService: WompiCuentasService,
    private eventosService: EventosService,
    private authService: AuthService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef,
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

    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('lugarId'));
      if (!Number.isFinite(id) || id <= 0) {
        void this.router.navigate(['/covers-config']);
        return;
      }
      this.lugarId = id;
      void this.loadConfig();
    });

    void this.categoriasService.getCategorias({ limit: 100, activo: true }).then((res) => {
      this.categorias = res.data ?? [];
      const defaultCat = this.defaultCategoriaId();
      if (defaultCat != null) {
        this.wizardForm.categoria_id = defaultCat;
      }
      this.cdr.markForCheck();
    });

    void this.loadWompiCuentas();
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
      this.lugarForm = {
        covers_habilitado: !!this.config.lugar.covers_habilitado,
        covers_descripcion: this.config.lugar.covers_descripcion ?? '',
        covers_porcentaje_servicio: Number(this.config.lugar.covers_porcentaje_servicio ?? 0),
      };
    } catch {
      await this.alertService.error('No se pudo cargar la configuración.');
      void this.router.navigate(['/covers-config']);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  setVista(v: VistaTab): void {
    this.vista = v;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value ?? 0);
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
    this.saving = true;
    try {
      await this.coversService.configurarLugar(
        this.lugarId,
        this.lugarForm.covers_habilitado,
        this.lugarForm.covers_descripcion,
        this.lugarForm.covers_porcentaje_servicio,
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
    this.editingTipo = tipo ?? null;
    const categoriaId = this.defaultCategoriaId();
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
        categoria_id: categoriaId,
        wompi_cuenta_id: wompiDefault,
      };
      if (tipo.evento_id) {
        void this.cargarWompiDelEvento(tipo.evento_id);
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
        categoria_id: categoriaId,
        wompi_cuenta_id: wompiDefault,
      };
    }
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
    if (!this.tipoForm.nombre.trim()) {
      await this.alertService.warning('Nombre requerido.');
      return;
    }
    if (this.wompiCuentas.length > 0 && !this.tipoForm.wompi_cuenta_id) {
      await this.alertService.warning('Selecciona la cuenta Wompi que cobrará este cover.');
      return;
    }
    this.saving = true;
    try {
      const saved = await this.coversService.upsertTipoCover({
        id: this.editingTipo?.id,
        lugarId: this.lugarId,
        nombre: this.tipoForm.nombre.trim(),
        descripcion: this.tipoForm.descripcion.trim() || null,
        precioCop: Number(this.tipoForm.precio_cop),
        permiteReingreso: this.tipoForm.permite_reingreso,
        limitePorPersona: this.tipoForm.limite_por_persona,
        orden: this.tipoForm.orden,
        activo: this.tipoForm.activo,
        wompiCuentaId: this.tipoForm.wompi_cuenta_id,
      });
      await this.alertService.success(
        this.editingTipo ? 'Tipo cover actualizado.' : 'Tipo cover creado.',
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
    const ok = await this.alertService.confirm(
      `¿Cambiar sesión del ${this.formatFecha(sesion.fecha)} a «${this.estadoLabels[estado]}»?`,
    );
    if (!ok) return;
    this.saving = true;
    try {
      await this.coversService.cambiarEstadoSesion(sesion.id, estado);
      await this.loadConfig();
    } catch (e: unknown) {
      await this.alertService.error(this.msgError(e, 'No se pudo cambiar el estado.'));
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  openWizard(): void {
    this.wizardForm.covers_descripcion = this.lugarForm.covers_descripcion;
    this.wizardForm.aforo_maximo = this.config?.lugar.capacidad_maxima ?? null;
    this.wizardForm.cantidad_maxima_venta = this.config?.lugar.capacidad_maxima ?? null;
    if (this.wizardForm.wompi_cuenta_id == null) {
      this.wizardForm.wompi_cuenta_id = this.defaultWompiCuentaId();
    }
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
        categoriaId: this.wizardForm.categoria_id,
        wompiCuentaId: this.wizardForm.wompi_cuenta_id,
        generarSesiones: true,
      });
      this.lugarForm = {
        covers_habilitado: !!this.config.lugar.covers_habilitado,
        covers_descripcion: this.config.lugar.covers_descripcion ?? '',
        covers_porcentaje_servicio: Number(this.config.lugar.covers_porcentaje_servicio ?? 0),
      };
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

  private defaultCategoriaId(): number | null {
    return this.categorias[0]?.id ?? null;
  }

  private defaultWompiCuentaId(): number | null {
    return this.wompiCuentas.length === 1 ? this.wompiCuentas[0].id : null;
  }

  private msgError(e: unknown, fallback: string): string {
    const err = e as { message?: string; error_description?: string };
    return err?.message || err?.error_description || fallback;
  }
}
