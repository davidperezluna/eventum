import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import {
  AdminNavSection,
  AdminNavEntry,
  isAdminNavGroup,
} from './admin-nav.types';

@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-sidebar.html',
  styleUrl: './admin-sidebar.css',
})
export class AdminSidebar implements OnInit, OnDestroy {
  @Input({ required: true }) sections: AdminNavSection[] = [];
  @Input() open = false;
  @Input() compact = false;
  @Input() userName = '';
  @Input() panelTitle = 'Panel Administrativo';
  @Input() homeRoute = '/dashboard';
  @Input() currentYear = new Date().getFullYear();

  @Output() closeSidebar = new EventEmitter<void>();
  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();
  @Output() compactChange = new EventEmitter<boolean>();

  /** Estado expandido de grupos colapsables (clave = label del grupo). */
  private expandedGroups = new Map<string, boolean>();
  private routerSub?: Subscription;

  /** Posición vertical del flyout compacto (px desde viewport). */
  flyoutAnchorTop = 0;

  constructor(
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.syncExpandedFromRoute(this.router.url);
    this.routerSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e) => {
        if (e instanceof NavigationEnd) {
          this.syncExpandedFromRoute(e.urlAfterRedirects);
          if (this.compact) {
            this.closeAllFlyouts();
          }
        }
      });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  onNavClick(): void {
    if (this.compact) {
      this.closeAllFlyouts();
    }
    this.closeSidebar.emit();
  }

  toggleCompact(): void {
    this.closeAllFlyouts();
    this.compactChange.emit(!this.compact);
  }

  toggleGroup(entry: AdminNavEntry, event?: Event): void {
    if (!isAdminNavGroup(entry)) return;
    event?.stopPropagation();
    const key = entry.label;
    const willExpand = !this.isGroupExpanded(entry);

    if (this.compact) {
      for (const section of this.sections) {
        for (const item of section.entries) {
          if (isAdminNavGroup(item) && item.label !== key) {
            this.expandedGroups.set(item.label, false);
          }
        }
      }
      this.expandedGroups.set(key, willExpand);
      if (willExpand && event?.currentTarget instanceof HTMLElement) {
        this.flyoutAnchorTop = this.clampFlyoutTop(event.currentTarget.getBoundingClientRect().top);
      }
      return;
    }

    this.expandedGroups.set(key, willExpand);
  }

  hasFlyoutOpen(): boolean {
    if (!this.compact) return false;
    for (const section of this.sections) {
      for (const entry of section.entries) {
        if (isAdminNavGroup(entry) && this.isGroupExpanded(entry)) {
          return true;
        }
      }
    }
    return false;
  }

  closeAllFlyouts(): void {
    for (const section of this.sections) {
      for (const entry of section.entries) {
        if (isAdminNavGroup(entry)) {
          this.expandedGroups.set(entry.label, false);
        }
      }
    }
    this.flyoutAnchorTop = 0;
  }

  private clampFlyoutTop(rawTop: number): number {
    const margin = 8;
    const estimatedHeight = Math.min(window.innerHeight * 0.7, 384);
    const maxTop = window.innerHeight - estimatedHeight - margin;
    return Math.max(margin, Math.min(rawTop, maxTop));
  }

  isGroupExpanded(entry: AdminNavEntry): boolean {
    if (!isAdminNavGroup(entry)) return false;
    if (this.expandedGroups.has(entry.label)) {
      return this.expandedGroups.get(entry.label)!;
    }
    return entry.expanded ?? false;
  }

  isLinkActive(path: string): boolean {
    const current = this.router.url.split('?')[0];
    if (path === '/ventas') {
      return current === '/ventas';
    }
    return current === path || current.startsWith(`${path}/`);
  }

  isGroupActive(entry: AdminNavEntry): boolean {
    if (!isAdminNavGroup(entry)) return false;
    return entry.children.some((c) => this.isLinkActive(c.path));
  }

  isEntryActive(entry: AdminNavEntry): boolean {
    if (isAdminNavGroup(entry)) {
      return this.isGroupActive(entry);
    }
    return this.isLinkActive(entry.path);
  }

  trackSection(_: number, section: AdminNavSection): string {
    return section.label ?? `section-${_}`;
  }

  trackEntry(_: number, entry: AdminNavEntry): string {
    return isAdminNavGroup(entry) ? `group-${entry.label}` : entry.path;
  }

  private syncExpandedFromRoute(url: string): void {
    const path = url.split('?')[0];
    for (const section of this.sections) {
      for (const entry of section.entries) {
        if (isAdminNavGroup(entry)) {
          const active = entry.children.some(
            (c) => path === c.path || (c.path !== '/ventas' && path.startsWith(`${c.path}/`)) || (c.path === '/ventas' && path === '/ventas')
          );
          if (active) {
            this.expandedGroups.set(entry.label, true);
          }
        }
      }
    }
  }
}
