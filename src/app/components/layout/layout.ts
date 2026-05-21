import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { CarritoCompraService } from '../../services/carrito-compra.service';
import { User } from '@supabase/supabase-js';
import { filter } from 'rxjs';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout implements OnInit, OnDestroy {
  menuItems: any[] = [];

  currentUser: User | null = null;
  usuario: any = null;
  userEmail: string = '';
  userRole: string = '';
  sidebarOpen: boolean = false;
  clientMenuOpen: boolean = false;
  totalItemsCarrito = 0;

  readonly currentYear = new Date().getFullYear();
  private routerSubscription?: any;
  private carritoSubscription?: any;
  private unsubscribeAuthState?: () => void;

  constructor(
    private authService: AuthService,
    private carritoCompraService: CarritoCompraService,
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
          this.loadMenuAdministrador();
        } else if (usuario.tipo_usuario_id === 2) {
          this.userRole = 'Organizador';
          this.loadMenuOrganizador();
        } else if (usuario.tipo_usuario_id === 1) {
          this.userRole = 'Cliente';
          this.loadMenuCliente();
        } else if (this.authService.isLector()) {
          this.userRole = 'Lector';
          this.menuItems = [];
          this.redirectLectorFueraDeApp();
        } else {
          this.userRole = 'Usuario';
        }
      } else {
        // Si no hay usuario, limpiar menú
        this.menuItems = [];
        this.userRole = '';
      }
      this.cdr.detectChanges();
    });

    // Cerrar sidebar y menú móvil cuando cambia la ruta (solo en móviles)
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        if (window.innerWidth <= 768) {
          this.closeSidebar();
          this.closeClientMenu();
        }
        
        // Scroll top on route change
        window.scrollTo(0, 0);
      });

    this.carritoSubscription = this.carritoCompraService.totalItems$.subscribe((total) => {
      this.totalItemsCarrito = total;
      this.cdr.detectChanges();
    });
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
    if (this.unsubscribeAuthState) {
      this.unsubscribeAuthState();
    }
  }

  loadMenuAdministrador() {
    this.menuItems = [
      { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { path: '/usuarios', label: 'Usuarios', icon: 'people' },
      { path: '/eventos', label: 'Eventos', icon: 'event' },
      { path: '/categorias', label: 'Categorías', icon: 'category' },
      { path: '/lugares', label: 'Lugares', icon: 'place' },
      { path: '/boletas', label: 'Boletas sin usar', icon: 'confirmation_number' },
      { path: '/boletas-usadas', label: 'Boletas usadas', icon: 'how_to_reg' },
      { path: '/lectores-parametrizacion', label: 'Lectores', icon: 'qr_code_scanner' },
      { path: '/palcos', label: 'Palcos', icon: 'event_seat' },
      { path: '/ventas', label: 'Ventas', icon: 'attach_money' },
      { path: '/ventas-manual', label: 'Venta manual', icon: 'point_of_sale' },
      { path: '/probar-compras', label: 'Probar compras', icon: 'shopping_cart_checkout' },
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
    this.menuItems = [
      { path: '/eventos-cliente', label: 'Eventos', icon: 'event' },
      { path: '/mis-compras', label: 'Mis Compras', icon: 'shopping_bag' },
      { path: '/perfil', label: 'Mi Perfil', icon: 'person' },
    ];
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar() {
    this.sidebarOpen = false;
  }

  toggleClientMenu() {
    this.clientMenuOpen = !this.clientMenuOpen;
  }

  closeClientMenu() {
    this.clientMenuOpen = false;
  }

  async logout() {
    const redirect = this.authService.isCliente() ? '/login' : '/login-admin';
    await this.authService.logout(redirect);
  }
}
