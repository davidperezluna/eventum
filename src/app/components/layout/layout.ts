import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { CarritoCompraService } from '../../services/carrito-compra.service';
import { MisComprasStateService } from '../../services/mis-compras-state.service';
import { TrasladosBoletaService } from '../../services/traslados-boleta.service';
import { User } from '@supabase/supabase-js';
import { filter, merge, Subscription } from 'rxjs';
import { AccesosPuertaService } from '../../services/accesos-puerta.service';
import { cuposEventumEnabled } from '../../core/cupos-feature';
import { coversEventumEnabled } from '../../core/covers-feature';
import { CUPOS_LABELS } from '../../core/cupos-labels';
import { COVERS_LABELS } from '../../core/covers-labels';
import { forceUnlockBodyScroll, lockBodyScroll, unlockBodyScroll } from '../../core/body-scroll-lock';
import { ClientConfirmDialog } from '../client-confirm-dialog/client-confirm-dialog';

type ClientNavItem = {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
  badge?: 'carrito' | 'traslados-pendientes';
  /** Separador visual antes del ítem (p. ej. acciones de compra). */
  dividerBefore?: boolean;
  mobile?: boolean;
  desktop?: boolean;
};

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, ClientConfirmDialog],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout implements OnInit, OnDestroy {
  menuItems: Array<{
    path?: string;
    label: string;
    icon: string;
    expanded?: boolean;
    children?: Array<{
      path: string;
      label: string;
      icon: string;
    }>;
  }> = [];

  /** Navegación cliente (drawer móvil + barra desktop) — orden único. */
  clientNavItems: ClientNavItem[] = [];

  currentUser: User | null = null;
  usuario: any = null;
  userEmail: string = '';
  userRole: string = '';
  sidebarOpen: boolean = false;
  clientMenuOpen: boolean = false;
  totalItemsCarrito = 0;
  totalTrasladosPendientes = 0;
  subtotalCarrito = 0;
  enRutaCarrito = false;
  mostrarNavAccesosPuerta = false;

  readonly cuposEventumEnabled = cuposEventumEnabled;
  readonly coversEventumEnabled = coversEventumEnabled;
  readonly cuposLabels = CUPOS_LABELS;
  readonly coversLabels = COVERS_LABELS;
  readonly currentYear = new Date().getFullYear();
  private routerSubscription?: any;
  private carritoSubscription?: any;
  private trasladosPendientesSubscription?: Subscription;
  private accesosPuertaSubscription?: Subscription;
  private unsubscribeAuthState?: () => void;

  constructor(
    private authService: AuthService,
    private carritoCompraService: CarritoCompraService,
    private misComprasStateService: MisComprasStateService,
    private trasladosBoletaService: TrasladosBoletaService,
    private accesosPuertaService: AccesosPuertaService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Suscribirse a cambios de estado de autenticación
    this.unsubscribeAuthState = this.authService.onAuthStateChange((user, usuario, session) => {
      this.currentUser = user;
      this.userEmail = user?.email || '';
      this.usuario = usuario;
      
      if (usuario) {
        // Determinar el nombre del rol
        if (usuario.tipo_usuario_id === 3) {
          this.userRole = 'Administrador';
          this.clientNavItems = [];
          this.loadMenuAdministrador();
        } else if (usuario.tipo_usuario_id === 2) {
          this.userRole = 'Organizador';
          this.clientNavItems = [];
          this.loadMenuOrganizador();
        } else if (usuario.tipo_usuario_id === 1) {
          this.userRole = 'Cliente';
          this.loadMenuCliente();
          this.misComprasStateService.hydrateTrasladosPendientesCountFromState(usuario.id);
          void this.refreshTrasladosPendientesNavBadge(usuario.id);
          if (this.coversEventumEnabled) {
            void this.accesosPuertaService.refresh({ background: true });
          }
        } else if (this.authService.isLector()) {
          this.userRole = 'Lector';
          this.menuItems = [];
          this.clientNavItems = [];
          this.redirectLectorFueraDeApp();
        } else {
          this.userRole = 'Usuario';
          this.clientNavItems = [];
        }
      } else {
        // Si no hay usuario, limpiar menú
        this.menuItems = [];
        this.clientNavItems = [];
        this.userRole = '';
        this.mostrarNavAccesosPuerta = false;
        this.accesosPuertaService.clear();
      }
      this.cdr.detectChanges();
    });

    // Cerrar sidebar / menú móvil al cambiar de ruta
    this.syncRutaCarrito(this.router.url);
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.syncRutaCarrito(event.urlAfterRedirects);
        }
        if (window.innerWidth <= 768) {
          this.closeSidebar();
          this.closeClientMenu();
        }
        window.scrollTo(0, 0);
        this.cdr.detectChanges();
      });

    this.refreshCarritoFabState();
    this.trasladosPendientesSubscription = this.misComprasStateService.trasladosPendientesCount$.subscribe(
      (count) => {
        this.totalTrasladosPendientes = count;
        this.cdr.detectChanges();
      }
    );
    this.carritoSubscription = merge(
      this.carritoCompraService.totalItems$,
      this.carritoCompraService.items$,
      this.carritoCompraService.itemsProductos$,
      this.carritoCompraService.itemsCover$,
    ).subscribe(() => this.refreshCarritoFabState());

    this.mostrarNavAccesosPuerta = this.coversEventumEnabled && this.accesosPuertaService.getCount() > 0;
    this.accesosPuertaSubscription = this.accesosPuertaService.tieneAccesos$.subscribe((tiene) => {
      if (!this.coversEventumEnabled) {
        return;
      }
      const changed = this.mostrarNavAccesosPuerta !== tiene;
      this.mostrarNavAccesosPuerta = tiene;
      if (changed && this.isCliente()) {
        this.loadMenuCliente();
      }
      this.cdr.detectChanges();
    });
  }

  get mostrarCarritoFab(): boolean {
    if (this.totalItemsCarrito <= 0 || this.enRutaCarrito) {
      return false;
    }
    if (this.isLector()) {
      return false;
    }
    const tipo = this.usuario?.tipo_usuario_id;
    if (tipo === 2 || tipo === 3) {
      return false;
    }
    return true;
  }

  irACarrito(): void {
    void this.router.navigate(['/carrito']);
  }

  formatCurrencyCarrito(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  private syncRutaCarrito(url: string): void {
    const path = (url || '').split('?')[0];
    this.enRutaCarrito = path === '/carrito' || path.startsWith('/carrito/');
  }

  private refreshCarritoFabState(): void {
    this.subtotalCarrito = this.carritoCompraService.getSubtotalCombinado();
    this.totalItemsCarrito =
      this.carritoCompraService.getItemsSnapshot().reduce((acc, item) => acc + item.cantidad, 0) +
      this.carritoCompraService.getItemsProductosSnapshot().reduce((acc, item) => acc + item.cantidad, 0) +
      this.carritoCompraService.getItemsCoverSnapshot().reduce((acc, item) => acc + item.cantidad, 0);
    this.cdr.detectChanges();
  }

  isCliente(): boolean {
    return this.usuario?.tipo_usuario_id === 1;
  }

  isLector(): boolean {
    return this.authService.isLector();
  }

  private redirectLectorFueraDeApp(): void {
    const path = this.router.url.split('?')[0];
    if (!path.startsWith('/lector')) {
      void this.router.navigate(['/lector/inicio']);
    }
  }

  /** Nombre/apellidos para menú cliente; si no hay, el pie solo muestra el correo */
  nombreCliente(): string | null {
    const u = this.usuario as { nombre?: string; apellido?: string } | null;
    if (!u) return null;
    const nom = typeof u.nombre === 'string' ? u.nombre.trim() : '';
    const ape = typeof u.apellido === 'string' ? u.apellido.trim() : '';
    const joined = [nom, ape].filter(Boolean).join(' ').trim();
    return joined.length > 0 ? joined : null;
  }

  /** Inicio del panel admin u organizador (barra superior móvil). */
  get panelHomeRoute(): string {
    return this.usuario?.tipo_usuario_id === 2 ? '/dashboard-organizador' : '/dashboard';
  }

  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
    if (this.carritoSubscription) {
      this.carritoSubscription.unsubscribe();
    }
    if (this.trasladosPendientesSubscription) {
      this.trasladosPendientesSubscription.unsubscribe();
    }
    if (this.accesosPuertaSubscription) {
      this.accesosPuertaSubscription.unsubscribe();
    }
    if (this.unsubscribeAuthState) {
      this.unsubscribeAuthState();
    }
    forceUnlockBodyScroll();
  }

  loadMenuAdministrador() {
    this.menuItems = [
      { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { path: '/usuarios', label: 'Usuarios', icon: 'people' },
      { path: '/eventos', label: 'Eventos', icon: 'event' },
      { path: '/categorias', label: 'Categorías', icon: 'category' },
      { path: '/lugares', label: 'Lugares', icon: 'place' },
      ...(this.coversEventumEnabled
        ? [{ path: '/covers-config', label: 'Covers', icon: 'local_bar' }]
        : []),
      { path: '/boletas', label: 'Boletas sin usar', icon: 'confirmation_number' },
      { path: '/boletas-usadas', label: 'Boletas usadas', icon: 'how_to_reg' },
      { path: '/productos', label: 'Productos', icon: 'local_mall' },
      { path: '/lectores-parametrizacion', label: 'Lectores', icon: 'qr_code_scanner' },
      { path: '/palcos', label: 'Palcos', icon: 'event_seat' },
      {
        label: 'Ventas',
        icon: 'attach_money',
        expanded: true,
        children: [
          { path: '/ventas', label: 'Ventas boletas', icon: 'confirmation_number' },
          { path: '/ventas-productos', label: 'Ventas productos', icon: 'inventory_2' },
          { path: '/ventas-palcos', label: 'Ventas palcos', icon: 'weekend' },
          { path: '/transacciones-checkout', label: 'Transacciones', icon: 'receipt_long' },
        ]
      },
      { path: '/probar-compras', label: 'Probar compras', icon: 'storefront' },
      { path: '/ventas-manual', label: 'Venta manual', icon: 'point_of_sale' },
      { path: '/calificaciones', label: 'Calificaciones', icon: 'star' },
      { path: '/notificaciones', label: 'Notificaciones', icon: 'notifications' },
      { path: '/reportes', label: 'Reportes', icon: 'assessment' },
      { path: '/perfil', label: 'Mi Perfil', icon: 'person' },
    ];
  }

  loadMenuOrganizador() {
    // Temporal: sólo entrada al panel organizador en el menú lateral.
    this.menuItems = [
      { path: '/dashboard-organizador', label: 'Dashboard', icon: 'dashboard' },
      ...(this.coversEventumEnabled
        ? [{ path: '/covers-config', label: 'Covers', icon: 'local_bar' }]
        : []),
    ];
    /*
    Ocultos de momento — restaurar al activar rutas desde el sidebar:
      { path: '/eventos', label: 'Mis Eventos', icon: 'event' },
      { path: '/boletas', label: 'Boletas sin usar', icon: 'confirmation_number' },
      { path: '/boletas-usadas', label: 'Boletas usadas', icon: 'how_to_reg' },
      { path: '/lectores-parametrizacion', label: 'Lectores', icon: 'qr_code_scanner' },
      { path: '/ventas', label: 'Mis Ventas', icon: 'attach_money' },
      { path: '/perfil', label: 'Mi Perfil', icon: 'person' },
    */
  }

  loadMenuCliente() {
    this.clientNavItems = [
      { path: '/eventos-cliente', label: 'Eventos', icon: 'event', exact: true },
      ...(this.coversEventumEnabled
        ? [{ path: '/clubes', label: COVERS_LABELS.explorar, icon: 'local_bar', exact: true }]
        : []),
      {
        path: '/mis-compras',
        label: 'Mis compras',
        icon: 'confirmation_number',
        exact: true,
        badge: 'traslados-pendientes',
      },
      ...(this.coversEventumEnabled && this.mostrarNavAccesosPuerta
        ? [{
            path: '/accesos-puerta',
            label: 'Acceso puerta',
            icon: 'qr_code_scanner',
            exact: true,
          }]
        : []),
      {
        path: '/carrito',
        label: 'Carrito',
        icon: 'shopping_cart',
        exact: true,
        badge: 'carrito',
        dividerBefore: true,
      },
      ...(this.cuposEventumEnabled
        ? [{ path: '/cupos', label: CUPOS_LABELS.explorar, icon: 'forum', exact: true }]
        : []),
      { path: '/perfil', label: 'Mi perfil', icon: 'person', exact: false, dividerBefore: true },
    ];
    this.menuItems = [];
  }

  clientNavFor(surface: 'mobile' | 'desktop'): ClientNavItem[] {
    return this.clientNavItems.filter((item) =>
      surface === 'mobile' ? item.mobile !== false : item.desktop !== false
    );
  }

  navItemHasBadge(item: ClientNavItem): boolean {
    return item.badge === 'carrito' || item.badge === 'traslados-pendientes';
  }

  navItemBadgeCount(item: ClientNavItem): number {
    if (item.badge === 'carrito') return this.totalItemsCarrito;
    if (item.badge === 'traslados-pendientes') return this.totalTrasladosPendientes;
    return 0;
  }

  private async refreshTrasladosPendientesNavBadge(userId: number): Promise<void> {
    try {
      const pend = await this.trasladosBoletaService.listarPendientesRecibir(userId);
      this.misComprasStateService.setTrasladosPendientesCount(pend.length);
    } catch (e) {
      console.error('Error cargando badge traslados pendientes:', e);
    }
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
    this.syncBodyScrollLock();
  }

  closeSidebar() {
    this.sidebarOpen = false;
    this.syncBodyScrollLock();
  }

  toggleClientMenu() {
    this.clientMenuOpen = !this.clientMenuOpen;
    this.syncBodyScrollLock();
  }

  closeClientMenu() {
    this.clientMenuOpen = false;
    this.syncBodyScrollLock();
  }

  private syncBodyScrollLock(): void {
    if (this.clientMenuOpen || this.sidebarOpen) {
      lockBodyScroll();
    } else {
      unlockBodyScroll();
    }
  }

  toggleMenuGroup(item: { expanded?: boolean; children?: unknown[] }): void {
    if (!item.children?.length) return;
    item.expanded = !item.expanded;
  }

  isMenuItemActive(item: { path?: string; children?: Array<{ path: string }> }): boolean {
    if (item.path) {
      return this.isPathActive(item.path);
    }
    if (item.children?.length) {
      return item.children.some((child) => this.isPathActive(child.path));
    }
    return false;
  }

  private isPathActive(path: string): boolean {
    const currentPath = this.router.url.split('?')[0];
    if (path === '/ventas') {
      return currentPath === '/ventas';
    }
    return currentPath === path || currentPath.startsWith(`${path}/`);
  }

  async logout() {
    const redirect = this.authService.isCliente() ? '/login' : '/login-admin';
    await this.authService.logout(redirect);
  }
}
