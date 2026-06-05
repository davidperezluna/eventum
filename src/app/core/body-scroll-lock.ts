/** Bloqueo de scroll compartido (menú móvil cliente / sidebar admin). */
let isLocked = false;

const ROOT_CLASS = 'client-menu-open';

/** Zonas que sí pueden hacer scroll con el menú abierto. */
const SCROLLABLE_MENU_SELECTOR =
  '.sidebar, .sidebar-nav, .client-mobile-menu, .client-mobile-nav';

function onTouchMoveWhileLocked(event: TouchEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest(SCROLLABLE_MENU_SELECTOR)) {
    return;
  }
  event.preventDefault();
}

export function lockBodyScroll(): void {
  if (typeof document === 'undefined' || isLocked) return;
  isLocked = true;
  document.documentElement.classList.add(ROOT_CLASS);
  document.addEventListener('touchmove', onTouchMoveWhileLocked, { passive: false });
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined' || !isLocked) return;
  isLocked = false;
  document.documentElement.classList.remove(ROOT_CLASS);
  document.removeEventListener('touchmove', onTouchMoveWhileLocked);
}

/** Limpieza al destruir el layout. */
export function forceUnlockBodyScroll(): void {
  unlockBodyScroll();
}
