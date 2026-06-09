/* ============================================
   AUTH SERVICE - Autenticación con Supabase
   ============================================ */

import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { OneSignalIdentityService } from './onesignal-identity.service';
import { User, Session } from '@supabase/supabase-js';
import { Usuario } from '../types/entities';
import { environment } from '../../environments/environment';

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
  CLIENTE = 1, // Asumiendo que cliente es id 1
  /** Rol para escaneo QR; accede por `/login-admin` y rutas `/lector/*`. */
  LECTOR = 4,
}

// Tipos para callbacks
export type AuthStateCallback = (user: User | null, usuario: Usuario | null, session: Session | null) => void;
export type InitializedCallback = (initialized: boolean) => void;

/** Marca cierre de sesión si la PWA se cierra antes de que Supabase termine signOut. */
const FORCE_LOGOUT_STORAGE_KEY = 'eventum_force_logout';

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
    private ngZone: NgZone,
    private oneSignalIdentity: OneSignalIdentityService
  ) {
    this.initAuth();
  }

  /**
   * Inicializa la autenticación y verifica la sesión actual
   */
  private async initAuth() {
    this.ngZone.runOutsideAngular(async () => {
      try {
        await this.applyForcedLogoutIfNeeded();

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

          if (event === 'SIGNED_OUT') {
            this.clearPersistedAuthStorage();
          }

          if (this.hasForcedLogoutFlag() && session?.user) {
            await this.applyForcedLogoutIfNeeded();
            return;
          }

          this.ngZone.run(async () => {
            this.setSession(session);
            this.setCurrentUser(session?.user ?? null);

            if (session?.user) {
              await this.loadUsuarioData(session.user.id);
            } else {
              this.setUsuario(null);
              this.oneSignalIdentity.logoutFromOneSignal();
            }
          });
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
        
        if (!this.canLoadUsuarioEnSesion(usuario.tipo_usuario_id)) {
          console.warn('Usuario sin rol reconocido al cargar datos:', usuario.tipo_usuario_id);
          this.setUsuario(null);
          return;
        }

        this.clearForcedLogoutFlag();
        this.setUsuario(usuario);
        console.log('Datos del usuario cargados correctamente:', usuario);
        this.oneSignalIdentity.syncLoggedInUser(
          authUserId,
          usuario,
          this.currentUser?.email
        );
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
  async login(
    credentials: LoginCredentials,
    options?: { context?: 'staff' | 'lector' }
  ): Promise<{ user: User | null; usuario: Usuario | null; error: any }> {
    const context = options?.context ?? 'staff';
    console.log('Iniciando login para:', credentials.email);
    
    try {
      // Si quedó un flag de logout previo en esta misma sesión de app,
      // evitar que el próximo SIGNED_IN dispare un signOut inmediato.
      this.clearForcedLogoutFlag();

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

      if (context === 'lector' && usuario.tipo_usuario_id !== RolesPermitidos.LECTOR) {
        await this.supabase.auth.signOut();
        return {
          user: null,
          usuario: null,
          error: {
            message: 'Solo los usuarios con rol Lector pueden acceder a la app de escaneo.',
          },
        };
      }

      if (!this.canLoginViaLoginAdmin(usuario.tipo_usuario_id)) {
        console.warn('Rol no permitido en login-admin:', usuario.tipo_usuario_id);
        await this.supabase.auth.signOut();
        return {
          user: null,
          usuario: null,
          error: {
            message: this.mensajeLoginAdminNoPermitido(usuario.tipo_usuario_id),
          },
        };
      }

      this.clearForcedLogoutFlag();

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
   * Cierra sesión y borra tokens persistidos (crítico en PWA al cerrar la app en segundo plano).
   */
  async logout(redirectTo = '/login-admin'): Promise<void> {
    this.setForcedLogoutFlag();

    try {
      const { error } = await this.supabase.auth.signOut({ scope: 'global' });
      if (error) {
        console.error('Error al cerrar sesión:', error);
      }
    } catch (error: unknown) {
      console.error('Error en signOut:', error);
    }

    this.clearPersistedAuthStorage();
    this.clearInMemoryAuthState();
    // Logout completado en esta ejecución: ya no hace falta forzar en el próximo arranque.
    this.clearForcedLogoutFlag();
    this.oneSignalIdentity.logoutFromOneSignal();

    await this.router.navigateByUrl(redirectTo, { replaceUrl: true });
  }

  /** Si el usuario cerró sesión y la PWA murió antes de limpiar storage, forzar cierre al reabrir. */
  private async applyForcedLogoutIfNeeded(): Promise<void> {
    if (!this.hasForcedLogoutFlag()) {
      return;
    }

    try {
      await this.supabase.auth.signOut({ scope: 'global' });
    } catch {
      /* ignorar: igual limpiamos storage local */
    }

    this.clearPersistedAuthStorage();
    this.clearForcedLogoutFlag();
    this.clearInMemoryAuthState();
  }

  private setForcedLogoutFlag(): void {
    if (this.shouldSkipForcedLogoutFlow()) {
      return;
    }
    try {
      localStorage.setItem(FORCE_LOGOUT_STORAGE_KEY, '1');
    } catch {
      /* storage no disponible */
    }
  }

  private hasForcedLogoutFlag(): boolean {
    if (this.shouldSkipForcedLogoutFlow()) {
      return false;
    }
    try {
      return localStorage.getItem(FORCE_LOGOUT_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private clearForcedLogoutFlag(): void {
    try {
      localStorage.removeItem(FORCE_LOGOUT_STORAGE_KEY);
    } catch {
      /* noop */
    }
  }

  /**
   * En flujo lector (operación en puerta) evitamos auto-logout por bandera local
   * para no cortar validaciones durante alto tráfico.
   */
  private shouldSkipForcedLogoutFlow(): boolean {
    try {
      const path = globalThis?.location?.pathname || '';
      return path.startsWith('/lector');
    } catch {
      return false;
    }
  }

  /** Elimina claves sb-*-auth* que Supabase deja en local/session storage. */
  private clearPersistedAuthStorage(): void {
    const removeAuthKeys = (storage: Storage): void => {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith('sb-') && key.includes('auth')) {
          keys.push(key);
        }
      }
      keys.forEach((key) => storage.removeItem(key));
    };

    try {
      if (typeof localStorage !== 'undefined') {
        removeAuthKeys(localStorage);
      }
      if (typeof sessionStorage !== 'undefined') {
        removeAuthKeys(sessionStorage);
      }
    } catch (error) {
      console.warn('No se pudo limpiar almacenamiento de auth:', error);
    }
  }

  private clearInMemoryAuthState(): void {
    this.ngZone.run(() => {
      this.setSession(null);
      this.setCurrentUser(null);
      this.setUsuario(null);
    });
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
   * Valida la sesión JWT con Supabase (no solo caché en memoria).
   * Intenta refresh si expiró y el refresh token sigue vigente.
   */
  async ensureActiveSession(): Promise<boolean> {
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser();

      if (!error && user) {
        const { data: { session } } = await this.supabase.auth.getSession();
        this.ngZone.run(() => {
          if (session) {
            this.setSession(session);
          }
          this.setCurrentUser(user);
        });
        if (!this.usuario) {
          await this.loadUsuarioData(user.id);
        }
        return this.usuario !== null;
      }

      const { data: refreshed, error: refreshError } = await this.supabase.auth.refreshSession();
      if (!refreshError && refreshed.session?.user) {
        this.ngZone.run(() => {
          this.setSession(refreshed.session);
          this.setCurrentUser(refreshed.session!.user);
        });
        await this.loadUsuarioData(refreshed.session.user.id);
        return this.usuario !== null;
      }

      await this.clearExpiredSessionLocally();
      return false;
    } catch (err) {
      console.error('ensureActiveSession:', err);
      await this.clearExpiredSessionLocally();
      return false;
    }
  }

  /** Errores típicos cuando la sesión expiró o el JWT ya no es válido para RLS. */
  isAuthOrRlsError(message?: string): boolean {
    if (!message) {
      return false;
    }
    const normalized = message.toLowerCase();
    return (
      normalized.includes('row-level security') ||
      normalized.includes('jwt expired') ||
      normalized.includes('invalid jwt') ||
      normalized.includes('not authenticated') ||
      normalized.includes('session missing') ||
      (normalized.includes('token') && normalized.includes('expired')) ||
      normalized.includes('no se pudo obtener token de autenticación')
    );
  }

  private async clearExpiredSessionLocally(): Promise<void> {
    try {
      await this.supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* ignorar */
    }
    this.clearInMemoryAuthState();
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
    return (
      tipoUsuarioId === RolesPermitidos.ADMINISTRADOR ||
      tipoUsuarioId === RolesPermitidos.ORGANIZADOR ||
      tipoUsuarioId === RolesPermitidos.CLIENTE
    );
  }

  /** Cliente en login-admin solo en dev / build mobile de pruebas (`allowClienteLoginAdmin`). */
  isClienteLoginAdminEnabled(): boolean {
    return environment.allowClienteLoginAdmin === true;
  }

  /** Admin, organizador, lector; cliente solo si el entorno lo permite. */
  canLoginViaLoginAdmin(tipoUsuarioId: number): boolean {
    if (
      tipoUsuarioId === RolesPermitidos.ADMINISTRADOR ||
      tipoUsuarioId === RolesPermitidos.ORGANIZADOR ||
      tipoUsuarioId === RolesPermitidos.LECTOR
    ) {
      return true;
    }
    return (
      tipoUsuarioId === RolesPermitidos.CLIENTE && this.isClienteLoginAdminEnabled()
    );
  }

  private mensajeLoginAdminNoPermitido(tipoUsuarioId: number): string {
    if (tipoUsuarioId === RolesPermitidos.CLIENTE) {
      return 'Las cuentas de cliente deben iniciar sesión en el acceso público con Google (/login).';
    }
    return 'No tienes permisos para acceder desde esta pantalla.';
  }

  getHomeRouteForUsuario(usuario: Usuario | null): string {
    if (!usuario) return '/login-admin';
    switch (usuario.tipo_usuario_id) {
      case RolesPermitidos.LECTOR:
        return '/lector/inicio';
      case RolesPermitidos.ORGANIZADOR:
        return '/dashboard-organizador';
      case RolesPermitidos.ADMINISTRADOR:
        return '/dashboard';
      case RolesPermitidos.CLIENTE:
        return '/eventos-cliente';
      default:
        return '/eventos-cliente';
    }
  }

  /**
   * Tras login en login-admin: respeta returnUrl si aplica al rol.
   */
  resolvePostLoginUrl(usuario: Usuario, returnUrl?: string | null): string {
    const home = this.getHomeRouteForUsuario(usuario);
    const target = (returnUrl || '').trim().split('?')[0];
    if (!target || target === '/dashboard') {
      return home;
    }

    if (usuario.tipo_usuario_id === RolesPermitidos.LECTOR) {
      return target.startsWith('/lector') ? target : home;
    }

    if (usuario.tipo_usuario_id === RolesPermitidos.CLIENTE) {
      return this.esReturnUrlPermitidaCliente(target) ? target : home;
    }

    if (target.startsWith('/lector')) {
      return home;
    }

    return target;
  }

  /** Rutas cliente a las que se puede volver tras login público (Google). */
  esReturnUrlPermitidaCliente(returnUrl: string): boolean {
    const path = (returnUrl || '').trim().split('?')[0];
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return false;

    const [a, b] = segments;
    const raiz = new Set([
      'carrito',
      'eventos-cliente',
      'conocenos',
      'cupos',
      'mis-cupos',
      'mis-compras',
      'perfil',
      'pago-resultado',
      'detalle-evento',
      'cupos-evento',
      'clubes',
      'club',
      'accesos-puerta',
    ]);

    if (a === 'mis-compras') {
      if (segments.length === 1) return true;
      if (segments.length === 2 && (b === 'actividad' || b === 'guia')) return true;
      if (segments.length === 3 && b === 'evento' && Boolean(segments[2])) return true;
      if (segments.length === 3 && b === 'club' && Boolean(segments[2])) return true;
      return false;
    }

    if (a === 'cupos-evento' || a === 'detalle-evento' || a === 'club') {
      return segments.length === 2 && Boolean(b);
    }

    return segments.length === 1;
  }

  /** Panel web admin / organizador / cliente (no incluye Lector). */
  canLoadUsuarioEnSesion(tipoUsuarioId: number): boolean {
    return this.hasRolePermitido(tipoUsuarioId) || tipoUsuarioId === RolesPermitidos.LECTOR;
  }

  isLector(): boolean {
    return this.usuario?.tipo_usuario_id === RolesPermitidos.LECTOR;
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

