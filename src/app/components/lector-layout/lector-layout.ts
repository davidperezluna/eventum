import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import {
  RouterOutlet,
  RouterLink,
  RouterLinkActive,
  Router,
  NavigationEnd,
} from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';

export const LECTOR_MENU_ITEMS = [
  { path: '/lector/inicio', label: 'Inicio', icon: 'home', exact: true },
  { path: '/lector/validar', label: 'Validar boleta', icon: 'qr_code_scanner', exact: false },
] as const;

@Component({
  selector: 'app-lector-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './lector-layout.html',
  styleUrls: ['../layout/layout.css', './lector-layout.css'],
  encapsulation: ViewEncapsulation.None,
})
export class LectorLayout implements OnInit, OnDestroy {
  readonly menuItems = [...LECTOR_MENU_ITEMS];
  clientMenuOpen = false;
  userEmail = '';
  userName = '';
  readonly currentYear = new Date().getFullYear();
  private navSub?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.syncUser();
    this.navSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.closeClientMenu());
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

  toggleClientMenu(): void {
    this.clientMenuOpen = !this.clientMenuOpen;
  }

  closeClientMenu(): void {
    this.clientMenuOpen = false;
  }

  async logout(): Promise<void> {
    await this.authService.logout('/login-admin');
  }
}
