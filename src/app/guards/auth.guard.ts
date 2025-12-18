/* ============================================
   AUTH GUARD - Protección de rutas
   ============================================ */

import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService, RolesPermitidos } from '../services/auth.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  console.log('Auth Guard - Verificando autenticación para:', state.url);

  try {
    // Esperar a que la inicialización termine
    await authService.waitForInitialization();

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
      return false;
    }

    // Obtener el usuario de la tabla usuarios
    const usuario = authService.getUsuario();
    
    if (!usuario) {
      console.log('Auth Guard - No hay usuario en tabla usuarios, redirigiendo al login');
      router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
      return false;
    }

    console.log('Auth Guard - Usuario cargado:', usuario);

    // Verificar que tenga un rol permitido
    if (!authService.hasRolePermitido(usuario.tipo_usuario_id)) {
      console.log('Auth Guard - Usuario sin rol permitido:', usuario.tipo_usuario_id);
      // Cerrar sesión y redirigir al login
      await authService.logout();
      return false;
    }

    console.log('Auth Guard - Acceso permitido');
    return true;
  } catch (error) {
    console.error('Auth Guard - Error:', error);
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }
};

