import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsuariosService } from '../../services/usuarios.service';
import { Usuario, TipoUsuario, PaginatedResponse } from '../../types';

@Component({
  selector: 'app-usuarios',
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.css',
})
export class Usuarios implements OnInit {
  usuarios: Usuario[] = [];
  tiposUsuario: TipoUsuario[] = [];
  loading = false;
  total = 0;
  page = 1;
  limit = 10;
  searchTerm = '';
  tipoFiltro: number | null = null;
  activoFiltro: boolean | null = null;

  // Modal
  showModal = false;
  editingUsuario: Usuario | null = null;
  formData: Partial<Usuario> = {};
  password = ''; // Campo para password al crear nuevo usuario

  constructor(
    private usuariosService: UsuariosService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadTiposUsuario();
    this.loadUsuarios();
  }

  loadTiposUsuario() {
    this.usuariosService.getTiposUsuario().subscribe({
      next: (tipos) => {
        this.tiposUsuario = tipos;
      },
      error: (err) => console.error('Error cargando tipos:', err)
    });
  }

  loadUsuarios() {
    console.log('loadUsuarios llamado');
    this.loading = true;
    this.cdr.detectChanges(); // Forzar detección de cambios para mostrar loading
    
    this.usuariosService.getUsuarios({
      page: this.page,
      limit: this.limit,
      search: this.searchTerm || undefined,
      tipo_usuario_id: this.tipoFiltro || undefined,
      activo: this.activoFiltro !== null ? this.activoFiltro : undefined
    }).subscribe({
      next: (response: PaginatedResponse<Usuario>) => {
        console.log('Response recibida en componente:', response);
        console.log('Datos recibidos:', response.data);
        this.usuarios = response.data || [];
        this.total = response.total || 0;
        this.loading = false;
        console.log('Usuarios asignados:', this.usuarios);
        console.log('Loading desactivado');
        this.cdr.detectChanges(); // Forzar detección de cambios
      },
      error: (err) => {
        console.error('Error cargando usuarios:', err);
        this.loading = false;
        this.usuarios = [];
        this.total = 0;
        this.cdr.detectChanges(); // Forzar detección de cambios
      },
      complete: () => {
        console.log('Observable completado en componente');
        this.cdr.detectChanges(); // Forzar detección de cambios
      }
    });
  }

  openModal(usuario?: Usuario) {
    this.editingUsuario = usuario || null;
    this.formData = usuario ? { ...usuario } : {};
    this.password = ''; // Resetear password al abrir modal
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.editingUsuario = null;
    this.formData = {};
    this.password = '';
  }

  saveUsuario() {
    // Validaciones
    if (!this.formData.email) {
      alert('El email es requerido');
      return;
    }

    if (!this.formData.tipo_usuario_id) {
      alert('El tipo de usuario es requerido');
      return;
    }

    if (!this.formData.id) {
      // Crear nuevo usuario
      if (!this.password || this.password.length < 6) {
        alert('La contraseña es requerida y debe tener al menos 6 caracteres');
        return;
      }

      console.log('Creando nuevo usuario:', this.formData.email);
      
      this.usuariosService.createUsuario({
        email: this.formData.email,
        password: this.password,
        nombre: this.formData.nombre,
        apellido: this.formData.apellido,
        tipo_usuario_id: this.formData.tipo_usuario_id,
        telefono: this.formData.telefono,
        activo: this.formData.activo !== undefined ? this.formData.activo : true
      }).subscribe({
        next: (usuario) => {
          console.log('Usuario creado exitosamente:', usuario);
          alert('Usuario creado exitosamente');
          this.closeModal();
          this.loadUsuarios();
        },
        error: (err) => {
          console.error('Error creando usuario:', err);
          const errorMessage = err?.message || err?.error?.message || 'Error al crear usuario';
          alert(`Error al crear usuario: ${errorMessage}`);
        }
      });
    } else {
      // Actualizar usuario existente
      this.usuariosService.updateUsuario(this.formData.id, this.formData).subscribe({
        next: () => {
          console.log('Usuario actualizado exitosamente');
          this.closeModal();
          this.loadUsuarios();
        },
        error: (err) => {
          console.error('Error guardando usuario:', err);
          const errorMessage = err?.message || err?.error?.message || 'Error al guardar usuario';
          alert(`Error al guardar usuario: ${errorMessage}`);
        }
      });
    }
  }

  toggleActivo(usuario: Usuario) {
    this.usuariosService.updateUsuario(usuario.id, { activo: !usuario.activo }).subscribe({
      next: () => this.loadUsuarios(),
      error: (err) => {
        console.error('Error actualizando usuario:', err);
        alert('Error al actualizar usuario');
      }
    });
  }

  getTipoNombre(tipoId: number): string {
    const tipo = this.tiposUsuario.find(t => t.id === tipoId);
    return tipo?.nombre || 'Desconocido';
  }

  onPageChange(page: number) {
    this.page = page;
    this.loadUsuarios();
  }

  Math = Math;
}
