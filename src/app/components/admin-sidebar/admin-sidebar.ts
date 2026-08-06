import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  AdminNavEntry,
  AdminNavGroup,
  AdminNavSection,
  isAdminNavGroup,
  isAdminNavLink,
} from './admin-nav.types';

@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './admin-sidebar.html',
  styleUrl: './admin-sidebar.css',
})
export class AdminSidebarComponent implements OnChanges {
  @Input({ required: true }) sections: AdminNavSection[] = [];
  @Input() open = false;
  @Input() compact = false;
  @Input() userEmail = '';
  @Input() userRole = '';
  @Input() panelSubtitle = 'Panel Administrativo';
  @Input() homeRoute = '/dashboard';

  @Output() closePanel = new EventEmitter<void>();
  @Output() logoutClick = new EventEmitter<void>();
  @Output() compactChange = new EventEmitter<boolean>();

  readonly currentYear = new Date().getFullYear();
  readonly isAdminNavGroup = isAdminNavGroup;
  readonly isAdminNavLink = isAdminNavLink;

  private groupExpanded = new Map<string, boolean>();

  constructor(private router: Router) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sections']) {
      this.syncGroupExpandedState();
    }
  }

  trackSection(_index: number, section: AdminNavSection): string {
    return section.label ?? `section-${_index}`;
  }

  trackEntry(_index: number, entry: AdminNavEntry): string {
    return isAdminNavLink(entry) ? entry.path : entry.label;
  }

  isGroupExpanded(group: AdminNavGroup): boolean {
    return this.groupExpanded.get(group.label) ?? false;
  }

  toggleGroup(group: AdminNavGroup, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.groupExpanded.set(group.label, !this.isGroupExpanded(group));
  }

  onNavigate(): void {
    this.closePanel.emit();
  }

  toggleCompact(): void {
    this.compactChange.emit(!this.compact);
  }

  isLinkActive(path: string): boolean {
    const currentPath = this.router.url.split('?')[0];
    if (path === '/ventas') {
      return currentPath === '/ventas';
    }
    return currentPath === path || currentPath.startsWith(`${path}/`);
  }

  isGroupActive(group: AdminNavGroup): boolean {
    return group.children.some((child) => this.isLinkActive(child.path));
  }

  isEntryActive(entry: AdminNavEntry): boolean {
    if (isAdminNavLink(entry)) {
      return this.isLinkActive(entry.path);
    }
    return this.isGroupActive(entry);
  }

  userInitials(): string {
    const source = (this.userEmail || this.userRole || 'E').trim();
    return source.charAt(0).toUpperCase();
  }

  private syncGroupExpandedState(): void {
    for (const section of this.sections) {
      for (const entry of section.entries) {
        if (!isAdminNavGroup(entry)) {
          continue;
        }
        const active = this.isGroupActive(entry);
        if (!this.groupExpanded.has(entry.label)) {
          this.groupExpanded.set(entry.label, entry.expanded ?? active);
        } else if (active) {
          this.groupExpanded.set(entry.label, true);
        }
      }
    }
  }
}
