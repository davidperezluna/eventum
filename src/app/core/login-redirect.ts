import { Router } from '@angular/router';

export const LOGIN_RETURN_URL_KEY = 'eventum_login_return_url';

/** Textos contextuales en /login según query `motivo`. */
export const LOGIN_MOTIVO_TEXTO: Record<string, string> = {
  contactar: 'Entra para contactar en el tablón y enviar tu interés.',
  publicar: 'Entra para publicar tu aviso en este evento.',
  reportar: 'Entra para reportar un aviso.',
  pagar: 'Entra para finalizar tu compra de forma segura.',
  'sesion-expirada': 'Tu sesión terminó. Entra de nuevo para continuar donde lo dejaste.',
  'mis-publicaciones': 'Entra para ver tus publicaciones de cupo.',
};

export function guardarReturnUrlLogin(returnUrl: string | null | undefined): void {
  if (typeof sessionStorage === 'undefined') return;
  const url = (returnUrl || '').trim();
  if (!url) {
    sessionStorage.removeItem(LOGIN_RETURN_URL_KEY);
    return;
  }
  sessionStorage.setItem(LOGIN_RETURN_URL_KEY, url);
}

export function leerReturnUrlLogin(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(LOGIN_RETURN_URL_KEY);
}

export function limpiarReturnUrlLogin(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(LOGIN_RETURN_URL_KEY);
}

export function irALoginCliente(
  router: Router,
  returnUrl: string,
  motivo?: string
): void {
  guardarReturnUrlLogin(returnUrl);
  void router.navigate(['/login'], {
    queryParams: motivo ? { returnUrl, motivo } : { returnUrl },
  });
}
