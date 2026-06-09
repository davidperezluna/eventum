import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ChangeDetectorRef,
  afterNextRender,
  Injector,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { BoletasService } from '../../services/boletas.service';
import { ComprasProductoService, ItemProductoEscaneo } from '../../services/compras-producto.service';
import { CoversService } from '../../services/covers.service';
import { AlertService } from '../../services/alert.service';
import { AuthService, RolesPermitidos } from '../../services/auth.service';
import {
  LectorPermisosService,
  buildPermisoKey,
  buildPermisoCoverKey,
  PermisoEscaneo,
} from '../../services/lector-permisos.service';
import { BoletaCoverEscaneo } from '../../types/covers';
import { LectorStateService } from '../../services/lector-state.service';
import { SupabaseService } from '../../services/supabase.service';
import { BoletaComprada, TipoEstadoBoleta } from '../../types';
@Component({
  selector: 'app-escanear-qr',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './escanear-qr.html',
  styleUrl: './escanear-qr.css',
})
export class EscanearQr implements OnInit, AfterViewInit, OnDestroy {
  /** scanner = camara QR; manual = busqueda por documento (app movil). */
  modoBusqueda: 'scanner' | 'manual' = 'scanner';
  codigoManual = '';
  documento = '';
  buscando = false;
  validando = false;
  boleta: BoletaComprada | null = null;
  productoItem: ItemProductoEscaneo | null = null;
  boletaCover: BoletaCoverEscaneo | null = null;
  boletasEncontradas: BoletaComprada[] = [];
  modalVisible = false;
  nombreTipoBoleta = '';
  tituloEvento = '';
  errorPermiso: string | null = null;

  modoApp: 'admin' | 'lector' = 'admin';
  volverLink = '/lectores-parametrizacion';

  cameraError: string | null = null;
  scannerActivo = false;
  escaneoPausado = false;

  permisos: PermisoEscaneo[] = [];
  permisoKeys = new Set<string>();
  permisoCoverKeys = new Set<string>();
  permisoEventoProductoIds = new Set<number>();
  esLector = false;
  cargandoPermisos = true;

  private html5Qr?: Html5Qrcode;
  private ultimoCodigo = '';
  private ultimoEscaneoMs = 0;
  private iniciandoCamara = false;
  private viewReady = false;
  private permisosReady = false;
  private cameraDomRetries = 0;
  private readonly maxCameraDomRetries = 8;
  private visibilityHandler = () => {
    void this.onVisibilityChange();
  };
  private focusHandler = () => {
    this.programarReinicioCamara(250);
  };
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

  readonly readerId = 'eventum-qr-reader';

  estados: { value: TipoEstadoBoleta; label: string }[] = [
    { value: TipoEstadoBoleta.PENDIENTE, label: 'Pendiente' },
    { value: TipoEstadoBoleta.USADA, label: 'Usada' },
    { value: TipoEstadoBoleta.CANCELADA, label: 'Cancelada' },
    { value: TipoEstadoBoleta.REEMBOLSADA, label: 'Reembolsada' },
  ];

  constructor(
    private boletasService: BoletasService,
    private comprasProductoService: ComprasProductoService,
    private coversService: CoversService,
    private alertService: AlertService,
    private authService: AuthService,
    private lectorPermisos: LectorPermisosService,
    private lectorStateService: LectorStateService,
    private supabase: SupabaseService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private injector: Injector
  ) {}

  get requierePermisosLector(): boolean {
    return this.modoApp === 'lector' || this.esLector;
  }

