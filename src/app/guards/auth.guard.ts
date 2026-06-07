/* ============================================
   AUTH GUARD - Protección de rutas
   ============================================ */

import { inject } from '@angular/core';
import { Router, CanActivateFn, PRIMARY_OUTLET } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { guardarReturnUrlLogin } from '../core/login-redirect';

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
 * Rutas cupos (/cupos, /cupos-evento, /mis-cupos) solo si `environment.cuposEventumEnabled`.
 * Cliente en rutas protegidas: mis-compras, perfil, pago-resultado.
 */
function clienteTienePermisoParaRuta(router: Router, url: string): boolean {
  const segments = segmentosDesdeUrl(router, url);
  if (segments.length === 0) return false;

  const [a, b, c] = segments;

  if (a === 'mis-cupos' && segments.length === 1) return true;

  if (a === 'mis-compras') {
    if (segments.length === 1) return true;
    if (segments.length === 2 && (b === 'actividad' || b === 'guia')) return true;
    if (segments.length === 3 && b === 'evento' && Boolean(c)) return true;
    return false;
  }

  if (a === 'pago-resultado' && segments.length === 1) return true;
  if (a === 'perfil' && segments.length === 1) return true;

  return false;
}

/** Rutas de cliente que deben ir a `/login` (Google), no a login-admin. */
function esRutaLoginCliente(router: Router, url: string): boolean {
  const segments = segmentosDesdeUrl(router, url);
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
  ]);
  if (!raiz.has(a)) return false;

  if (a === 'mis-compras') {
    if (segments.length === 1) return true;
    if (segments.length === 2 && (b === 'actividad' || b === 'guia')) return true;
    if (segments.length === 3 && b === 'evento' && Boolean(segments[2])) return true;
    return false;
  }

  if (a === 'cupos-evento' || a === 'detalle-evento' || a === 'club') {
    return segments.length === 2 && Boolean(b);
  }

  return segments.length === 1;
}

function redirigirSinSesion(router: Router, returnUrl: string): void {
  if (esRutaLoginCliente(router, returnUrl)) {
    guardarReturnUrlLogin(returnUrl);
    void router.navigate(['/login'], { queryParams: { returnUrl } });
    return;
  }
  void router.navigate(['/login-admin'], { queryParams: { returnUrl } });
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
      redirigirSinSesion(router, state.url);
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
    redirigirSinSesion(router, state.url);
    return false;
  }
};

