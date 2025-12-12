import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { User } from '@supabase/supabase-js';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout implements OnInit {
  menuItems: any[] = [];

  currentUser: User | null = null;
  usuario: any = null;
  userEmail: string = '';
  userRole: string = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      this.userEmail = user?.email || '';
    });

    this.authService.usuario$.subscribe(usuario => {
      this.usuario = usuario;
      if (usuario) {
        // Determinar el nombre del rol
        if (usuario.tipo_usuario_id === 3) {
          this.userRole = 'Administrador';
          this.loadMenuAdministrador();
        } else if (usuario.tipo_usuario_id === 2) {
          this.userRole = 'Organizador';
          this.loadMenuOrganizador();
        } else {
          this.userRole = 'Usuario';
        }
      }
    });
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
    ];
  }

  loadMenuOrganizador() {
    this.menuItems = [
      { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { path: '/eventos', label: 'Eventos', icon: 'event' },
      { path: '/boletas', label: 'Boletas', icon: 'confirmation_number' },
      { path: '/ventas', label: 'Ventas', icon: 'attach_money' },
    ];
  }

  logout() {
    this.authService.logout().subscribe(() => {
      this.router.navigate(['/login']);
    });
  }
}