  async ngOnInit(): Promise<void> {
    this.modoApp = this.route.snapshot.data['modoApp'] === 'lector' ? 'lector' : 'admin';
    this.volverLink =
      this.modoApp === 'lector' ? '/lector/inicio' : '/lectores-parametrizacion';

    const usuario = this.authService.getUsuario();
    this.esLector = usuario?.tipo_usuario_id === RolesPermitidos.LECTOR;
    const userId = this.authService.getUsuarioId();

    if (this.requierePermisosLector) {
      const cachedPermisos = userId ? this.lectorStateService.getPermisos(userId) : null;
      if (cachedPermisos) {
        this.aplicarPermisos(cachedPermisos);
        this.cargandoPermisos = false;
        this.permisosReady = true;
        this.cdr.detectChanges();
        this.scheduleIniciarCamaraTrasRender();
        void this.cargarPermisosLector({ background: true, userId });
      } else {
        await this.cargarPermisosLector({ background: false, userId });
        this.cargandoPermisos = false;
        this.permisosReady = true;
        this.cdr.detectChanges();
        this.scheduleIniciarCamaraTrasRender();
      }
    } else {
      this.cargandoPermisos = false;
      this.permisosReady = true;
      this.cdr.detectChanges();
      this.scheduleIniciarCamaraTrasRender();
    }
    this.cdr.markForCheck();
    this.registrarEventosCicloVida();
  }

  private aplicarPermisos(permisos: PermisoEscaneo[]): void {
    this.permisos = [...(permisos || [])];
    this.permisoKeys = new Set(
      this.permisos
        .filter((p) => p.scope === 'evento' && p.evento_id != null && p.tipo_boleta_id != null)
        .map((p) => buildPermisoKey(p.evento_id!, p.tipo_boleta_id as number)),
    );
    this.permisoCoverKeys = new Set(
      this.permisos
        .filter((p) => p.scope === 'cover' && p.lugar_id != null && p.tipo_cover_id != null)
        .map((p) => buildPermisoCoverKey(p.lugar_id!, p.tipo_cover_id!)),
    );
    this.permisoEventoProductoIds = new Set(
      this.permisos
        .filter((p) => p.scope === 'evento' && p.categoria === 'producto' && p.evento_id != null)
        .map((p) => p.evento_id as number),
    );
  }

  private async cargarPermisosLector(options: { background: boolean; userId: number | null }): Promise<void> {
    try {
      const permisos = await this.lectorPermisos.fetchMisPermisosEscaneo();
      this.aplicarPermisos(permisos);
      if (options.userId) {
        this.lectorStateService.savePermisos(options.userId, permisos);
      }
    } catch {
      if (!options.background) {
        this.permisos = [];
        this.permisoKeys = new Set<string>();
        this.permisoCoverKeys = new Set<string>();
        this.permisoEventoProductoIds = new Set<number>();
        await this.alertService.error(
          'No se pudieron cargar tus permisos de escaneo.'
        );
      }
    }
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.tryIniciarCamara();
  }

  private tryIniciarCamara(): void {
    if (this.viewReady && this.permisosReady && this.modoBusqueda === 'scanner') {
      void this.iniciarCamara();
    }
  }

  /** Espera a que *ngIf renderice el contenedor #eventum-qr-reader antes de abrir la cámara. */
  private scheduleIniciarCamaraTrasRender(): void {
    afterNextRender(
      () => {
        this.tryIniciarCamara();
      },
      { injector: this.injector }
    );
  }

  ngOnDestroy(): void {
    this.removerEventosCicloVida();
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.limpiarAutoAvance();
    void this.detenerCamara();
  }

