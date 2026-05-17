import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UsuariosService } from '../../services/usuarios.service';
import { StorageService } from '../../services/storage.service';
import { ImageOptimizationService } from '../../services/image-optimization.service';
import { TimezoneService } from '../../services/timezone.service';
import { AlertService } from '../../services/alert.service';
import { PerfilStateService } from '../../services/perfil-state.service';
import { Usuario, TipoGenero } from '../../types';

@Component({
  selector: 'app-perfil',
  imports: [CommonModule, FormsModule],
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
  success: string | null = null;

  /** Escritorio: “Más datos” abierto; móvil: colapsado (menos scroll). */
  masDatosPerfilAbierto = false;

  /** Pendiente rehabilitar desde la UI cuando se necesite. */
  mostrarCambiarContrasena = false;

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
    private timezoneService: TimezoneService,
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
        telefono: usuario.telefono || '',
        fecha_nacimiento: usuario.fecha_nacimiento 
          ? this.formatDateForInput(usuario.fecha_nacimiento) 
          : '',
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

  formatDateForInput(date: Date | string | undefined): string {
    if (!date) return '';
    // Para fecha de nacimiento (solo fecha, sin hora), extraer solo la parte de fecha
    const dateStr = typeof date === 'string' ? date : date.toISOString();
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

    this.saving = true;
    this.error = null;
    this.success = null;

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

      // Preparar datos para actualizar
      const updateData: Partial<Usuario> = {
        nombre: this.formData.nombre || undefined,
        apellido: this.formData.apellido || undefined,
        telefono: this.formData.telefono || undefined,
        fecha_nacimiento: this.formData.fecha_nacimiento 
          ? this.timezoneService.datetimeLocalToISO(this.formData.fecha_nacimiento as string + 'T00:00')
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
      // Actualizar el usuario en el auth service
      this.authService.refreshUsuario();
      this.usuario = usuarioActualizado;
      this.formData.foto_perfil = usuarioActualizado.foto_perfil || '';
      this.previewUrl = usuarioActualizado.foto_perfil || null;
      this.selectedFile = null;
      this.success = 'Perfil actualizado correctamente';
      this.saving = false;
      this.persistState(Date.now());
      this.cdr.detectChanges();
      
      // Limpiar mensaje de éxito después de 3 segundos
      setTimeout(() => {
        this.success = null;
        this.cdr.detectChanges();
      }, 3000);
    } catch (err: any) {
      console.error('Error actualizando perfil:', err);
      this.error = 'Error al actualizar el perfil: ' + (err.message || 'Error desconocido');
      this.saving = false;
      this.cdr.detectChanges();
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

      this.success = 'Contraseña actualizada correctamente';
      this.cambiarPassword = false;
      this.passwordActual = '';
      this.passwordNueva = '';
      this.passwordConfirmar = '';
      this.saving = false;
      this.cdr.detectChanges();

      setTimeout(() => {
        this.success = null;
        this.cdr.detectChanges();
      }, 3000);
    } catch (err: any) {
      console.error('Error cambiando contraseña:', err);
      this.error = err.message || 'Error al cambiar la contraseña';
      this.saving = false;
      this.cdr.detectChanges();
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

