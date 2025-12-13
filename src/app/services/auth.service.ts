/* ============================================
   AUTH SERVICE - Autenticación con Supabase
   ============================================ */

import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, from, of, throwError } from 'rxjs';
import { map, catchError, switchMap, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { SupabaseObservableHelper } from './supabase-observable.helper';
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

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private usuarioSubject = new BehaviorSubject<Usuario | null>(null);
  public usuario$ = this.usuarioSubject.asObservable();

  private sessionSubject = new BehaviorSubject<Session | null>(null);
  public session$ = this.sessionSubject.asObservable();

  // Flag para indicar si la inicialización está completa
  private initializedSubject = new BehaviorSubject<boolean>(false);
  public initialized$ = this.initializedSubject.asObservable();

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private ngZone: NgZone,
    private supabaseHelper: SupabaseObservableHelper
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
            this.initializedSubject.next(true);
          });
          return;
        }
        
        this.ngZone.run(() => {
          this.sessionSubject.next(session);
          this.currentUserSubject.next(session?.user ?? null);
        });

        // Si hay sesión, cargar datos del usuario
        if (session?.user) {
          await this.loadUsuarioData(session.user.id);
        } else {
          // Si no hay sesión, marcar como inicializado
          this.ngZone.run(() => {
            this.usuarioSubject.next(null);
            this.initializedSubject.next(true);
          });
        }

        // Marcar como inicializado después de cargar datos
        this.ngZone.run(() => {
          this.initializedSubject.next(true);
        });

        // Escuchar cambios de autenticación
        this.supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('Auth state changed:', event, session?.user?.id);
          
          this.ngZone.run(() => {
            this.sessionSubject.next(session);
            this.currentUserSubject.next(session?.user ?? null);
          });
          
          if (session?.user) {
            await this.loadUsuarioData(session.user.id);
          } else {
            this.ngZone.run(() => {
              this.usuarioSubject.next(null);
            });
          }
        });
      } catch (error) {
        console.error('Error en initAuth:', error);
        this.ngZone.run(() => {
          this.initializedSubject.next(true);
        });
      }
    });
  }

  /**
   * Carga los datos del usuario desde la tabla usuarios
   */
  private async loadUsuarioData(authUserId: string) {
    try {
      const { data, error } = await this.supabase
        .from('usuarios')
        .select('*')
        .eq('auth_user_id', authUserId)
        .single();

      this.ngZone.run(() => {
        if (error) {
          console.error('Error cargando datos del usuario:', error);
          this.usuarioSubject.next(null);
          return;
        }

        const usuario = data as Usuario;
        
        // Validar que el usuario tenga un rol permitido
        if (!this.hasRolePermitido(usuario.tipo_usuario_id)) {
          console.warn('Usuario sin rol permitido al cargar datos:', usuario.tipo_usuario_id);
          // No cerrar sesión automáticamente, solo no cargar el usuario
          this.usuarioSubject.next(null);
          return;
        }

        this.usuarioSubject.next(usuario);
        console.log('Datos del usuario cargados correctamente:', usuario);
      });
    } catch (error) {
      this.ngZone.run(() => {
        console.error('Error cargando datos del usuario:', error);
        this.usuarioSubject.next(null);
      });
    }
  }

  /**
   * Inicia sesión con email y contraseña
   */
  login(credentials: LoginCredentials): Observable<{ user: User | null; usuario: Usuario | null; error: any }> {
    console.log('Iniciando login para:', credentials.email);
    
    return new Observable<{ data: { user: User | null; session: Session | null } | null; error: any }>(observer => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const authResponse = await this.supabase.auth.signInWithPassword({
            email: credentials.email,
            password: credentials.password
          });
          
          this.ngZone.run(() => {
            observer.next(authResponse);
            observer.complete();
          });
        } catch (error: any) {
          this.ngZone.run(() => {
            observer.error(error);
          });
        }
      });
    }).pipe(
      switchMap((authResponse) => {
        console.log('Respuesta de signInWithPassword:', authResponse);
        
        if (authResponse.error) {
          console.error('Error en signInWithPassword:', authResponse.error);
          return of({ user: null, usuario: null, error: authResponse.error });
        }

        const user = authResponse.data?.user;
        const session = authResponse.data?.session;
        
        console.log('Usuario de Supabase Auth:', user);
        console.log('Sesión:', session);
        
        if (!user) {
          console.error('No se obtuvo usuario de la respuesta');
          return of({ user: null, usuario: null, error: { message: 'Error al obtener usuario' } });
        }

        // Actualizar la sesión y el usuario actual inmediatamente
        if (session) {
          this.ngZone.run(() => {
            this.sessionSubject.next(session);
            this.currentUserSubject.next(user);
          });
        }

        // Cargar datos del usuario desde la tabla usuarios
        console.log('Buscando usuario en tabla usuarios con auth_user_id:', user.id);
        
        return new Observable<{ data: Usuario | null; error: any }>(observer => {
          this.ngZone.runOutsideAngular(() => {
            const query = this.supabase
              .from('usuarios')
              .select('*')
              .eq('auth_user_id', user.id)
              .single();
            
            Promise.resolve(query).then((usuarioResponse: any) => {
              this.ngZone.run(() => {
                observer.next(usuarioResponse);
                observer.complete();
              });
            }).catch((error: any) => {
              this.ngZone.run(() => {
                observer.error(error);
              });
            });
          });
        }).pipe(
          map((usuarioResponse) => {
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
              this.supabase.auth.signOut();
              return {
                user: null,
                usuario: null,
                error: {
                  message: 'No tienes permisos para acceder a este panel. Solo administradores y organizadores pueden ingresar.'
                }
              };
            }

            // Actualizar el usuario en el BehaviorSubject
            this.ngZone.run(() => {
              this.usuarioSubject.next(usuario);
            });
            console.log('Login exitoso, usuario actualizado:', usuario);
            
            return { user, usuario, error: null };
          }),
          catchError((error) => {
            console.error('Error en catchError de usuarios:', error);
            return of({ user, usuario: null, error: { message: error.message || 'Error al cargar datos del usuario' } });
          })
        );
      }),
      catchError((error) => {
        console.error('Error en catchError de login:', error);
        return of({ user: null, usuario: null, error: { message: error.message || 'Error al iniciar sesión' } });
      }),
      tap((result) => {
        console.log('Resultado final del login Observable:', result);
      })
    );
  }

  /**
   * Cierra sesión
   */
  logout(): Observable<void> {
    return new Observable(observer => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { error } = await this.supabase.auth.signOut();
          
          this.ngZone.run(() => {
            // Limpiar todos los subjects
            this.sessionSubject.next(null);
            this.currentUserSubject.next(null);
            this.usuarioSubject.next(null);
            
            if (error) {
              console.error('Error al cerrar sesión:', error);
            }
            
            observer.next();
            observer.complete();
            
            // Redirigir al login
            this.router.navigate(['/login']);
          });
        } catch (error: any) {
          this.ngZone.run(() => {
            // Limpiar subjects incluso si hay error
            this.sessionSubject.next(null);
            this.currentUserSubject.next(null);
            this.usuarioSubject.next(null);
            
            observer.error(error);
            this.router.navigate(['/login']);
          });
        }
      });
    });
  }

  /**
   * Registra un nuevo usuario
   */
  register(data: RegisterData): Observable<{ user: User | null; error: any }> {
    return this.supabaseHelper.fromSupabase(
      this.supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            nombre: data.nombre,
            apellido: data.apellido
          }
        }
      }).then((authResponse: any) => {
        // Normalizar la respuesta de auth.signUp a formato SupabaseResponse
        return {
          data: { user: authResponse.user, session: authResponse.session },
          error: authResponse.error,
          count: null
        };
      })
    ).pipe(
      map((response) => {
        if (response.error) {
          return { user: null, error: response.error };
        }
        const authData = response.data as { user: User | null; session: Session | null };
        return { user: authData?.user || null, error: null };
      }),
      catchError((error) => {
        return throwError(() => ({ user: null, error }));
      })
    );
  }

  /**
   * Obtiene el usuario actual (de Supabase Auth)
   */
  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Obtiene los datos del usuario (de la tabla usuarios)
   */
  getUsuario(): Usuario | null {
    return this.usuarioSubject.value;
  }

  /**
   * Verifica si el usuario está autenticado
   */
  isAuthenticated(): boolean {
    const hasSession = this.sessionSubject.value !== null;
    const hasUser = this.currentUserSubject.value !== null;
    const hasUsuario = this.usuarioSubject.value !== null;
    
    return hasSession && hasUser && hasUsuario;
  }

  /**
   * Espera a que la inicialización termine
   */
  waitForInitialization(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.initializedSubject.value) {
        resolve(true);
        return;
      }
      
      const subscription = this.initialized$.subscribe((initialized) => {
        if (initialized) {
          subscription.unsubscribe();
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
    const usuario = this.usuarioSubject.value;
    return usuario?.tipo_usuario_id === RolesPermitidos.CLIENTE;
  }

  /**
   * Verifica si el usuario es administrador
   */
  isAdministrador(): boolean {
    const usuario = this.usuarioSubject.value;
    return usuario?.tipo_usuario_id === RolesPermitidos.ADMINISTRADOR;
  }

  /**
   * Verifica si el usuario es organizador
   */
  isOrganizador(): boolean {
    const usuario = this.usuarioSubject.value;
    return usuario?.tipo_usuario_id === RolesPermitidos.ORGANIZADOR;
  }

  /**
   * Obtiene la sesión actual
   */
  getSession(): Session | null {
    return this.sessionSubject.value;
  }

  /**
   * Obtiene el ID del usuario actual (útil para organizador_id)
   */
  getUsuarioId(): number | null {
    const usuario = this.usuarioSubject.value;
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
  refreshUsuario(): void {
    const usuarioId = this.getUsuarioId();
    if (!usuarioId) return;

    from(
      this.supabase
        .from('usuarios')
        .select('*')
        .eq('id', usuarioId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('Error refrescando usuario:', error);
          return null;
        }
        return data as Usuario;
      }),
      catchError((error) => {
        console.error('Error en refreshUsuario:', error);
        return of(null);
      })
    ).subscribe((usuario) => {
      if (usuario) {
        this.usuarioSubject.next(usuario);
      }
    });
  }
}