  private registrarEventosCicloVida(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.focusHandler);
      window.addEventListener('pageshow', this.focusHandler);
    }
  }

  private removerEventosCicloVida(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.focusHandler);
      window.removeEventListener('pageshow', this.focusHandler);
    }
  }

  private async onVisibilityChange(): Promise<void> {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      // Al bloquear o enviar a segundo plano, liberamos stream para evitar cámara congelada al volver.
      await this.detenerCamara();
      this.cdr.markForCheck();
      return;
    }
    this.programarReinicioCamara(300);
  }

  private programarReinicioCamara(delayMs = 200): void {
    if (this.modoBusqueda !== 'scanner' || this.cargandoPermisos || this.modalVisible) {
      return;
    }
    if (this.requierePermisosLector && this.permisos.length === 0) {
      return;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.forzarReinicioCamara();
    }, Math.max(0, delayMs));
  }

  async forzarReinicioCamara(): Promise<void> {
    if (this.modoBusqueda !== 'scanner' || this.cargandoPermisos || this.iniciandoCamara) {
      return;
    }
    if (this.requierePermisosLector && this.permisos.length === 0) {
      return;
    }
    this.cameraError = null;
    this.escaneoPausado = false;
    this.ultimoCodigo = '';
    this.cameraDomRetries = 0;
    this.cdr.markForCheck();
    await this.detenerCamara();
    await this.iniciarCamara();
  }

  async cambiarModo(modo: 'scanner' | 'manual'): Promise<void> {
    if (this.modoBusqueda === modo) return;
    this.modoBusqueda = modo;
    this.limpiarAutoAvance();
    this.cerrarModal();
    if (modo === 'scanner') {
      this.cameraDomRetries = 0;
      this.cdr.detectChanges();
      this.scheduleIniciarCamaraTrasRender();
    } else {
      await this.detenerCamara();
    }
    this.cdr.markForCheck();
  }

  private async iniciarCamara(): Promise<void> {
    if (this.iniciandoCamara || this.modoBusqueda !== 'scanner') return;
    if (this.cargandoPermisos) return;
    if (this.requierePermisosLector && this.permisos.length === 0) {
      this.cameraError =
        'No tienes eventos ni covers asignados para escanear. Pide al administrador que te asigne permisos.';
      this.cdr.markForCheck();
      return;
    }

    this.iniciandoCamara = true;
    this.cameraError = null;
    this.cdr.markForCheck();

    await this.detenerCamara();

    const el = document.getElementById(this.readerId);
    if (!el) {
      this.iniciandoCamara = false;
      if (
        this.cameraDomRetries < this.maxCameraDomRetries &&
        this.modoBusqueda === 'scanner' &&
        !this.cargandoPermisos
      ) {
        this.cameraDomRetries += 1;
        requestAnimationFrame(() => void this.iniciarCamara());
      }
      return;
    }
    this.cameraDomRetries = 0;

    try {
      this.html5Qr = new Html5Qrcode(this.readerId);
      await this.html5Qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        (decoded) => void this.onCodigoLeido(decoded),
        () => {}
      );
      this.scannerActivo = true;
    } catch (err: unknown) {
      console.error('Error iniciando cámara:', err);
      const msg =
        err instanceof Error ? err.message : 'No se pudo acceder a la cámara';
      if (/NotAllowed|Permission/i.test(msg)) {
        this.cameraError =
          'Permiso de cámara denegado. Actívalo en el navegador o en Ajustes de la PWA e intenta de nuevo.';
      } else if (/NotFound|Devices/i.test(msg)) {
        this.cameraError =
          'No se encontró cámara en este dispositivo. Usa el modo manual o prueba desde el celular.';
      } else {
        this.cameraError = `No se pudo iniciar la cámara: ${msg}`;
      }
    } finally {
      this.iniciandoCamara = false;
      this.cdr.markForCheck();
    }
  }

  private async detenerCamara(): Promise<void> {
    if (!this.html5Qr) return;
    try {
      const state = this.html5Qr.getState();
      if (state === Html5QrcodeScannerState.SCANNING) {
        await this.html5Qr.stop();
      }
      await this.html5Qr.clear();
    } catch {
      /* ignorar al destruir */
    }
    this.html5Qr = undefined;
    this.scannerActivo = false;
  }

  private async pausarCamara(): Promise<void> {
    if (!this.html5Qr || this.escaneoPausado) return;
    try {
      if (this.html5Qr.getState() === Html5QrcodeScannerState.SCANNING) {
        await this.html5Qr.pause(true);
        this.escaneoPausado = true;
      }
    } catch {
      /* noop */
    }
  }

  private async reanudarCamara(): Promise<void> {
    if (!this.html5Qr || !this.escaneoPausado) return;
    try {
      await this.html5Qr.resume();
      this.escaneoPausado = false;
    } catch {
      await this.iniciarCamara();
    }
  }

  private async onCodigoLeido(codigo: string): Promise<void> {
    const ahora = Date.now();
    if (codigo === this.ultimoCodigo && ahora - this.ultimoEscaneoMs < 2500) {
      return;
    }
    if (this.buscando || this.validando) return;

    this.ultimoCodigo = codigo;
    this.ultimoEscaneoMs = ahora;
    await this.pausarCamara();
    await this.procesarCodigo(codigo);
  }

  async buscarPorDocumento(): Promise<void> {
    const doc = this.documento.trim();
    if (!doc) {
      await this.alertService.warning('Campo requerido', 'Ingresa el numero de documento.');
      return;
    }
    if (this.requierePermisosLector && this.permisos.length === 0) {
      await this.alertService.warning('Sin acceso', 'No tienes eventos ni covers asignados para escanear.');
      return;
    }

    this.buscando = true;
    this.boleta = null;
    this.productoItem = null;
    this.boletasEncontradas = [];
    this.modalVisible = false;
    this.cdr.markForCheck();

    try {
      let boletas = await this.boletasService.buscarBoletasPendientesPorDocumento(doc);
      if (this.requierePermisosLector) {
        boletas = await this.lectorPermisos.filtrarBoletasConPermisos(boletas, this.permisoKeys);
      }
      if (boletas.length === 0) {
        await this.alertService.info(
          'Sin entradas',
          'No hay boletas pendientes con ese documento en tus eventos asignados.'
        );
      } else if (boletas.length === 1) {
        await this.mostrarBoletaEnModal(boletas[0]);
      } else {
        this.boletasEncontradas = boletas;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al buscar';
      await this.alertService.error('Error', msg);
    } finally {
      this.buscando = false;
      this.cdr.markForCheck();
    }
  }

  async seleccionarBoletaLista(b: BoletaComprada): Promise<void> {
    await this.mostrarBoletaEnModal(b);
  }

  private async procesarCodigo(codigo: string): Promise<void> {
    if (this.requierePermisosLector && this.permisos.length === 0) {
      await this.alertService.warning(
        'Sin acceso',
        'No tienes eventos ni covers asignados para escanear.'
      );
      return;
    }

    this.buscando = true;
    this.boleta = null;
    this.boletaCover = null;
    this.errorPermiso = null;
    this.cdr.markForCheck();

    try {
      const encontrada = await this.boletasService.buscarBoletaPorCodigoQR(codigo.trim());
      if (encontrada) {
        await this.mostrarBoletaEnModal(encontrada);
        return;
      }

      const producto = await this.comprasProductoService.buscarItemPorCodigoQR(codigo.trim());
      const productoPedido = producto || await this.comprasProductoService.buscarCompraPorCodigoQR(codigo.trim());
      if (productoPedido) {
        await this.mostrarProductoEnModal(productoPedido);
        return;
      }

      const cover = await this.buscarCoverParaEscaneo(codigo.trim());
      if (cover) {
        await this.mostrarCoverEnModal(cover);
        return;
      }

      await this.alertService.info(
        'No encontrado',
        'No hay ninguna boleta, producto o cover con ese código QR.',
      );
      await this.reiniciarEscaneo();
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      await this.alertService.error('Error al buscar', msg);
      await this.reiniciarEscaneo();
    } finally {
      this.buscando = false;
      this.cdr.markForCheck();
    }
  }

  private async mostrarBoletaEnModal(boleta: BoletaComprada): Promise<void> {
    if (this.requierePermisosLector) {
      const ok = await this.verificarPermisoLector(boleta);
      if (!ok) {
        await this.reiniciarEscaneo();
        return;
      }
    }
    const { data: tipoBoleta } = await this.supabase
      .from('tipos_boleta')
      .select('evento_id, nombre, eventos(titulo)')
      .eq('id', boleta.tipo_boleta_id)
      .single();

    const ev = tipoBoleta?.eventos as { titulo?: string } | { titulo?: string }[] | null;
    const eventoTitulo = Array.isArray(ev) ? ev[0]?.titulo : ev?.titulo;

    this.nombreTipoBoleta = (tipoBoleta as { nombre?: string })?.nombre || 'Entrada';
    this.tituloEvento =
      eventoTitulo || boleta.evento?.titulo || `Evento #${tipoBoleta?.evento_id ?? ''}`;
    this.boleta = boleta;
    this.productoItem = null;
    this.boletaCover = null;
    this.modalVisible = true;
    this.programarAutoAvanceModalSiAplica();
    this.cdr.markForCheck();
  }

  private async mostrarProductoEnModal(item: ItemProductoEscaneo): Promise<void> {
    if (this.requierePermisosLector) {
      const eventoId = item.compra?.evento_id;
      if (!eventoId || !this.permisoEventoProductoIds.has(eventoId)) {
        this.errorPermiso = 'Este producto no corresponde a un evento asignado para escanear.';
        await this.alertService.warning('Sin permiso', this.errorPermiso);
        await this.reiniciarEscaneo();
        return;
      }
    }
    this.boleta = null;
    this.productoItem = item;
    this.boletaCover = null;
    this.modalVisible = true;
    this.programarAutoAvanceModalSiAplica();
    this.cdr.markForCheck();
  }

  private async buscarCoverParaEscaneo(codigo: string): Promise<BoletaCoverEscaneo | null> {
    try {
      return await this.coversService.buscarBoletaCoverParaEscaneo(codigo);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/sin permiso/i.test(msg)) {
        this.errorPermiso = 'Este cover no corresponde a un lugar o tipo que tengas asignado.';
        await this.alertService.warning('Sin permiso', this.errorPermiso);
        return null;
      }
      throw err;
    }
  }

  private async mostrarCoverEnModal(cover: BoletaCoverEscaneo): Promise<void> {
    if (this.requierePermisosLector) {
      const key = buildPermisoCoverKey(cover.lugar_id, cover.tipo_cover_id);
      if (!this.permisoCoverKeys.has(key)) {
        this.errorPermiso =
          'Este cover no corresponde a un lugar o tipo que tengas asignado para escanear.';
        await this.alertService.warning('Sin permiso', this.errorPermiso);
        await this.reiniciarEscaneo();
        return;
      }
    }
    this.boleta = null;
    this.productoItem = null;
    this.boletaCover = cover;

    // Flujo rápido: salida sin abrir modal (evita parpadeo y cierre sin interacción).
    if (this.esFlujoRapidoLector() && this.puedeRegistrarSalidaCover(cover)) {
      this.cdr.markForCheck();
      await this.registrarSalidaCover({ silencioso: true });
      return;
    }

    this.modalVisible = true;
    this.programarAutoAvanceModalSiAplica();
    this.cdr.markForCheck();
  }

  cerrarModal(mantenerLista = false): void {
    this.limpiarAutoAvance();
    this.modalVisible = false;
    this.boleta = null;
    this.productoItem = null;
    this.boletaCover = null;
    this.nombreTipoBoleta = '';
    this.tituloEvento = '';
    if (!mantenerLista) {
      this.boletasEncontradas = [];
    }
    this.cdr.markForCheck();

    // Si el usuario cierra la modal manualmente en modo scanner,
    // reactivar lectura para evitar que la cámara quede pausada.
    if (this.modoBusqueda === 'scanner' && this.escaneoPausado) {
      void this.reanudarCamara();
    }
  }

  private async verificarPermisoLector(boleta: BoletaComprada): Promise<boolean> {
    try {
      const { data: tipoBoleta, error } = await this.supabase
        .from('tipos_boleta')
        .select('evento_id')
        .eq('id', boleta.tipo_boleta_id)
        .single();

      if (error || !tipoBoleta) {
        this.errorPermiso = 'No se pudo verificar el evento de esta boleta.';
        return false;
      }

      const key = buildPermisoKey(tipoBoleta.evento_id, boleta.tipo_boleta_id);
      if (!this.permisoKeys.has(key)) {
        this.errorPermiso =
          'Esta boleta no corresponde a un evento o tipo que tengas asignado para escanear.';
        await this.alertService.warning('Sin permiso', this.errorPermiso);
        return false;
      }
      return true;
    } catch {
      this.errorPermiso = 'Error al verificar permisos de escaneo.';
      return false;
    }
  }

  async validarBoleta(): Promise<void> {
    if (!this.boleta) return;

    if (this.boleta.estado === 'usada') {
      await this.alertService.warning('Ya validada', 'Esta boleta ya fue validada.');
      return;
    }
    if (this.boleta.estado === 'cancelada' || this.boleta.estado === 'reembolsada') {
      await this.alertService.warning(
        'No se puede validar',
        'No se puede validar una boleta cancelada o reembolsada.'
      );
      return;
    }

    const estadoPago = this.boleta.estado_pago || this.boleta.compra?.estado_pago;
    if (estadoPago !== 'completado') {
      await this.alertService.warning(
        'Pago pendiente',
        'El pago debe estar completado antes de validar la boleta.'
      );
      return;
    }

    if (!this.esFlujoRapidoLector()) {
      const ok = await this.alertService.confirm(
        'Validar boleta',
        `¿Validar la boleta ${this.boleta.codigo_qr}?`
      );
      if (!ok) return;
    }

    this.validando = true;
    this.cdr.markForCheck();
    try {
      await this.boletasService.validarBoleta(this.boleta.id);
      if (this.esFlujoRapidoLector()) {
        void this.alertService.snackbar('Entrada validada', { timerMs: 1600 });
      } else {
        await this.alertService.success('¡Boleta validada!', 'Entrada validada correctamente.');
      }
      this.cerrarModal();
      await this.reiniciarEscaneo();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      await this.alertService.error('Error al validar', msg);
    } finally {
      this.validando = false;
      this.cdr.markForCheck();
    }
  }

  puedeValidarProducto(item: ItemProductoEscaneo): boolean {
    return (
      (item.estado || '').toLowerCase() !== 'entregado' &&
      (item.compra?.estado_pago || '').toLowerCase() === 'completado'
    );
  }

  async validarProducto(): Promise<void> {
    if (!this.productoItem) return;
    if (!this.puedeValidarProducto(this.productoItem)) {
      await this.alertService.warning('No se puede validar', 'Este producto ya fue redimido o no tiene pago completado.');
      return;
    }

    if (!this.esFlujoRapidoLector()) {
      const ok = await this.alertService.confirm(
        'Validar producto',
        `¿Marcar como entregado el QR ${this.productoItem.codigo_qr}?`
      );
      if (!ok) return;
    }

    this.validando = true;
    this.cdr.markForCheck();
    try {
      if (this.productoItem.scope === 'compra') {
        await this.comprasProductoService.validarCompraProductos(this.productoItem.id);
        if (this.esFlujoRapidoLector()) {
          void this.alertService.snackbar('Pedido redimido', { timerMs: 1600 });
        } else {
          await this.alertService.success('Pedido validado', 'Todos los productos del pedido quedaron marcados como redimidos.');
        }
      } else {
        await this.comprasProductoService.validarItemProducto(this.productoItem.id);
        if (this.esFlujoRapidoLector()) {
          void this.alertService.snackbar('Producto redimido', { timerMs: 1600 });
        } else {
          await this.alertService.success('Producto validado', 'El producto quedó marcado como redimido.');
        }
      }
      this.cerrarModal();
      await this.reiniciarEscaneo();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      await this.alertService.error('Error al validar', msg);
    } finally {
      this.validando = false;
      this.cdr.markForCheck();
    }
  }

  async reiniciarEscaneo(): Promise<void> {
    this.limpiarAutoAvance();
    this.cerrarModal();
    this.errorPermiso = null;
    this.documento = '';
    this.codigoManual = '';
    this.ultimoCodigo = '';
    this.cdr.markForCheck();

    if (this.modoBusqueda === 'scanner') {
      if (this.escaneoPausado) {
        await this.reanudarCamara();
      } else if (!this.scannerActivo) {
        await this.iniciarCamara();
      }
    }
  }


  puedeValidar(boleta: BoletaComprada): boolean {
    const estadoPago = boleta.estado_pago || boleta.compra?.estado_pago;
    return boleta.estado === 'pendiente' && estadoPago === 'completado';
  }

  getEstadoLabel(estado?: string): string {
    const estadoObj = this.estados.find((e) => e.value === estado);
    return estadoObj?.label || estado || 'Sin estado';
  }

  resumenEntregaProducto(item: ItemProductoEscaneo | null | undefined): string[] {
    if (!item) return [];

    const resumen = (item.productos_resumen || [])
      .map((linea) => String(linea || '').trim())
      .filter((linea) => linea.length > 0);
    if (resumen.length > 0) {
      return resumen;
    }

    if (item.producto?.nombre) {
      return [`${item.producto.nombre} x${item.cantidad || 0}`];
    }

    return [];
  }

  nombreValidador(boleta: BoletaComprada | null | undefined): string {
    if (!boleta) return '—';
    const v = boleta.validado_por;
    if (!v) {
      return boleta.validado_por_usuario_id != null
        ? `Usuario #${boleta.validado_por_usuario_id}`
        : '—';
    }
    const nombre = [v.nombre, v.apellido].filter(Boolean).join(' ').trim();
    if (nombre) return nombre;
    if (v.email) return v.email;
    return `Usuario #${v.id}`;
  }

  private esFlujoRapidoLector(): boolean {
    return this.modoBusqueda === 'scanner' && this.requierePermisosLector;
  }

  private limpiarAutoAvance(): void {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  pagoCoverOk(cover: BoletaCoverEscaneo): boolean {
    return (
      String(cover.estado_pago || '').toLowerCase() === 'completado' &&
      String(cover.estado_compra || '').toLowerCase() === 'confirmada'
    );
  }

  puedeRegistrarEntradaCover(cover: BoletaCoverEscaneo): boolean {
    if (!this.pagoCoverOk(cover)) return false;
    const estado = String(cover.estado_acceso || '').toLowerCase();
    if (estado === 'consumida' && !cover.permite_reingreso) return false;
    if (estado === 'dentro') return false;
    const dentro = cover.personas_dentro ?? 0;
    const aforo = cover.aforo_maximo ?? 0;
    return aforo <= 0 || dentro < aforo;
  }

  puedeRegistrarSalidaCover(cover: BoletaCoverEscaneo): boolean {
    return String(cover.estado_acceso || '').toLowerCase() === 'dentro';
  }

  etiquetaEstadoCover(cover: BoletaCoverEscaneo): string {
    const estado = String(cover.estado_acceso || '').toLowerCase();
    if (estado === 'dentro') return 'Dentro del club';
    if (estado === 'fuera' && cover.permite_reingreso) return 'Fuera · puede reingresar';
    if (estado === 'fuera') return 'Salió (sin reingreso)';
    if (estado === 'consumida') return 'Entrada consumida';
    return 'Pendiente de ingreso';
  }

  async registrarEntradaCover(): Promise<void> {
    if (!this.boletaCover) return;
    if (!this.puedeRegistrarEntradaCover(this.boletaCover)) {
      await this.alertService.warning(
        'No se puede registrar entrada',
        this.pagoCoverOk(this.boletaCover)
          ? 'La persona ya está dentro, el aforo está completo o la entrada no permite reingreso.'
          : 'El pago de la compra cover debe estar completado y confirmado.',
      );
      return;
    }

    if (!this.esFlujoRapidoLector()) {
      const ok = await this.alertService.confirm(
        'Registrar entrada',
        `¿Registrar entrada al cover ${this.boletaCover.tipo_cover_nombre}?`,
      );
      if (!ok) return;
    }

    this.validando = true;
    this.cdr.markForCheck();
    try {
      const res = await this.coversService.registrarAccesoCover(
        this.boletaCover.codigo_qr,
        'entrada',
        this.boletaCover.sesion_cover_id,
      );
      this.boletaCover = {
        ...this.boletaCover,
        estado_acceso: res.estado_acceso,
        personas_dentro: res.personas_dentro,
        entradas_count: (this.boletaCover.entradas_count ?? 0) + 1,
      };
      if (this.esFlujoRapidoLector()) {
        void this.alertService.snackbar('Entrada registrada', { timerMs: 1600 });
      } else {
        await this.alertService.success('Entrada registrada', 'Acceso de cover registrado correctamente.');
      }
      this.cerrarModal();
      await this.reiniciarEscaneo();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      await this.alertService.error('Error al registrar entrada', msg);
    } finally {
      this.validando = false;
      this.cdr.markForCheck();
    }
  }

  async registrarSalidaCover(options?: { silencioso?: boolean }): Promise<void> {
    if (!this.boletaCover) return;
    if (!this.puedeRegistrarSalidaCover(this.boletaCover)) {
      await this.alertService.warning('No se puede registrar salida', 'No hay una entrada activa para este QR.');
      if (!options?.silencioso) {
        await this.reiniciarEscaneo();
      }
      return;
    }

    const flujoRapido = this.esFlujoRapidoLector();
    const silencioso = options?.silencioso === true;

    if (!flujoRapido && !silencioso) {
      const ok = await this.alertService.confirm(
        'Registrar salida',
        `¿Registrar salida del cover ${this.boletaCover.tipo_cover_nombre}?`,
      );
      if (!ok) {
        return;
      }
    }

    this.validando = true;
    this.cdr.markForCheck();
    try {
      const res = await this.coversService.registrarAccesoCover(
        this.boletaCover.codigo_qr,
        'salida',
        this.boletaCover.sesion_cover_id,
      );
      this.boletaCover = {
        ...this.boletaCover,
        estado_acceso: res.estado_acceso,
        personas_dentro: res.personas_dentro,
        salidas_count: (this.boletaCover.salidas_count ?? 0) + 1,
      };
      if (flujoRapido || silencioso) {
        void this.alertService.snackbar('Salida registrada', { timerMs: 1600 });
      } else {
        await this.alertService.success('Salida registrada', 'Salida de cover registrada correctamente.');
      }
      if (this.modalVisible) {
        this.cerrarModal();
      } else {
        this.boletaCover = null;
        this.limpiarAutoAvance();
        this.cdr.markForCheck();
      }
      await this.reiniciarEscaneo();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      await this.alertService.error('Error al registrar salida', msg);
      await this.reiniciarEscaneo();
    } finally {
      this.validando = false;
      this.cdr.markForCheck();
    }
  }

  private programarAutoAvanceModalSiAplica(): void {
    this.limpiarAutoAvance();
    if (!this.esFlujoRapidoLector()) return;

    let debeAutoAvanzar = false;
    if (this.boleta) {
      const estado = String(this.boleta.estado || '').toLowerCase();
      debeAutoAvanzar =
        estado === 'usada' ||
        estado === 'cancelada' ||
        estado === 'reembolsada' ||
        (estado === 'pendiente' && !this.puedeValidar(this.boleta));
    } else if (this.productoItem) {
      const estadoProducto = String(this.productoItem.estado || '').toLowerCase();
      debeAutoAvanzar = estadoProducto === 'entregado' || !this.puedeValidarProducto(this.productoItem);
    } else if (this.boletaCover) {
      const estadoCover = String(this.boletaCover.estado_acceso || '').toLowerCase();
      debeAutoAvanzar =
        (estadoCover === 'consumida' && !this.boletaCover.permite_reingreso) ||
        (estadoCover === 'dentro' && !this.puedeRegistrarSalidaCover(this.boletaCover)) ||
        (!this.puedeRegistrarEntradaCover(this.boletaCover) &&
          !this.puedeRegistrarSalidaCover(this.boletaCover));
    }

    if (!debeAutoAvanzar) return;

    this.autoAdvanceTimer = setTimeout(() => {
      this.autoAdvanceTimer = null;
      if (this.validando || !this.modalVisible) return;
      void this.reiniciarEscaneo();
    }, 1400);
  }
}
