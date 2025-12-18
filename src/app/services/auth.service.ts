/* ============================================
   AUTH SERVICE - Autenticación con Supabase
   ============================================ */

import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { User, Session } from '@supabase/supabase-js';
import { Usuario } from '../types/entities';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  nombre?: string;
  apellido?: string;
}

// Roles permitidos
export enum RolesPermitidos {
  ADMINISTRADOR = 3,
  ORGANIZADOR = 2,
  CLIENTE = 1 // Asumiendo que cliente es id 1
}

// Tipos para callbacks
export type AuthStateCallback = (user: User | null, usuario: Usuario | null, session: Session | null) => void;
export type InitializedCallback = (initialized: boolean) => void;

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUser: User | null = null;
  private usuario: Usuario | null = null;
  private session: Session | null = null;
  private initialized: boolean = false;

  // Callbacks para notificar cambios
  private authStateCallbacks: Set<AuthStateCallback> = new Set();
  private initializedCallbacks: Set<InitializedCallback> = new Set();

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.initAuth();
  }

  /**
   * Inicializa la autenticación y verifica la sesión actual
   */
  private async initAuth() {
    this.ngZone.runOutsideAngular(async () => {
      try {
        // Verificar sesión actual
        const { data: { session }, error } = await this.supabase.auth.getSession();
        
        if (error) {
          console.error('Error obteniendo sesión:', error);
          this.ngZone.run(() => {
            this.setInitialized(true);
          });
          return;
        }
        
        this.ngZone.run(() => {
          this.setSession(session);
          this.setCurrentUser(session?.user ?? null);
        });

        // Si hay sesión, cargar datos del usuario
        if (session?.user) {
          await this.loadUsuarioData(session.user.id);
        } else {
          // Si no hay sesión, marcar como inicializado
          this.ngZone.run(() => {
            this.setUsuario(null);
            this.setInitialized(true);
          });
        }

        // Marcar como inicializado después de cargar datos
        this.ngZone.run(() => {
          this.setInitialized(true);
        });

        // Escuchar cambios de autenticación
        this.supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('Auth state changed:', event, session?.user?.id);
          
          this.ngZone.run(() => {
            this.setSession(session);
            this.setCurrentUser(session?.user ?? null);
          });
          
          if (session?.user) {
            await this.loadUsuarioData(session.user.id);
          } else {
            this.ngZone.run(() => {
              this.setUsuario(null);
            });
          }
        });
      } catch (error) {
        console.error('Error en initAuth:', error);
        this.ngZone.run(() => {
          this.setInitialized(true);
        });
      }
    });
  }

  /**
   * Métodos privados para actualizar estado y notificar callbacks
   */
  private setCurrentUser(user: User | null) {
    this.currentUser = user;
    this.notifyAuthStateChange();
  }

  private setUsuario(usuario: Usuario | null) {
    this.usuario = usuario;
    this.notifyAuthStateChange();
  }

  private setSession(session: Session | null) {
    this.session = session;
    this.notifyAuthStateChange();
  }

  private setInitialized(initialized: boolean) {
    this.initialized = initialized;
    this.notifyInitialized();
  }

  private notifyAuthStateChange() {
    this.authStateCallbacks.forEach(callback => {
      try {
        callback(this.currentUser, this.usuario, this.session);
      } catch (error) {
        console.error('Error en callback de auth state:', error);
      }
    });
  }

  private notifyInitialized() {
    this.initializedCallbacks.forEach(callback => {
      try {
        callback(this.initialized);
      } catch (error) {
        console.error('Error en callback de initialized:', error);
      }
    });
  }

  /**
   * Suscribirse a cambios de estado de autenticación
   */
  onAuthStateChange(callback: AuthStateCallback): () => void {
    this.authStateCallbacks.add(callback);
    // Ejecutar callback inmediatamente con el estado actual
    callback(this.currentUser, this.usuario, this.session);
    // Retornar función para desuscribirse
    return () => {
      this.authStateCallbacks.delete(callback);
    };
  }

  /**
   * Suscribirse a cambios de inicialización
   */
  onInitialized(callback: InitializedCallback): () => void {
    this.initializedCallbacks.add(callback);
    // Ejecutar callback inmediatamente si ya está inicializado
    if (this.initialized) {
      callback(this.initialized);
    }
    // Retornar función para desuscribirse
    return () => {
      this.initializedCallbacks.delete(callback);
    };
  }

  /**
   * Carga los datos del usuario desde la tabla usuarios
   * Si el usuario no existe, lo crea automáticamente (útil para OAuth)
   */
  private async loadUsuarioData(authUserId: string) {
    try {
      // Primero intentar buscar el usuario
      let { data, error } = await this.supabase
        .from('usuarios')
        .select('*')
        .eq('auth_user_id', authUserId)
        .single();

      // Si no existe, intentar buscar por email
      if (error && error.code === 'PGRST116') {
        const authUser = this.currentUser;
        if (authUser?.email) {
          const emailResult = await this.supabase
            .from('usuarios')
            .select('*')
            .eq('email', authUser.email)
            .single();
          
          if (emailResult.data) {
            // Actualizar auth_user_id si no está establecido
            if (!emailResult.data.auth_user_id) {
              await this.supabase
                .from('usuarios')
                .update({ auth_user_id: authUserId })
                .eq('id', emailResult.data.id);
              data = { ...emailResult.data, auth_user_id: authUserId };
              error = null;
            } else {
              data = emailResult.data;
              error = null;
            }
          }
        }
      }

      // Si aún no existe, crear el usuario (para OAuth)
      if (error && error.code === 'PGRST116') {
        const authUser = this.currentUser;
        if (authUser) {
          // Extraer datos de Google OAuth si están disponibles
          const googleFullName = authUser.user_metadata?.['full_name'] || 
                                authUser.user_metadata?.['name'] || 
                                '';
          const googleName = authUser.user_metadata?.['given_name'] || 
                           googleFullName.split(' ')[0] || 
                           authUser.email?.split('@')[0] || 
                           'Usuario';
          const googleLastName = authUser.user_metadata?.['family_name'] || 
                                googleFullName.split(' ').slice(1).join(' ') || 
                                null;
          
          const newUsuario = {
            auth_user_id: authUserId,
            email: authUser.email || '',
            nombre: googleName,
            apellido: googleLastName,
            tipo_usuario_id: 1, // Cliente por defecto
            activo: true,
            email_verificado: authUser.email_confirmed_at ? true : false
          };

          const createResult = await this.supabase
            .from('usuarios')
            .insert(newUsuario)
            .select()
            .single();

          if (createResult.data) {
            data = createResult.data;
            error = null;
          }
        }
      }

      this.ngZone.run(() => {
        if (error || !data) {
          console.error('Error cargando datos del usuario:', error);
          this.setUsuario(null);
          return;
        }

        const usuario = data as Usuario;
        
        // Validar que el usuario tenga un rol permitido
        if (!this.hasRolePermitido(usuario.tipo_usuario_id)) {
          console.warn('Usuario sin rol permitido al cargar datos:', usuario.tipo_usuario_id);
          // No cerrar sesión automáticamente, solo no cargar el usuario
          this.setUsuario(null);
          return;
        }

        this.setUsuario(usuario);
        console.log('Datos del usuario cargados correctamente:', usuario);
      });
    } catch (error) {
      this.ngZone.run(() => {
        console.error('Error cargando datos del usuario:', error);
        this.setUsuario(null);
      });
    }
  }

  /**
   * Inicia sesión con email y contraseña
   */
  async login(credentials: LoginCredentials): Promise<{ user: User | null; usuario: Usuario | null; error: any }> {
    console.log('Iniciando login para:', credentials.email);
    
    try {
      const authResponse = await this.supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password
      });
      
      console.log('Respuesta de signInWithPassword:', authResponse);
      
      if (authResponse.error) {
        console.error('Error en signInWithPassword:', authResponse.error);
        return { user: null, usuario: null, error: authResponse.error };
      }

      const user = authResponse.data?.user;
      const session = authResponse.data?.session;
      
      console.log('Usuario de Supabase Auth:', user);
      console.log('Sesión:', session);
      
      if (!user) {
        console.error('No se obtuvo usuario de la respuesta');
        return { user: null, usuario: null, error: { message: 'Error al obtener usuario' } };
      }

      // Actualizar la sesión y el usuario actual inmediatamente
      if (session) {
        this.ngZone.run(() => {
          this.setSession(session);
          this.setCurrentUser(user);
        });
      }

      // Cargar datos del usuario desde la tabla usuarios
      console.log('Buscando usuario en tabla usuarios con auth_user_id:', user.id);
      
      const usuarioResponse = await this.supabase
        .from('usuarios')
        .select('*')
        .eq('auth_user_id', user.id)
        .single();
      
      console.log('Respuesta de consulta usuarios:', usuarioResponse);
      
      if (usuarioResponse.error) {
        console.error('Error al buscar usuario en tabla usuarios:', usuarioResponse.error);
        console.error('Detalles del error:', {
          message: usuarioResponse.error.message,
          details: usuarioResponse.error.details,
          hint: usuarioResponse.error.hint,
          code: usuarioResponse.error.code
        });
        
        return { 
          user, 
          usuario: null, 
          error: { 
            message: 'Usuario no encontrado en la base de datos. Verifica que el usuario esté registrado en la tabla usuarios con el auth_user_id correcto.' 
          } 
        };
      }

      const usuario = usuarioResponse.data as Usuario;
      console.log('Usuario encontrado en tabla usuarios:', usuario);

      // Validar que el usuario tenga un rol permitido
      if (!this.hasRolePermitido(usuario.tipo_usuario_id)) {
        console.warn('Usuario sin rol permitido:', usuario.tipo_usuario_id);
        // Cerrar sesión si no tiene rol permitido
        await this.supabase.auth.signOut();
        return {
          user: null,
          usuario: null,
          error: {
            message: 'No tienes permisos para acceder a este panel. Solo administradores y organizadores pueden ingresar.'
          }
        };
      }

      // Actualizar el usuario
      this.ngZone.run(() => {
        this.setUsuario(usuario);
      });
      console.log('Login exitoso, usuario actualizado:', usuario);
      
      return { user, usuario, error: null };
    } catch (error: any) {
      console.error('Error en login:', error);
      return { user: null, usuario: null, error: { message: error.message || 'Error al iniciar sesión' } };
    }
  }

  /**
   * Cierra sesión
   */
  async logout(): Promise<void> {
    try {
      const { error } = await this.supabase.auth.signOut();
      
      this.ngZone.run(() => {
        // Limpiar todos los estados
        this.setSession(null);
        this.setCurrentUser(null);
        this.setUsuario(null);
        
        if (error) {
          console.error('Error al cerrar sesión:', error);
        }
        
        // Redirigir al login
        this.router.navigate(['/login']);
      });
    } catch (error: any) {
      this.ngZone.run(() => {
        // Limpiar estados incluso si hay error
        this.setSession(null);
        this.setCurrentUser(null);
        this.setUsuario(null);
        
        this.router.navigate(['/login']);
      });
      throw error;
    }
  }

  /**
   * Inicia sesión con Google OAuth
   */
  async signInWithGoogle(): Promise<{ error: any }> {
    try {
      const { error } = await this.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });
      
      return { error };
    } catch (error: any) {
      return { error };
    }
  }

  /**
   * Registra un nuevo usuario con Google OAuth
   * (Usa el mismo método que signInWithGoogle, Supabase crea el usuario automáticamente)
   */
  async signUpWithGoogle(): Promise<{ error: any }> {
    return this.signInWithGoogle();
  }

  /**
   * Registra un nuevo usuario
   */
  async register(data: RegisterData): Promise<{ user: User | null; error: any }> {
    try {
      const authResponse = await this.supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            nombre: data.nombre,
            apellido: data.apellido
          }
        }
      });

      if (authResponse.error) {
        return { user: null, error: authResponse.error };
      }

      return { user: authResponse.data?.user || null, error: null };
    } catch (error: any) {
      return { user: null, error: { message: error.message || 'Error al registrar usuario' } };
    }
  }

  /**
   * Obtiene la sesión actual
   */
  getSession(): Session | null {
    return this.session;
  }

  /**
   * Obtiene el usuario actual (de Supabase Auth)
   */
  getCurrentUser(): User | null {
    return this.currentUser;
  }

  /**
   * Obtiene los datos del usuario (de la tabla usuarios)
   */
  getUsuario(): Usuario | null {
    return this.usuario;
  }

  /**
   * Verifica si está inicializado
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Verifica si el usuario está autenticado
   */
  isAuthenticated(): boolean {
    const hasSession = this.session !== null;
    const hasUser = this.currentUser !== null;
    const hasUsuario = this.usuario !== null;
    
    return hasSession && hasUser && hasUsuario;
  }

  /**
   * Espera a que la inicialización termine
   */
  async waitForInitialization(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }
    
    return new Promise((resolve) => {
      const unsubscribe = this.onInitialized((initialized) => {
        if (initialized) {
          unsubscribe();
          resolve(true);
        }
      });
    });
  }

  /**
   * Verifica si el usuario tiene un rol permitido
   */
  hasRolePermitido(tipoUsuarioId: number): boolean {
    return tipoUsuarioId === RolesPermitidos.ADMINISTRADOR || 
           tipoUsuarioId === RolesPermitidos.ORGANIZADOR ||
           tipoUsuarioId === RolesPermitidos.CLIENTE;
  }

  /**
   * Verifica si el usuario es cliente
   */
  isCliente(): boolean {
    const usuario = this.usuario;
    return usuario?.tipo_usuario_id === RolesPermitidos.CLIENTE;
  }

  /**
   * Verifica si el usuario es administrador
   */
  isAdministrador(): boolean {
    const usuario = this.usuario;
    return usuario?.tipo_usuario_id === RolesPermitidos.ADMINISTRADOR;
  }

  /**
   * Verifica si el usuario es organizador
   */
  isOrganizador(): boolean {
    const usuario = this.usuario;
    return usuario?.tipo_usuario_id === RolesPermitidos.ORGANIZADOR;
  }

  /**
   * Obtiene el ID del usuario actual (útil para organizador_id)
   */
  getUsuarioId(): number | null {
    const usuario = this.usuario;
    return usuario?.id || null;
  }

  /**
   * Actualiza la contraseña del usuario
   */
  async updatePassword(currentPassword: string, newPassword: string): Promise<{ error: any }> {
    try {
      // Verificar la contraseña actual
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) {
        return { error: { message: 'Usuario no autenticado' } };
      }

      // Actualizar la contraseña
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        return { error };
      }

      return { error: null };
    } catch (error: any) {
      return { error: { message: error.message || 'Error al actualizar la contraseña' } };
    }
  }

  /**
   * Refresca la información del usuario desde la base de datos
   */
  async refreshUsuario(): Promise<void> {
    const usuarioId = this.getUsuarioId();
    if (!usuarioId) return;

    try {
      const { data, error } = await this.supabase
        .from('usuarios')
        .select('*')
        .eq('id', usuarioId)
        .single();

      if (error) {
        console.error('Error refrescando usuario:', error);
        return;
      }

      if (data) {
        this.ngZone.run(() => {
          this.setUsuario(data as Usuario);
        });
      }
    } catch (error) {
      console.error('Error en refreshUsuario:', error);
    }
  }
}

