import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UsuariosService } from '../../services/usuarios.service';
import { StorageService } from '../../services/storage.service';
import { ImageOptimizationService } from '../../services/image-optimization.service';
import { TimezoneService } from '../../services/timezone.service';
import { AlertService } from '../../services/alert.service';
import { Usuario, TipoGenero } from '../../types';

@Component({
  selector: 'app-perfil',
  imports: [CommonModule, FormsModule],
  templateUrl: './perfil.html',
  styleUrl: './perfil.css',
})
export class Perfil implements OnInit {
  usuario: Usuario | null = null;
  formData: Partial<Usuario> = {};
  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;

  // Propiedades para cambio de contraseña
  cambiarPassword = false;
  passwordActual = '';
  passwordNueva = '';
  passwordConfirmar = '';

  // Propiedades para manejo de foto de perfil
  previewUrl: string | null = null;
  selectedFile: File | null = null;
  uploadingImage = false;

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
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.loading = true;
    // Esperar a que el servicio de auth esté inicializado
    await this.authService.waitForInitialization();
    this.loadUsuario();
  }

  loadUsuario() {
    this.loading = true;
    this.error = null;
    
    const usuarioId = this.authService.getUsuarioId();
    if (!usuarioId) {
      this.error = 'No se pudo obtener el ID del usuario';
      this.loading = false;
      return;
    }

    this.loadUsuarioData(usuarioId);
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
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando usuario:', err);
      this.error = 'Error al cargar la información del usuario';
      this.loading = false;
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
      default:
        return 'Usuario';
    }
  }
}

