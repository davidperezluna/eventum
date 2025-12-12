/* ============================================
   AUTH GUARD - Protección de rutas
   ============================================ */

import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { map, take, filter, switchMap, catchError } from 'rxjs/operators';
import { AuthService, RolesPermitidos } from '../services/auth.service';
import { of } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  console.log('Auth Guard - Verificando autenticación para:', state.url);

  // Primero esperar a que la inicialización termine
  return authService.initialized$.pipe(
    filter(initialized => initialized), // Esperar hasta que esté inicializado
    take(1),
    switchMap(() => {
      // Verificar sesión actual
      const session = authService.getSession();
      const currentUser = authService.getCurrentUser();
      
      console.log('Auth Guard - Estado después de inicialización:', {
        hasSession: !!session,
        hasUser: !!currentUser,
        url: state.url
      });

      // Si no hay sesión ni usuario, redirigir al login
      if (!session || !currentUser) {
        console.log('Auth Guard - No hay sesión, redirigiendo al login');
        router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
        return of(false);
      }

      // Esperar a que el usuario se cargue desde la tabla usuarios
      // Usar el valor actual si ya está disponible, sino esperar
      const currentUsuario = authService.getUsuario();
      if (currentUsuario !== null && currentUsuario !== undefined) {
        // Ya tenemos el usuario cargado, verificar directamente
        console.log('Auth Guard - Usuario ya cargado:', currentUsuario);
        
        if (!authService.hasRolePermitido(currentUsuario.tipo_usuario_id)) {
          console.log('Auth Guard - Usuario sin rol permitido:', currentUsuario.tipo_usuario_id);
          authService.logout().subscribe();
          return of(false);
        }

        console.log('Auth Guard - Acceso permitido');
        return of(true);
      }

      // Si no está cargado, esperar a que se cargue
      // El BehaviorSubject siempre emite un valor, así que tomamos el primero
      return authService.usuario$.pipe(
        take(1),
        map((usuario) => {
          console.log('Auth Guard - Usuario cargado:', usuario);
          
          if (!usuario) {
            console.log('Auth Guard - No hay usuario en tabla usuarios, redirigiendo al login');
            router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
            return false;
          }

          // Verificar que tenga un rol permitido
          if (!authService.hasRolePermitido(usuario.tipo_usuario_id)) {
            console.log('Auth Guard - Usuario sin rol permitido:', usuario.tipo_usuario_id);
            // Cerrar sesión y redirigir al login
            authService.logout().subscribe();
            return false;
          }

          console.log('Auth Guard - Acceso permitido');
          return true;
        }),
        catchError((error) => {
          console.error('Auth Guard - Error:', error);
          router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
          return of(false);
        })
      );
    }),
    catchError((error) => {
      console.error('Auth Guard - Error en inicialización:', error);
      router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
      return of(false);
    })
  );
};

