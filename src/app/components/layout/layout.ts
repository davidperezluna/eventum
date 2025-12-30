import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
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
  private routerSubscription?: any;
  private unsubscribeAuthState?: () => void;

  constructor(
    private authService: AuthService,
    private router: Router
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
        } else {
          this.userRole = 'Usuario';
        }
      }
    });

    // Cerrar sidebar cuando cambia la ruta (solo en móviles)
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        if (window.innerWidth <= 768) {
          this.closeSidebar();
        }
        
        // Scroll top on route change
        window.scrollTo(0, 0);
      });
  }

  isCliente(): boolean {
    return this.usuario?.tipo_usuario_id === 1;
  }

  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
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
      { path: '/boletas', label: 'Boletas', icon: 'confirmation_number' },
      { path: '/ventas', label: 'Ventas', icon: 'attach_money' },
      { path: '/calificaciones', label: 'Calificaciones', icon: 'star' },
      { path: '/notificaciones', label: 'Notificaciones', icon: 'notifications' },
      { path: '/reportes', label: 'Reportes', icon: 'assessment' },
      { path: '/perfil', label: 'Mi Perfil', icon: 'person' },
    ];
  }

  loadMenuOrganizador() {
    this.menuItems = [
      { path: '/dashboard-organizador', label: 'Dashboard', icon: 'dashboard' },
      { path: '/eventos', label: 'Mis Eventos', icon: 'event' },
      { path: '/boletas', label: 'Boletas', icon: 'confirmation_number' },
      { path: '/ventas', label: 'Mis Ventas', icon: 'attach_money' },
      { path: '/perfil', label: 'Mi Perfil', icon: 'person' },
    ];
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

  async logout() {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
