import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterModule } from '@angular/router';
import { EvNotice } from '../ev-notice';

export interface CompraTicketBadge {
  label: string;
  className: string;
}

export interface CompraTicketTraslado {
  badgeLabel: string;
  badgeIcon: string;
  badgeVariant: 'entrada' | 'cover';
  destinationLabel: string;
  email: string;
  message: string;
  cancellable: boolean;
}

export interface CompraTicketBase {
  kind: 'entrada' | 'producto' | 'cover';
  clickable: boolean;
  ariaLabel?: string;
}

export interface EntradaTicketCard extends CompraTicketBase {
  kind: 'entrada';
  title: string;
  price: string;
  reference: string;
  received: boolean;
  badge?: CompraTicketBadge;
  dateTitle?: string;
  dateSubtitle?: string;
  time?: string;
  venue?: string;
  traslado?: CompraTicketTraslado;
  pendingMessage?: string;
  attendee?: {
    name: string;
    document?: string;
    email?: string;
  };
  used: boolean;
  usedAt?: string;
  hasTalon: boolean;
  qr?: {
    ready: boolean;
    icon: string;
    title: string;
    subtitle: string;
  };
  assignment?: {
    mode: 'assign' | 'transfer';
    canUseProfile: boolean;
    applyingProfile: boolean;
    error?: string;
    errorHasProfileLink: boolean;
  };
}

export interface ProductoTicketItem {
  name: string;
  imageUrl?: string;
  alcohol: boolean;
  badge: CompraTicketBadge;
  quantityLine: string;
  pricing?: {
    status: string;
    current: string;
    reference: string;
    saving?: string;
  };
}

export interface ProductoTicketCard extends CompraTicketBase {
  kind: 'producto';
  title: string;
  price: string;
  reference: string;
  badge?: CompraTicketBadge;
  dateTitle?: string;
  time?: string;
  venue?: string;
  items: ProductoTicketItem[];
  redeemed: boolean;
  redeemedAt?: string;
  qr?: {
    ready: boolean;
    icon: string;
    title: string;
    subtitle: string;
  };
}

export interface CoverTicketCard extends CompraTicketBase {
  kind: 'cover';
  title: string;
  reference: string;
  received: boolean;
  badge: CompraTicketBadge;
  dateTitle: string;
  dateSubtitle: string;
  traslado?: CompraTicketTraslado;
  blockedMessage?: string;
  qrAction?: {
    label: string;
    icon: string;
    exit: boolean;
  };
  canTransfer: boolean;
}

export type CompraTicketCard = EntradaTicketCard | ProductoTicketCard | CoverTicketCard;

export type CompraTicketAction =
  | 'activate'
  | 'cancel-transfer'
  | 'send'
  | 'use-profile'
  | 'transfer'
  | 'view-qr';

@Component({
  selector: 'app-compra-ticket-card',
  standalone: true,
  imports: [CommonModule, RouterModule, EvNotice],
  templateUrl: './compra-ticket-card.html',
  styleUrl: './compra-ticket-card.css',
})
export class CompraTicketCardComponent {
  @Input({ required: true }) card!: CompraTicketCard;
  @Output() action = new EventEmitter<CompraTicketAction>();

  get isPassCard(): boolean {
    return this.card.kind === 'entrada' || this.card.kind === 'producto';
  }

  get isPassUsed(): boolean {
    if (this.card.kind === 'entrada') return this.card.used;
    if (this.card.kind === 'producto') return this.card.redeemed;
    return false;
  }

  get hasPassTalon(): boolean {
    if (this.card.kind === 'entrada') return this.card.hasTalon;
    if (this.card.kind === 'producto') return true;
    return false;
  }

  onCardClick(event: Event): void {
    if (!this.card.clickable || this.isInteractiveTarget(event.target)) return;
    this.action.emit('activate');
  }

  emitAction(action: CompraTicketAction, event: Event): void {
    event.stopPropagation();
    this.action.emit(action);
  }

  private isInteractiveTarget(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest('button, a, input, select, textarea');
  }
}
