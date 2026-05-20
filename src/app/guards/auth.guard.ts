/* ============================================
   AUTH GUARD - Protección de rutas
   ============================================ */

import { inject } from '@angular/core';
import { Router, CanActivateFn, PRIMARY_OUTLET } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Segmentos de ruta (sin query) para una URL de navegación. */
function segmentosDesdeUrl(router: Router, url: string): string[] {
  const tree = router.parseUrl(url);
  const primary = tree.root.children[PRIMARY_OUTLET];
  return primary ? primary.segments.map((s) => s.path) : [];
}

/**
 * Rutas protegidas que el rol Cliente puede usar.
 * El resto (dashboard, eventos admin, usuarios, etc.) queda bloqueado.
 * Públicas (sin este guard): eventos-cliente, conocenos, detalle-evento/:id.
 */
function clienteTienePermisoParaRuta(router: Router, url: string): boolean {
  const segments = segmentosDesdeUrl(router, url);
  if (segments.length === 0) return false;

  const [a, b, c] = segments;

  if (a === 'mis-compras') {
    if (segments.length === 1) return true;
    if (segments.length === 2 && b === 'actividad') return true;
    if (segments.length === 3 && b === 'evento' && Boolean(c)) return true;
    return false;
  }

  if (a === 'pago-resultado' && segments.length === 1) return true;
  if (a === 'perfil' && segments.length === 1) return true;

  return false;
}

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
      router.navigate(['/login-admin'], { queryParams: { returnUrl: state.url } });
      return false;
    }

    // Obtener el usuario de la tabla usuarios
    const usuario = authService.getUsuario();
    
    if (!usuario) {
      console.log('Auth Guard - No hay usuario en tabla usuarios, redirigiendo al login');
      router.navigate(['/login-admin'], { queryParams: { returnUrl: state.url } });
      return false;
    }

    console.log('Auth Guard - Usuario cargado:', usuario);

    if (authService.isLector()) {
      console.log('Auth Guard - Lector redirigido a app de escaneo');
      router.navigate(['/lector/inicio']);
      return false;
    }

    if (!authService.hasRolePermitido(usuario.tipo_usuario_id)) {
      console.log('Auth Guard - Usuario sin rol permitido:', usuario.tipo_usuario_id);
      await authService.logout();
      return false;
    }

    if (authService.isCliente()) {
      if (!clienteTienePermisoParaRuta(router, state.url)) {
        console.log('Auth Guard - Cliente sin acceso a ruta protegida:', state.url);
        router.navigate(['/eventos-cliente']);
        return false;
      }
    }

    const adminOnly = route.data?.['adminOnly'] === true;
    if (adminOnly && !authService.isAdministrador()) {
      console.log('Auth Guard - Ruta solo admin bloqueada para usuario:', usuario.tipo_usuario_id);
      router.navigate([authService.isOrganizador() ? '/dashboard-organizador' : '/dashboard']);
      return false;
    }

    console.log('Auth Guard - Acceso permitido');
    return true;
  } catch (error) {
    console.error('Auth Guard - Error:', error);
    router.navigate(['/login-admin'], { queryParams: { returnUrl: state.url } });
    return false;
  }
};

