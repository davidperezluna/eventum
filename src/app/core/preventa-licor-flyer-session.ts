const SESSION_KEY = 'eventum-preventa-licor-flyer-visto';

/** True si el usuario ya cerró o aceptó el flyer en esta pestaña/sesión. */
export function preventaLicorFlyerVistoEnSesion(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function marcarPreventaLicorFlyerVistoEnSesion(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}
