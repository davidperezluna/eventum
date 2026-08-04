import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UsuariosService } from '../../services/usuarios.service';
import { StorageService } from '../../services/storage.service';
import { ImageOptimizationService } from '../../services/image-optimization.service';
import { AlertService } from '../../services/alert.service';
import { PerfilStateService } from '../../services/perfil-state.service';
import { Usuario, TipoGenero } from '../../types';
import { validarDocumentoIdentidadColombia } from '../../core/documento-identidad';
import { validarTelefonoColombia, normalizarTelefonoColombia } from '../../core/telefono-colombia';
import { formatFechaNacimientoParaInput } from '../../core/fecha-nacimiento';
import { TelefonoColombiaInputComponent } from '../../components/telefono-colombia-input/telefono-colombia-input';

@Component({
  selector: 'app-perfil',
  imports: [CommonModule, FormsModule, TelefonoColombiaInputComponent],
  templateUrl: './perfil.html',
  styleUrl: './perfil.css',
})
export class Perfil implements OnInit, OnDestroy {
  usuario: Usuario | null = null;
  formData: Partial<Usuario> = {};
  loading = false;
  isRefreshing = false;
  loadingDatosCriticos = false;
  saving = false;
  cerrandoSesion = false;
  error: string | null = null;

  /** Escritorio: “Más datos” abierto; móvil: colapsado (menos scroll). */
  masDatosPerfilAbierto = false;

  /** Pendiente rehabilitar desde la UI cuando se necesite. */
  mostrarCambiarContrasena = false;

  intentadoGuardar = false;
  documentoTocado = false;

  // Propiedades para cambio de contraseña
  cambiarPassword = false;
  passwordActual = '';
  passwordNueva = '';
  passwordConfirmar = '';

  // Propiedades para manejo de foto de perfil
  previewUrl: string | null = null;
  selectedFile: File | null = null;
  uploadingImage = false;
  private currentUserId: number | null = null;
  private refreshIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly refreshIndicatorDelayMs = 800;
  private refreshStartedAt: number | null = null;

  generos = [
    { value: TipoGenero.MASCULINO, label: 'Masculino' },
    { value: TipoGenero.FEMENINO, label: 'Femenino' },
    { value: TipoGenero.OTRO, label: 'Otro' },
    { value: TipoGenero.NO_ESPECIFICADO, label: 'No especificado' }
  ];

  constructor(
    private authService: AuthService,
    private usuariosService: UsuariosService,
    private storageService: StorageService,
    private imageOptimizationService: ImageOptimizationService,
    private alertService: AlertService,
    private perfilStateService: PerfilStateService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    try {
      if (typeof globalThis !== 'undefined' && 'matchMedia' in globalThis) {
        this.masDatosPerfilAbierto = (globalThis as unknown as Window).matchMedia('(min-width: 769px)').matches;
      }
    } catch {
      /* ignore */
    }

    // Esperar a que el servicio de auth esté inicializado
    await this.authService.waitForInitialization();
    this.currentUserId = this.authService.getUsuarioId();
    const cachedResult = this.currentUserId ? this.perfilStateService.getState(this.currentUserId) : { state: null, hasSensitiveData: false };
    const cachedState = cachedResult.state;
    if (cachedState) {
      this.applyCachedState(cachedState);
      this.loadingDatosCriticos = !cachedResult.hasSensitiveData;
      this.loading = false;
    } else {
      this.loading = true;
      this.loadingDatosCriticos = true;
    }
    this.loadUsuario({ background: !!cachedState });
  }

  ngOnDestroy(): void {
    this.persistState(Date.now());
    this.endSilentRefreshCycle();
  }

  onMasDatosPerfilToggle(event: Event): void {
    const el = event.target as HTMLDetailsElement | null;
    if (el?.tagName === 'DETAILS') {
      this.masDatosPerfilAbierto = el.open;
    }
  }

  esCliente(): boolean {
    return this.usuario?.tipo_usuario_id === 1;
  }

  marcarDocumentoTocado(): void {
    this.documentoTocado = true;
  }

  errorDocumentoPerfil(): string | null {
    const doc = String(this.formData.documento_identidad ?? '').trim();
    if (!doc) {
      return this.esCliente() ? 'Ingresa tu número de cédula.' : null;
    }
    const validacion = validarDocumentoIdentidadColombia(doc);
    return validacion.valido ? null : (validacion.mensaje ?? 'Documento inválido.');
  }

