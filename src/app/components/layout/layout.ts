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
import {
  esClienteConPerfilIncompleto,
  esRutaExentaCompletarPerfil,
  urlDestinoClienteConPerfil,
} from '../../core/perfil-completo';
import { EvDialogHost } from '../ev-dialog/ev-dialog-host';
import { EvDrawerHost } from '../ev-drawer/ev-drawer-host';
import { EvNotice } from '../ev-notice';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';
import { AdminNavSection } from '../admin-sidebar/admin-nav.types';
import {
  buildAdminNavSections,
  buildOrganizadorNavSections,
  buildShowcaseNavSections,
} from '../admin-sidebar/admin-nav.config';
import { LOGIN_QUERY_CARRITO_PAGAR } from '../../core/login-redirect';
import { DemoScenarioService } from '../../demo/demo-scenario.service';

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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, EvDialogHost, EvDrawerHost, EvNotice, AdminSidebar],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout implements OnInit, OnDestroy {
  adminNavSections: AdminNavSection[] = [];

  /** Navegación cliente (drawer móvil + barra desktop) — orden único. */
  clientNavItems: ClientNavItem[] = [];

  currentUser: User | null = null;
  usuario: any = null;
  userEmail: string = '';
  sidebarOpen: boolean = false;
  sidebarCompact: boolean = false;
  clientMenuOpen: boolean = false;
  totalItemsCarrito = 0;
  totalTrasladosPendientes = 0;
  subtotalCarrito = 0;
  enRutaCarrito = false;
  enRutaPagoWompi = false;
  mostrarNavAccesosPuerta = false;
  clientePerfilIncompleto = false;

  readonly cuposEventumEnabled = cuposEventumEnabled;
  readonly coversEventumEnabled = coversEventumEnabled;
  readonly cuposLabels = CUPOS_LABELS;
  readonly coversLabels = COVERS_LABELS;
  readonly currentYear = new Date().getFullYear();

  /** Login contextual de compra cuando hay ítems en el carrito (header «Entrar»). */
  get headerLoginQueryParams(): typeof LOGIN_QUERY_CARRITO_PAGAR | undefined {
    return this.totalItemsCarrito > 0 ? LOGIN_QUERY_CARRITO_PAGAR : undefined;
  }

  /** Banner demo en layout global; en /eventos va integrado al hero de la página. */
  get showShowcaseNoticeInLayout(): boolean {
    if (!this.authService.isShowcaseOrganizador()) return false;
    if (this.demoScenarioService.isSimulatedViewActive()) return false;
    const path = this.router.url.split('?')[0];
    return path !== '/eventos';
  }

  get showSimulatedViewBanner(): boolean {
    return this.demoScenarioService.isSimulatedViewActive();
  }

  get simulatedViewLabel(): string {
    return this.demoScenarioService.getActiveLabel() ?? 'Demo';
  }

  /** En móvil el drawer siempre va expandido; el rail solo aplica en desktop. */
  get effectiveSidebarCompact(): boolean {
    if (this.adminSidebarMobileMq?.matches) return false;
    return this.sidebarCompact;
  }

  private routerSubscription?: any;
  private carritoSubscription?: any;
  private trasladosPendientesSubscription?: Subscription;
  private accesosPuertaSubscription?: Subscription;
  private unsubscribeAuthState?: () => void;
  private readonly adminSidebarMobileMq =
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)') : null;
  private adminSidebarMqListener?: () => void;

  constructor(
    public authService: AuthService,
    private carritoCompraService: CarritoCompraService,
    private misComprasStateService: MisComprasStateService,
    private trasladosBoletaService: TrasladosBoletaService,
    private accesosPuertaService: AccesosPuertaService,
    public router: Router,
    private demoScenarioService: DemoScenarioService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Suscribirse a cambios de estado de autenticación
    this.unsubscribeAuthState = this.authService.onAuthStateChange((user, usuario, session) => {
      this.currentUser = user;
      this.userEmail = user?.email || '';
      this.usuario = usuario;
      
      if (usuario) {
        if (usuario.tipo_usuario_id === 3) {
          this.clientNavItems = [];
          this.loadAdminNav();
        } else if (usuario.tipo_usuario_id === 2) {
          this.clientNavItems = [];
          this.loadAdminNav();
        } else if (usuario.tipo_usuario_id === 1) {
          this.loadMenuCliente();
          this.clientePerfilIncompleto = esClienteConPerfilIncompleto(usuario);
          this.misComprasStateService.hydrateTrasladosPendientesCountFromState(usuario.id);
          void this.refreshTrasladosPendientesNavBadge(usuario.id);
          if (this.coversEventumEnabled) {
            void this.accesosPuertaService.refresh({ background: true });
          }
        } else if (this.authService.isLector()) {
          this.adminNavSections = [];
          this.clientNavItems = [];
          this.redirectLectorFueraDeApp();
        } else {
          this.clientNavItems = [];
        }
      } else {
        // Si no hay usuario, limpiar menú
        this.adminNavSections = [];
        this.clientNavItems = [];
        this.mostrarNavAccesosPuerta = false;
        this.clientePerfilIncompleto = false;
        this.accesosPuertaService.clear();
      }
      this.cdr.detectChanges();
    });

    // Cerrar sidebar / menú móvil al cambiar de ruta
    this.syncRutaCarrito(this.router.url);
    this.verificarRedireccionCompletarPerfil(this.router.url);
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.syncRutaCarrito(event.urlAfterRedirects);
          this.verificarRedireccionCompletarPerfil(event.urlAfterRedirects);
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

    if (this.adminSidebarMobileMq) {
      this.adminSidebarMqListener = () => this.cdr.markForCheck();
      this.adminSidebarMobileMq.addEventListener('change', this.adminSidebarMqListener);
    }
  }

  get mostrarCarritoFab(): boolean {
    if (!this.currentUser || !this.usuario) {
      return false;
    }
    if (this.totalItemsCarrito <= 0 || this.enRutaCarrito || this.enRutaPagoWompi) {
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
    this.enRutaPagoWompi = path === '/pago-wompi';
  }

  private verificarRedireccionCompletarPerfil(url: string): void {
    if (!this.isCliente()) {
      return;
    }

    const path = (url || '').split('?')[0];
    if (esRutaExentaCompletarPerfil(path)) {
      return;
    }

    const usuario = this.authService.getUsuario();
    this.clientePerfilIncompleto = esClienteConPerfilIncompleto(usuario);
    if (!this.clientePerfilIncompleto) {
      return;
    }

    const destino = urlDestinoClienteConPerfil(usuario, path || '/eventos-cliente');
    if (destino.startsWith('/completar-perfil')) {
      void this.router.navigateByUrl(destino);
    }
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

  /** Solo el nombre (sin apellido) para el pie del panel admin/organizador */
  nombrePanelSidebar(): string | null {
    const u = this.usuario as { nombre?: string } | null;
    if (!u) return null;
    const nom = typeof u.nombre === 'string' ? u.nombre.trim() : '';
    return nom.length > 0 ? nom : null;
  }

  /** Inicio del panel admin u organizador (barra superior móvil). */
  get panelHomeRoute(): string {
    return this.usuario?.tipo_usuario_id === 2 ? '/eventos' : '/dashboard';
  }

  /** Subtítulo del sidebar según rol. */
  get panelTitle(): string {
    if (this.usuario?.tipo_usuario_id === 2) {
      return this.authService.isShowcaseOrganizador() ? 'Panel Organizador · Demo' : 'Panel Organizador';
    }
    return 'Panel Administrativo';
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
    if (this.adminSidebarMobileMq && this.adminSidebarMqListener) {
      this.adminSidebarMobileMq.removeEventListener('change', this.adminSidebarMqListener);
    }
    forceUnlockBodyScroll();
  }

  loadAdminNav(): void {
    if (this.usuario?.tipo_usuario_id === 3) {
      this.adminNavSections = buildAdminNavSections(this.coversEventumEnabled);
    } else if (this.authService.isShowcaseOrganizador()) {
      this.adminNavSections = buildShowcaseNavSections();
    } else {
      this.adminNavSections = buildOrganizadorNavSections(this.coversEventumEnabled);
    }
  }

  onSidebarCompactChange(compact: boolean): void {
    this.sidebarCompact = compact;
  }

  loadMenuCliente() {
    this.clientNavItems = [
      { path: '/eventos-cliente', label: 'Eventos', icon: 'event', exact: true },
      ...(this.coversEventumEnabled
        ? [{ path: '/clubes', label: COVERS_LABELS.explorar, icon: 'local_bar', exact: true }]
        : []),
      {
        path: '/recibidos',
        label: 'Recibidos',
        icon: 'move_to_inbox',
        exact: true,
        badge: 'traslados-pendientes',
      },
      {
        path: '/mis-compras',
        label: 'Mis compras',
        icon: 'confirmation_number',
        exact: true,
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
    ];
    this.adminNavSections = [];
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

  async logout() {
    await this.authService.logout('/eventos-cliente');
  }
}
