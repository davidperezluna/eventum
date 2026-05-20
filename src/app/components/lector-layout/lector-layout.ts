import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';

export const LECTOR_MENU_ITEMS = [
  { path: '/lector/inicio', label: 'Inicio', icon: 'home' },
  { path: '/lector/validar', label: 'Validar boleta', icon: 'qr_code_scanner' },
] as const;

@Component({
  selector: 'app-lector-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './lector-layout.html',
  styleUrl: './lector-layout.css',
})
export class LectorLayout implements OnInit, OnDestroy {
  readonly menuItems = [...LECTOR_MENU_ITEMS];
  sidebarOpen = false;
  userEmail = '';
  userName = '';
  private navSub?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.syncUser();
    this.navSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        if (window.innerWidth <= 768) {
          this.sidebarOpen = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.navSub?.unsubscribe();
  }

  private syncUser(): void {
    const u = this.authService.getUsuario();
    this.userEmail = u?.email || this.authService.getCurrentUser()?.email || '';
    const nom = [u?.nombre, u?.apellido].filter(Boolean).join(' ').trim();
    this.userName = nom || 'Lector';
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  async logout(): Promise<void> {
    await this.authService.logout('/login-admin');
  }
}