  mostrarErrorDocumento(): boolean {
    return this.intentadoGuardar || this.documentoTocado;
  }

  get puedeGuardarPerfil(): boolean {
    if (this.saving || this.uploadingImage) {
      return false;
    }
    if (!String(this.formData.nombre ?? '').trim() || !String(this.formData.apellido ?? '').trim()) {
      return false;
    }
    if (!validarTelefonoColombia(String(this.formData.telefono ?? '')).valido) {
      return false;
    }
    return !this.errorDocumentoPerfil();
  }

  loadUsuario(options?: { background?: boolean }) {
    const background = options?.background ?? !!this.usuario;
    const hasVisibleData = !!this.usuario;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (offline && hasVisibleData) {
      console.info('[Perfil] Sin conexión, usando datos cacheados');
      this.loading = false;
      this.loadingDatosCriticos = false;
      this.error = null;
      this.endSilentRefreshCycle();
      this.cdr.detectChanges();
      return;
    }

    this.loading = !background && !hasVisibleData;
    this.error = null;
    if (background) {
      this.startSilentRefreshCycle();
    } else {
      this.endSilentRefreshCycle();
    }
    
    const usuarioId = this.authService.getUsuarioId();
    if (!usuarioId) {
      this.error = 'No se pudo obtener el ID del usuario';
      this.loading = false;
      this.endSilentRefreshCycle();
      return;
    }

    this.currentUserId = usuarioId;
    void this.loadUsuarioData(usuarioId);
  }

  async loadUsuarioData(usuarioId: number) {
    try {
      const usuario = await this.usuariosService.getUsuarioById(usuarioId);
      this.usuario = usuario;
      this.formData = {
        nombre: usuario.nombre || '',
        apellido: usuario.apellido || '',
        telefono: normalizarTelefonoColombia(usuario.telefono || ''),
        fecha_nacimiento: formatFechaNacimientoParaInput(usuario.fecha_nacimiento),
        genero: usuario.genero || TipoGenero.NO_ESPECIFICADO,
        documento_identidad: usuario.documento_identidad || '',
        direccion: usuario.direccion || '',
        ciudad: usuario.ciudad || '',
        pais: usuario.pais || '',
        foto_perfil: usuario.foto_perfil || ''
      };
      this.previewUrl = usuario.foto_perfil || null;
      this.loading = false;
      this.loadingDatosCriticos = false;
      this.persistState(Date.now());
      this.endSilentRefreshCycle();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando usuario:', err);
      this.error = 'Error al cargar la información del usuario';
      this.loading = false;
      this.loadingDatosCriticos = false;
      this.endSilentRefreshCycle();
      this.cdr.detectChanges();
    }
  }

  selectImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event: any) => {
      const file = event.target.files[0];
      if (file) {
        this.onFileSelected(file);
      }
    };
    input.click();
  }

  onFileSelected(file: File) {
    if (!this.imageOptimizationService.validateFileSize(file, 5)) {
      this.alertService.warning('Imagen demasiado grande', 'La imagen es demasiado grande. Máximo 5MB.');
      return;
    }

    this.selectedFile = file;
    this.imageOptimizationService.createPreview(file).then(url => {
      this.previewUrl = url;
      this.cdr.detectChanges();
    });
  }

  removeImage() {
    this.selectedFile = null;
    this.previewUrl = this.usuario?.foto_perfil || null;
    this.cdr.detectChanges();
  }

  async uploadImage(): Promise<string | null> {
    if (!this.selectedFile || !this.usuario) return null;

    this.uploadingImage = true;
    try {
      const timestamp = Date.now();
      const path = `perfiles/${this.usuario.id}/perfil_${timestamp}.jpg`;

      const { data, error } = await this.storageService.uploadOptimizedImage(
        'imagenes',
        path,
        this.selectedFile
      );

      if (error) {
        console.error('Error subiendo imagen:', error);
        throw error;
      }

      const publicUrl = this.storageService.getPublicUrl('imagenes', path);
      return publicUrl;
    } catch (error) {
      console.error('Error en uploadImage:', error);
      throw error;
    } finally {
      this.uploadingImage = false;
    }
  }

  async savePerfil() {
    if (!this.usuario) {
      this.error = 'No se pudo obtener la información del usuario';
      return;
    }

    this.intentadoGuardar = true;
    this.saving = true;
    this.error = null;

    try {
      // Subir foto de perfil si hay una nueva
      let fotoPerfilUrl: string | undefined = this.formData.foto_perfil;
      if (this.selectedFile) {
        const uploadedUrl = await this.uploadImage();
        if (!uploadedUrl) {
          throw new Error('Error al subir la foto de perfil');
        }
        fotoPerfilUrl = uploadedUrl;
      }

      const documentoPerfil = String(this.formData.documento_identidad ?? '').trim();
      const nombrePerfil = String(this.formData.nombre ?? '').trim();
      const apellidoPerfil = String(this.formData.apellido ?? '').trim();

      if (!nombrePerfil || !apellidoPerfil) {
        this.error = 'Nombre y apellido son obligatorios.';
        this.saving = false;
        this.cdr.detectChanges();
        return;
      }

      const errorDocumento = this.errorDocumentoPerfil();
      if (errorDocumento) {
        this.error = errorDocumento;
        this.saving = false;
        this.cdr.detectChanges();
        return;
      }

      if (documentoPerfil) {
        const validacionDocumento = validarDocumentoIdentidadColombia(documentoPerfil);
        this.formData.documento_identidad = validacionDocumento.normalizado;
      }

      const validacionTelefono = validarTelefonoColombia(String(this.formData.telefono ?? ''));
      if (!validacionTelefono.valido) {
        this.error = validacionTelefono.mensaje ?? 'Teléfono inválido.';
        this.saving = false;
        this.cdr.detectChanges();
        return;
      }
      this.formData.telefono = validacionTelefono.normalizado;

      // Preparar datos para actualizar
      const updateData: Partial<Usuario> = {
        nombre: nombrePerfil || undefined,
        apellido: apellidoPerfil || undefined,
        telefono: validacionTelefono.normalizado,
        fecha_nacimiento: this.formData.fecha_nacimiento
          ? String(this.formData.fecha_nacimiento).trim()
          : undefined,
        genero: this.formData.genero,
        documento_identidad: this.formData.documento_identidad || undefined,
        direccion: this.formData.direccion || undefined,
        ciudad: this.formData.ciudad || undefined,
        pais: this.formData.pais || undefined,
        foto_perfil: fotoPerfilUrl || undefined
      };

      // Limpiar campos vacíos
      Object.keys(updateData).forEach(key => {
        if (updateData[key as keyof Usuario] === undefined || updateData[key as keyof Usuario] === '') {
          delete updateData[key as keyof Usuario];
        }
      });

      // Actualizar usuario
      await this.updateUsuarioData(updateData);
    } catch (err: any) {
      console.error('Error preparando datos:', err);
      this.error = 'Error al preparar los datos: ' + (err.message || 'Error desconocido');
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async updateUsuarioData(updateData: Partial<Usuario>) {
    if (!this.usuario) {
      this.error = 'No se pudo obtener la información del usuario';
      this.saving = false;
      this.cdr.detectChanges();
      return;
    }
    
    try {
      const usuarioActualizado = await this.usuariosService.updateUsuario(this.usuario.id, updateData);
      await this.authService.refreshUsuario();
      this.usuario = this.authService.getUsuario() ?? usuarioActualizado;
      this.formData = {
        nombre: this.usuario.nombre || '',
        apellido: this.usuario.apellido || '',
        telefono: normalizarTelefonoColombia(this.usuario.telefono || ''),
        fecha_nacimiento: formatFechaNacimientoParaInput(this.usuario.fecha_nacimiento),
        genero: this.usuario.genero || TipoGenero.NO_ESPECIFICADO,
        documento_identidad: this.usuario.documento_identidad || '',
        direccion: this.usuario.direccion || '',
        ciudad: this.usuario.ciudad || '',
        pais: this.usuario.pais || '',
        foto_perfil: this.usuario.foto_perfil || '',
      };
      this.previewUrl = this.usuario.foto_perfil || null;
      this.selectedFile = null;
      this.saving = false;
      this.persistState(Date.now());
      this.cdr.detectChanges();
      void this.alertService.snackbarSuccess(
        'Perfil actualizado',
        'Tus cambios se guardaron correctamente.'
      );
    } catch (err: any) {
      console.error('Error actualizando perfil:', err);
      this.error = 'Error al actualizar el perfil: ' + (err.message || 'Error desconocido');
      this.saving = false;
      this.cdr.detectChanges();
      void this.alertService.snackbarError('No se pudo guardar', this.error ?? undefined);
    }
  }

  async cambiarContrasena() {
    if (!this.passwordActual || !this.passwordNueva || !this.passwordConfirmar) {
      this.error = 'Todos los campos de contraseña son requeridos';
      return;
    }

    if (this.passwordNueva !== this.passwordConfirmar) {
      this.error = 'Las contraseñas no coinciden';
      return;
    }

    if (this.passwordNueva.length < 6) {
      this.error = 'La contraseña debe tener al menos 6 caracteres';
      return;
    }

    this.saving = true;
    this.error = null;

    try {
      // Actualizar contraseña usando Supabase Auth
      const { error } = await this.authService.updatePassword(this.passwordActual, this.passwordNueva);
      
      if (error) {
        throw error;
      }

      this.cambiarPassword = false;
      this.passwordActual = '';
      this.passwordNueva = '';
      this.passwordConfirmar = '';
      this.saving = false;
      this.cdr.detectChanges();
      void this.alertService.snackbarSuccess(
        'Contraseña actualizada',
        'Tu nueva contraseña ya está activa.'
      );
    } catch (err: any) {
      console.error('Error cambiando contraseña:', err);
      this.error = err.message || 'Error al cambiar la contraseña';
      this.saving = false;
      this.cdr.detectChanges();
      void this.alertService.snackbarError('No se pudo cambiar la contraseña', this.error ?? undefined);
    }
  }

  getNombreCompleto(): string {
    if (!this.usuario) return '';
    const nombre = this.usuario.nombre || '';
    const apellido = this.usuario.apellido || '';
    return `${nombre} ${apellido}`.trim() || this.usuario.email;
  }

  getRolNombre(): string {
    if (!this.usuario) return '';
    switch (this.usuario.tipo_usuario_id) {
      case 3:
        return 'Administrador';
      case 2:
        return 'Organizador';
      case 1:
        return 'Cliente';
      case 4:
        return 'Lector';
      default:
        return 'Usuario';
    }
  }

  /** Hay imagen real (URL remota o vista previa local); si no, se muestra icono de usuario. */
  tieneFotoVisible(): boolean {
    const u = this.previewUrl;
    return typeof u === 'string' && u.trim().length > 0;
  }

  async cerrarSesion(): Promise<void> {
    if (this.cerrandoSesion) return;
    this.cerrandoSesion = true;
    this.cdr.detectChanges();
    try {
      await this.authService.logout();
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
      this.cerrandoSesion = false;
      this.cdr.detectChanges();
    }
  }

  private applyCachedState(state: {
    usuario: Usuario;
    formData: Partial<Usuario>;
    previewUrl: string | null;
    masDatosPerfilAbierto: boolean;
  }): void {
    this.usuario = { ...state.usuario };
    this.formData = { ...state.formData };
    this.previewUrl = state.previewUrl;
    this.masDatosPerfilAbierto = state.masDatosPerfilAbierto;
  }

  private persistState(lastUpdated: number): void {
    if (!this.currentUserId || !this.usuario) return;
    this.perfilStateService.saveState(this.currentUserId, {
      usuario: this.usuario,
      formData: this.formData,
      previewUrl: this.previewUrl,
      masDatosPerfilAbierto: this.masDatosPerfilAbierto,
      lastUpdated
    });
  }

  private startSilentRefreshCycle(): void {
    this.refreshStartedAt = Date.now();
    console.info('[Perfil] Refresco silencioso iniciado', {
      usuarioId: this.currentUserId
    });

    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
    }
    this.isRefreshing = false;
    this.refreshIndicatorTimer = setTimeout(() => {
      this.isRefreshing = true;
      this.cdr.detectChanges();
    }, this.refreshIndicatorDelayMs);
  }

  private endSilentRefreshCycle(): void {
    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
      this.refreshIndicatorTimer = null;
    }

    if (this.refreshStartedAt) {
      console.info('[Perfil] Refresco silencioso finalizado', {
        usuarioId: this.currentUserId,
        durationMs: Date.now() - this.refreshStartedAt,
        tieneFoto: this.tieneFotoVisible()
      });
      this.refreshStartedAt = null;
    }

    this.isRefreshing = false;
  }
}

