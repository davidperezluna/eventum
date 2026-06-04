import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EventosService } from '../../services/eventos.service';
import { CategoriasService } from '../../services/categorias.service';
import { LugaresService } from '../../services/lugares.service';
import { UsuariosService } from '../../services/usuarios.service';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/storage.service';
import { ImageOptimizationService } from '../../services/image-optimization.service';
import { TimezoneService } from '../../services/timezone.service';
import { AlertService } from '../../services/alert.service';
import { CuponesService } from '../../services/cupones.service';
import { WompiCuentasService } from '../../services/wompi-cuentas.service';
import { BoletasService } from '../../services/boletas.service';
import { Evento, CategoriaEvento, Lugar, Usuario, PaginatedResponse, TipoEstadoEvento, CuponDescuento, WompiCuenta } from '../../types';
import { TipoBoleta } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-eventos',
  imports: [CommonModule, FormsModule, DateFormatPipe],
  templateUrl: './eventos.html',
  styleUrl: './eventos.css',
})
export class Eventos implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  eventos: Evento[] = [];
  categorias: CategoriaEvento[] = [];
  lugares: Lugar[] = [];
  organizadores: Usuario[] = [];
  wompiCuentas: WompiCuenta[] = [];
  loading = false;
  total = 0;
  page = 1;
  limit = 10;
  searchTerm = '';
  categoriaFiltro: number | null = null;
  estadoFiltro: string | null = null;

  showModal = false;
  editingEvento: Evento | null = null;
  formData: Partial<Evento> = { activo: true, estado: TipoEstadoEvento.BORRADOR };

  // Manejo de tipos de boleta por evento
  showTiposBoletaModal = false;
  showTipoBoletaFormModal = false;
  showInventarioModal = false;
  selectedEventoForTipos: Evento | null = null;
  tiposBoletaEvento: TipoBoleta[] = [];
  loadingTiposBoleta = false;
  editingTipo: TipoBoleta | null = null;
  tipoInventario: TipoBoleta | null = null;
  cantidadAgregarInventario = 1;
  tipoBoletaFormData: Partial<TipoBoleta> = { activo: true };
  selectedMapaPalcoFile: File | null = null;
  previewMapaPalco: string | null = null;
  uploadingMapaPalco = false;
  
  // Manejo de Cupones
  showCuponesModal = false;
  selectedEventoForCupones: Evento | null = null;
  cupones: CuponDescuento[] = [];
  loadingCupones = false;
  nuevoCupon: Partial<CuponDescuento> = {
    codigo: '',
    porcentaje_descuento: 0,
    max_usos: 1,
    activo: true
  };
  
  // Propiedades para manejo de imágenes
  previewUrl: string | null = null;
  selectedFile: File | null = null;
  uploadingImage = false;

  estados: { value: TipoEstadoEvento; label: string }[] = [
    { value: TipoEstadoEvento.BORRADOR, label: 'Borrador' },
    { value: TipoEstadoEvento.PUBLICADO, label: 'Publicado' },
    { value: TipoEstadoEvento.EN_CURSO, label: 'En Curso' },
    { value: TipoEstadoEvento.FINALIZADO, label: 'Finalizado' },
    { value: TipoEstadoEvento.CANCELADO, label: 'Cancelado' }
  ];

  constructor(
    private eventosService: EventosService,
    private categoriasService: CategoriasService,
    private lugaresService: LugaresService,
    private usuariosService: UsuariosService,
    public authService: AuthService,
    private timezoneService: TimezoneService,
    private storageService: StorageService,
    private imageOptimizationService: ImageOptimizationService,
    private cuponesService: CuponesService,
    private wompiCuentasService: WompiCuentasService,
    private boletasService: BoletasService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadCategorias();
    this.loadLugares();
    this.loadOrganizadores();
    this.loadWompiCuentas();
    this.loadEventos();
  }

  async loadCategorias() {
    try {
      const response = await this.categoriasService.getCategorias({ limit: 1000 });
      this.categorias = response.data;
    } catch (err) {
      console.error('Error cargando categorías:', err);
    }
  }

  async loadLugares() {
    try {
      const response = await this.lugaresService.getLugares({ limit: 1000 });
      this.lugares = response.data;
    } catch (err) {
      console.error('Error cargando lugares:', err);
    }
  }

  async loadOrganizadores() {
    console.log('loadOrganizadores llamado');
    try {
      const organizadores = await this.usuariosService.getOrganizadores();
      console.log('Organizadores recibidos en componente:', organizadores);
      console.log('Cantidad de organizadores:', organizadores.length);
      this.organizadores = organizadores || [];
      this.cdr.detectChanges();
      console.log('Organizadores asignados:', this.organizadores.length);
    } catch (err) {
      console.error('Error cargando organizadores:', err);
      this.organizadores = [];
      this.cdr.detectChanges();
      this.cdr.detectChanges();
    }
  }

  async loadWompiCuentas() {
    try {
      this.wompiCuentas = await this.wompiCuentasService.getCuentasActivas();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando cuentas Wompi:', err);
      this.wompiCuentas = [];
      this.cdr.detectChanges();
    }
  }

  loadEventos() {
    console.log('loadEventos llamado');
    this.loading = true;
    
    // Si es organizador, filtrar por su ID
    const filters: any = {
      page: this.page,
      limit: this.limit,
      search: this.searchTerm || undefined,
      categoria_id: this.categoriaFiltro || undefined,
      estado: this.estadoFiltro || undefined
    };
    
    // Si es organizador, agregar filtro de organizador_id
    if (this.authService.isOrganizador()) {
      const organizadorId = this.authService.getUsuarioId();
      if (organizadorId) {
        filters.organizador_id = organizadorId;
      }
    }
    this.cdr.detectChanges();
    
    this.loadEventosInternal(filters);
  }

  private async loadEventosInternal(filters: any) {
    try {
      const response: PaginatedResponse<Evento> = await this.eventosService.getEventos(filters);
      console.log('Response recibida en eventos:', response);
      this.eventos = response.data || [];
      this.total = response.total || 0;
      this.loading = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando eventos:', err);
      this.loading = false;
      this.eventos = [];
      this.total = 0;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  openModal(evento?: Evento) {
    this.editingEvento = evento || null;
    const usuario = this.authService.getUsuario();
    
    // Resetear imagen
    this.previewUrl = null;
    this.selectedFile = null;
    
    // Si es organizador, siempre usar su ID
    if (this.authService.isOrganizador()) {
      const organizadorId = this.authService.getUsuarioId();
      if (organizadorId) {
        this.formData.organizador_id = organizadorId;
      }
    }
    
    if (evento) {
      // Convertir fechas a formato datetime-local
      this.formData = {
        ...evento,
        fecha_inicio: this.formatDateForInput(evento.fecha_inicio),
        fecha_fin: this.formatDateForInput(evento.fecha_fin),
        fecha_venta_inicio: this.formatDateForInput(evento.fecha_venta_inicio),
        fecha_venta_fin: this.formatDateForInput(evento.fecha_venta_fin)
      };
      // Si hay imagen existente, mostrar preview
      if (evento.imagen_principal) {
        this.previewUrl = evento.imagen_principal;
      }
    } else {
      // Nuevo evento - establecer valores por defecto
      this.formData = {
        activo: true,
        estado: TipoEstadoEvento.BORRADOR,
        organizador_id: usuario?.id || (this.organizadores.length > 0 ? this.organizadores[0].id : 0),
        wompi_cuenta_id: null,
        es_gratis: false,
        edad_minima: 0,
        destacado: false,
        porcentaje_servicio: 0
      };
    }
    this.showModal = true;
  }

  formatDateForInput(date: Date | string | undefined): string {
    if (!date) return '';
    // Usar el servicio de timezone para convertir de ISO a datetime-local
    return this.timezoneService.isoToDatetimeLocal(typeof date === 'string' ? date : date.toISOString());
  }

  closeModal() {
    this.showModal = false;
    this.editingEvento = null;
    this.formData = {};
    this.previewUrl = null;
    this.selectedFile = null;
  }
  
  // ========== MÉTODOS PARA MANEJO DE CUPONES ==========

  async openCuponesModal(evento: Evento) {
    this.selectedEventoForCupones = evento;
    this.showCuponesModal = true;
    this.loadCupones(evento.id);
    this.nuevoCupon = {
      evento_id: evento.id,
      codigo: '',
      porcentaje_descuento: 10,
      max_usos: 1,
      activo: true
    };
  }

  async loadCupones(eventoId: number) {
    this.loadingCupones = true;
    try {
      this.cupones = await this.cuponesService.getCuponesByEvento(eventoId);
    } catch (err) {
      console.error('Error cargando cupones:', err);
      this.alertService.error('Error', 'No se pudieron cargar los cupones');
    } finally {
      this.loadingCupones = false;
      this.cdr.detectChanges();
    }
  }

  async crearCupon() {
    if (!this.nuevoCupon.codigo || !this.nuevoCupon.porcentaje_descuento) {
      this.alertService.warning('Campos incompletos', 'El código y el porcentaje son obligatorios');
      return;
    }

    try {
      this.nuevoCupon.codigo = this.nuevoCupon.codigo.toUpperCase().trim();
      await this.cuponesService.crearCupon(this.nuevoCupon);
      this.alertService.success('Éxito', 'Cupón creado correctamente');
      if (this.selectedEventoForCupones) {
        this.loadCupones(this.selectedEventoForCupones.id);
      }
      this.nuevoCupon = {
        evento_id: this.selectedEventoForCupones?.id,
        codigo: '',
        porcentaje_descuento: 10,
        max_usos: 1,
        activo: true
      };
    } catch (err: any) {
      console.error('Error creando cupón:', err);
      this.alertService.error('Error', 'No se pudo crear el cupón: ' + (err.message || 'Error desconocido'));
    }
  }

  async toggleCuponActivo(cupon: CuponDescuento) {
    try {
      await this.cuponesService.actualizarCupon(cupon.id, { activo: !cupon.activo });
      if (this.selectedEventoForCupones) {
        this.loadCupones(this.selectedEventoForCupones.id);
      }
    } catch (err) {
      console.error('Error actualizando cupón:', err);
      this.alertService.error('Error', 'No se pudo actualizar el cupón');
    }
  }

  async eliminarCupon(cupon: CuponDescuento) {
    if (!confirm(`¿Estás seguro de eliminar el cupón ${cupon.codigo}?`)) return;

    try {
      await this.cuponesService.eliminarCupon(cupon.id);
      this.alertService.success('Éxito', 'Cupón eliminado');
      if (this.selectedEventoForCupones) {
        this.loadCupones(this.selectedEventoForCupones.id);
      }
    } catch (err) {
      console.error('Error eliminando cupón:', err);
      this.alertService.error('Error', 'No se pudo eliminar el cupón');
    }
  }

  closeCuponesModal() {
    this.showCuponesModal = false;
    this.selectedEventoForCupones = null;
    this.cupones = [];
  }

  async openTiposBoletaModal(evento: Evento) {
    this.selectedEventoForTipos = evento;
    this.showTiposBoletaModal = true;
    await this.loadTiposBoleta(evento.id);
  }

  closeTiposBoletaModal() {
    this.showTiposBoletaModal = false;
    this.selectedEventoForTipos = null;
    this.tiposBoletaEvento = [];
  }

  async loadTiposBoleta(eventoId: number) {
    this.loadingTiposBoleta = true;
    try {
      this.tiposBoletaEvento = await this.boletasService.getTiposBoleta(eventoId);
    } catch (err) {
      console.error('Error cargando tipos de boleta:', err);
      this.alertService.error('Error', 'No se pudieron cargar los tipos de boleta');
      this.tiposBoletaEvento = [];
    } finally {
      this.loadingTiposBoleta = false;
      this.cdr.detectChanges();
    }
  }

  openTipoBoletaFormModal() {
    if (!this.selectedEventoForTipos) return;
    this.editingTipo = null;
    this.selectedMapaPalcoFile = null;
    this.previewMapaPalco = null;
    this.tipoBoletaFormData = {
      evento_id: this.selectedEventoForTipos.id,
      activo: true,
      cantidad_vendidas: 0,
      personas_por_unidad: 1,
      es_palco: false,
    };
    this.showTipoBoletaFormModal = true;
  }

  async openEditTipoBoletaFormModal(tipo: TipoBoleta) {
    if (!this.selectedEventoForTipos) return;
    let fresh = tipo;
    try {
      fresh = await this.boletasService.getTipoBoletaById(tipo.id);
    } catch (err) {
      console.error('No se pudo cargar el tipo de boleta:', err);
    }
    this.editingTipo = fresh;
    this.selectedMapaPalcoFile = null;
    this.previewMapaPalco = fresh.imagen_mapa_palcos || null;
    this.tipoBoletaFormData = {
      evento_id: this.selectedEventoForTipos.id,
      nombre: fresh.nombre,
      descripcion: fresh.descripcion,
      precio: fresh.precio,
      fecha_venta_inicio: fresh.fecha_venta_inicio ? this.formatDateForInput(fresh.fecha_venta_inicio) : undefined,
      fecha_venta_fin: fresh.fecha_venta_fin ? this.formatDateForInput(fresh.fecha_venta_fin) : undefined,
      limite_por_persona: fresh.limite_por_persona,
      activo: fresh.activo,
      personas_por_unidad: fresh.personas_por_unidad ?? 1,
      es_palco: fresh.es_palco ?? false,
      imagen_mapa_palcos: fresh.imagen_mapa_palcos,
    };
    this.showTipoBoletaFormModal = true;
    this.cdr.detectChanges();
  }

  closeTipoBoletaFormModal() {
    this.showTipoBoletaFormModal = false;
    this.editingTipo = null;
    this.tipoBoletaFormData = { activo: true };
    this.selectedMapaPalcoFile = null;
    this.previewMapaPalco = null;
  }

  calcularCantidadesTipoBoleta() {
    if (!this.editingTipo && this.tipoBoletaFormData.cantidad_total) {
      this.tipoBoletaFormData.cantidad_disponibles = this.tipoBoletaFormData.cantidad_total;
      this.tipoBoletaFormData.cantidad_vendidas = 0;
    }
  }

  mostrarCampoMapaPalcos(): boolean {
    const pp = Number(this.tipoBoletaFormData.personas_por_unidad ?? 1);
    return pp > 1 || !!this.tipoBoletaFormData.es_palco;
  }

  clickMapaPalcoInput() {
    const input = document.getElementById('mapaPalcoInputEventos') as HTMLInputElement | null;
    input?.click();
  }

  onMapaPalcoFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      this.alertService.warning('Archivo grande', 'Máximo 10 MB.');
      return;
    }
    this.selectedMapaPalcoFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      this.previewMapaPalco = reader.result as string;
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

  quitarImagenMapaPalco() {
    this.selectedMapaPalcoFile = null;
    this.previewMapaPalco = null;
    this.tipoBoletaFormData.imagen_mapa_palcos = undefined;
    const input = document.getElementById('mapaPalcoInputEventos') as HTMLInputElement | null;
    if (input) input.value = '';
    this.cdr.detectChanges();
  }

  async subirImagenMapaPalcos(): Promise<string | null> {
    if (!this.selectedMapaPalcoFile) return null;
    const usuario = this.authService.getUsuario();
    if (!usuario) {
      this.alertService.warning('Sesión', 'Debes iniciar sesión para subir el mapa.');
      return null;
    }
    this.uploadingMapaPalco = true;
    try {
      const fileName = `palcos/${usuario.id}/mapa_${Date.now()}.jpg`;
      const { error } = await this.storageService.uploadOptimizedImage('imagenes', fileName, this.selectedMapaPalcoFile);
      if (error) throw error;
      return this.storageService.getPublicUrl('imagenes', fileName);
    } catch (e: any) {
      console.error(e);
      this.alertService.error('Error', e?.message || 'No se pudo subir la imagen');
      return null;
    } finally {
      this.uploadingMapaPalco = false;
      this.cdr.detectChanges();
    }
  }

  private buildTipoBoletaUpdatePayload(): Partial<TipoBoleta> {
    const pp = Number(this.tipoBoletaFormData.personas_por_unidad ?? 1);
    const payload: Partial<TipoBoleta> = {
      evento_id: this.selectedEventoForTipos?.id,
      nombre: this.tipoBoletaFormData.nombre?.trim(),
      descripcion: this.tipoBoletaFormData.descripcion,
      precio: this.tipoBoletaFormData.precio,
      limite_por_persona: this.tipoBoletaFormData.limite_por_persona,
      activo: this.tipoBoletaFormData.activo,
      personas_por_unidad: Math.max(1, Math.floor(pp)),
      es_palco: !!this.tipoBoletaFormData.es_palco,
      fecha_venta_inicio: this.tipoBoletaFormData.fecha_venta_inicio
        ? this.timezoneService.datetimeLocalToISO(this.tipoBoletaFormData.fecha_venta_inicio as string)
        : undefined,
      fecha_venta_fin: this.tipoBoletaFormData.fecha_venta_fin
        ? this.timezoneService.datetimeLocalToISO(this.tipoBoletaFormData.fecha_venta_fin as string)
        : undefined,
    };
    if (!payload.descripcion) delete payload.descripcion;
    if (!payload.limite_por_persona) delete payload.limite_por_persona;
    if (!payload.fecha_venta_inicio) delete payload.fecha_venta_inicio;
    if (!payload.fecha_venta_fin) delete payload.fecha_venta_fin;
    return payload;
  }

  async saveTipoBoleta() {
    if (!this.selectedEventoForTipos) {
      this.alertService.warning('Evento requerido', 'Selecciona un evento para continuar');
      return;
    }
    if (!this.tipoBoletaFormData.nombre || !this.tipoBoletaFormData.nombre.trim()) {
      this.alertService.warning('Campo requerido', 'El nombre es requerido');
      return;
    }
    if (!this.tipoBoletaFormData.precio || this.tipoBoletaFormData.precio < 0) {
      this.alertService.warning('Valor inválido', 'El precio debe ser mayor o igual a 0');
      return;
    }
    if (!this.editingTipo && (!this.tipoBoletaFormData.cantidad_total || this.tipoBoletaFormData.cantidad_total <= 0)) {
      this.alertService.warning('Valor inválido', 'La cantidad total debe ser mayor a 0');
      return;
    }
    const pp = Number(this.tipoBoletaFormData.personas_por_unidad ?? 1);
    if (!Number.isFinite(pp) || pp < 1) {
      this.alertService.warning('Valor inválido', 'Personas por palco/unidad debe ser al menos 1');
      return;
    }

    let tipoData: Partial<TipoBoleta>;
    if (this.editingTipo) {
      tipoData = this.buildTipoBoletaUpdatePayload();
    } else {
      this.calcularCantidadesTipoBoleta();
      tipoData = {
        ...this.tipoBoletaFormData,
        evento_id: this.selectedEventoForTipos.id,
        personas_por_unidad: Math.max(1, Math.floor(pp)),
        es_palco: !!this.tipoBoletaFormData.es_palco,
        cantidad_vendidas: 0,
        cantidad_disponibles: this.tipoBoletaFormData.cantidad_total,
        fecha_venta_inicio: this.tipoBoletaFormData.fecha_venta_inicio
          ? this.timezoneService.datetimeLocalToISO(this.tipoBoletaFormData.fecha_venta_inicio as string)
          : undefined,
        fecha_venta_fin: this.tipoBoletaFormData.fecha_venta_fin
          ? this.timezoneService.datetimeLocalToISO(this.tipoBoletaFormData.fecha_venta_fin as string)
          : undefined,
      };
      if (!tipoData.descripcion) delete tipoData.descripcion;
      if (!tipoData.limite_por_persona) delete tipoData.limite_por_persona;
      if (!tipoData.fecha_venta_inicio) delete tipoData.fecha_venta_inicio;
      if (!tipoData.fecha_venta_fin) delete tipoData.fecha_venta_fin;
    }

    if (this.mostrarCampoMapaPalcos()) {
      if (this.selectedMapaPalcoFile) {
        const urlMapa = await this.subirImagenMapaPalcos();
        if (!urlMapa) return;
        tipoData.imagen_mapa_palcos = urlMapa;
      }
    } else if (this.editingTipo) {
      tipoData.imagen_mapa_palcos = undefined;
    } else {
      delete tipoData.imagen_mapa_palcos;
    }

    try {
      if (this.editingTipo) {
        await this.boletasService.updateTipoBoleta(this.editingTipo.id, tipoData);
      } else {
        await this.boletasService.createTipoBoleta(tipoData);
      }
      this.closeTipoBoletaFormModal();
      await this.loadTiposBoleta(this.selectedEventoForTipos.id);
    } catch (err: any) {
      console.error('Error guardando tipo de boleta:', err);
      this.alertService.error('Error', err?.message || 'No se pudo guardar el tipo de boleta');
    }
  }

  async deleteTipoBoleta(tipo: TipoBoleta) {
    const confirmed = await this.alertService.confirm(
      'Desactivar tipo de boleta',
      `¿Estás seguro de desactivar el tipo de boleta "${tipo.nombre}"?`
    );
    if (!confirmed || !this.selectedEventoForTipos) return;
    try {
      await this.boletasService.updateTipoBoleta(tipo.id, { activo: false });
      await this.loadTiposBoleta(this.selectedEventoForTipos.id);
    } catch (err: any) {
      console.error('Error desactivando tipo de boleta:', err);
      this.alertService.error('Error', err?.message || 'No se pudo desactivar el tipo de boleta');
    }
  }

  async openModalAgregarInventario(tipo: TipoBoleta) {
    try {
      this.tipoInventario = await this.boletasService.getTipoBoletaById(tipo.id);
    } catch (err) {
      console.error('No se pudo cargar inventario del tipo:', err);
      this.tipoInventario = tipo;
    }
    this.cantidadAgregarInventario = 1;
    this.showInventarioModal = true;
    this.cdr.detectChanges();
  }

  closeInventarioModal() {
    this.showInventarioModal = false;
    this.tipoInventario = null;
    this.cantidadAgregarInventario = 1;
  }

  async saveAgregarInventario() {
    if (!this.tipoInventario || !this.selectedEventoForTipos) return;
    const cantidad = Math.floor(Number(this.cantidadAgregarInventario));
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      this.alertService.warning('Valor inválido', 'Indica cuántas unidades quieres agregar al inventario');
      return;
    }
    try {
      await this.boletasService.agregarInventarioTipoBoleta(this.tipoInventario.id, cantidad);
      this.closeInventarioModal();
      await this.loadTiposBoleta(this.selectedEventoForTipos.id);
      this.alertService.success('Inventario actualizado', `Se agregaron ${cantidad} unidad(es) al inventario.`);
    } catch (err: any) {
      console.error('Error agregando inventario:', err);
      this.alertService.error('Error', err?.message || 'No se pudo agregar inventario');
    }
  }

  // ========== MÉTODOS PARA MANEJO DE IMÁGENES ==========
  
  selectImage() {
    const input = document.getElementById('eventoImageInput') as HTMLInputElement;
    if (input) {
      input.click();
    }
  }
  
  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      try {
        // Validar tamaño (máximo 10MB)
        if (!this.imageOptimizationService.validateFileSize(file, 10)) {
          this.alertService.warning('Imagen demasiado grande', 'La imagen es demasiado grande. Máximo 10MB.');
          return;
        }
        
        this.selectedFile = file;
        
        // Crear preview optimizado
        this.previewUrl = await this.imageOptimizationService.createPreview(file, 400);
        this.cdr.detectChanges();
      } catch (error) {
        console.error('Error al procesar la imagen:', error);
        this.alertService.error('Error al procesar imagen', 'Error al procesar la imagen. Intenta con otro archivo.');
      }
    }
  }
  
  removeImage() {
    this.previewUrl = null;
    this.selectedFile = null;
    this.formData.imagen_principal = undefined;
    
    // Limpiar el input
    const input = document.getElementById('eventoImageInput') as HTMLInputElement;
    if (input) {
      input.value = '';
    }
    this.cdr.detectChanges();
  }
  
  async uploadImage(): Promise<string | null> {
    if (!this.selectedFile) return null;
    
    try {
      this.uploadingImage = true;
      this.cdr.detectChanges();
      
      const usuario = this.authService.getUsuario();
      if (!usuario) {
        throw new Error('No hay usuario autenticado');
      }
      
      // Crear nombre único para el archivo
      const timestamp = Date.now();
      const fileName = `eventos/${usuario.id}/evento_${timestamp}.jpg`;
      
      const { data, error, originalSize, optimizedSize } = await this.storageService.uploadOptimizedImage('imagenes', fileName, this.selectedFile);
      
      if (error) {
        console.error('❌ Error subiendo imagen:', error);
        this.alertService.error('Error al subir imagen', 'Error al subir la imagen: ' + (error.message || 'Error desconocido'));
        return null;
      }
      
      // Obtener URL pública
      const publicUrl = this.storageService.getPublicUrl('imagenes', fileName);
      
      console.log(`✅ Imagen subida: ${this.formatFileSize(originalSize)} → ${this.formatFileSize(optimizedSize)}`);
      
      return publicUrl;
    } catch (error: any) {
      console.error('❌ Error inesperado subiendo imagen:', error);
      this.alertService.error('Error inesperado', 'Error inesperado al subir la imagen: ' + (error.message || 'Error desconocido'));
      return null;
    } finally {
      this.uploadingImage = false;
      this.cdr.detectChanges();
    }
  }
  
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async saveEvento() {
    // Validaciones básicas
    if (!this.formData.titulo || !this.formData.titulo.trim()) {
      this.alertService.warning('Campo requerido', 'El título es requerido');
      return;
    }
    if (!this.formData.categoria_id) {
      this.alertService.warning('Campo requerido', 'La categoría es requerida');
      return;
    }
    // Si es organizador, asegurar que se use su ID
    if (this.authService.isOrganizador()) {
      const organizadorId = this.authService.getUsuarioId();
      if (organizadorId) {
        this.formData.organizador_id = organizadorId;
      } else {
        this.alertService.error('Error', 'No se pudo identificar el organizador');
        return;
      }
    } else if (!this.formData.organizador_id) {
      this.alertService.warning('Campo requerido', 'El organizador es requerido');
      return;
    }
    if (!this.formData.fecha_inicio || !this.formData.fecha_fin) {
      this.alertService.warning('Campo requerido', 'Las fechas de inicio y fin son requeridas');
      return;
    }
    if (!this.formData.fecha_venta_inicio || !this.formData.fecha_venta_fin) {
      this.alertService.warning('Campo requerido', 'Las fechas de venta son requeridas');
      return;
    }
    const porcentajeServicio = Number(this.formData.porcentaje_servicio ?? 0);
    if (!Number.isFinite(porcentajeServicio) || porcentajeServicio < 0 || porcentajeServicio > 100) {
      this.alertService.warning('Porcentaje inválido', 'El porcentaje de servicio debe estar entre 0 y 100');
      return;
    }

    // Subir imagen primero si hay una seleccionada
    let imagenUrl = this.formData.imagen_principal; // Mantener imagen actual por defecto
    if (this.selectedFile) {
      imagenUrl = await this.uploadImage() || imagenUrl;
      if (!imagenUrl && this.selectedFile) {
        this.alertService.error('Error al subir imagen', 'Error al subir la imagen. Intenta de nuevo.');
        return;
      }
    }

    // Preparar datos para envío
    const eventoData: Partial<Evento> = {
      ...this.formData,
      // Convertir fechas de datetime-local a ISO usando el servicio de timezone
      fecha_inicio: this.timezoneService.datetimeLocalToISO(this.formData.fecha_inicio as string),
      fecha_fin: this.timezoneService.datetimeLocalToISO(this.formData.fecha_fin as string),
      fecha_venta_inicio: this.timezoneService.datetimeLocalToISO(this.formData.fecha_venta_inicio as string),
      fecha_venta_fin: this.timezoneService.datetimeLocalToISO(this.formData.fecha_venta_fin as string),
      // Asegurar que organizador_id esté presente
      organizador_id: this.formData.organizador_id || 0,
      // Agregar URL de imagen
      imagen_principal: imagenUrl || undefined,
      porcentaje_servicio: porcentajeServicio,
      wompi_cuenta_id: this.formData.wompi_cuenta_id ?? null
    };

    // Limpiar campos vacíos opcionales y propiedades de relación que no existen en la BD
    if (!eventoData.descripcion) delete eventoData.descripcion;
    if (!eventoData.descripcion_corta) delete eventoData.descripcion_corta;
    if (!eventoData.imagen_principal) delete eventoData.imagen_principal;
    if (!eventoData.tags) delete eventoData.tags;
    if (!eventoData.terminos_condiciones) delete eventoData.terminos_condiciones;
    if (!eventoData.politica_reembolso) delete eventoData.politica_reembolso;
    if (!eventoData.url_video) delete eventoData.url_video;
    
    // Eliminar objetos de relación que vienen del join y confunden a la base de datos
    delete (eventoData as any).lugar;
    delete (eventoData as any).id;
    delete (eventoData as any).fecha_creacion;
    delete (eventoData as any).fecha_actualizacion;

    if (this.editingEvento) {
      this.saveEventoInternal(this.editingEvento.id, eventoData, true);
    } else {
      this.saveEventoInternal(null, eventoData, false);
    }
  }

  private async saveEventoInternal(id: number | null, eventoData: Partial<Evento>, isUpdate: boolean) {
    try {
      if (isUpdate && id) {
        await this.eventosService.updateEvento(id, eventoData);
      } else {
        await this.eventosService.createEvento(eventoData);
      }
      this.closeModal();
      this.loadEventos();
    } catch (err: any) {
      console.error(`Error ${isUpdate ? 'guardando' : 'creando'} evento:`, err);
      this.alertService.error(`Error al ${isUpdate ? 'guardar' : 'crear'}`, `Error al ${isUpdate ? 'guardar' : 'crear'} evento: ` + (err.message || 'Error desconocido'));
    }
  }

  async toggleDestacado(evento: Evento) {
    try {
      await this.eventosService.updateEvento(evento.id, { destacado: !evento.destacado });
      this.loadEventos();
    } catch (err) {
      console.error('Error actualizando evento:', err);
      this.alertService.error('Error', 'Error al actualizar evento');
    }
  }

  async toggleActivo(evento: Evento) {
    try {
      await this.eventosService.updateEvento(evento.id, { activo: !evento.activo });
      this.loadEventos();
    } catch (err) {
      console.error('Error actualizando evento:', err);
      this.alertService.error('Error', 'Error al actualizar evento');
    }
  }

  getEstadoLabel(estado?: string): string {
    const estadoObj = this.estados.find(e => e.value === estado);
    return estadoObj?.label || estado || 'Sin estado';
  }

  Math = Math;
}
