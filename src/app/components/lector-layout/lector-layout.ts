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
  private bodyScrollLockY = 0;

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
    this.syncBodyScrollLock();
  }

  closeClientMenu(): void {
    this.clientMenuOpen = false;
    this.syncBodyScrollLock();
  }

  async logout(): Promise<void> {
    this.closeClientMenu();
    await this.authService.logout('/login-admin');
  }

  private syncBodyScrollLock(): void {
    if (typeof document === 'undefined') return;
    if (this.clientMenuOpen) {
      this.applyBodyScrollLock();
    } else {
      this.releaseBodyScrollLock();
    }
  }

  private applyBodyScrollLock(): void {
    const html = document.documentElement;
    const body = document.body;
    this.bodyScrollLockY = window.scrollY;
    body.style.position = 'fixed';
    body.style.top = `-${this.bodyScrollLockY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
  }

  private releaseBodyScrollLock(): void {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    const scrollY = this.bodyScrollLockY;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    body.style.overflow = '';
    html.style.overflow = '';
    window.scrollTo(0, scrollY);
  }
}
