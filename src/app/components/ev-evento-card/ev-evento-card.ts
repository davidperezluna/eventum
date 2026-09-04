import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'ev-evento-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ev-evento-card.html',
  styleUrl: './ev-evento-card.css',
})
export class EvEventoCard {
  @Input() titulo = 'Tu evento';
  @Input() metaLine = '';
  @Input() coverUrl: string | null = null;
  @Input() iniciales = 'EV';
  @Input() estadoLabel = '';
  @Input() statusDotClass = 'ev-evento-card__status-dot--draft';
  @Input() showInactivo = false;
  /** null = no mostrar etiqueta de liquidación; true/false = Liquidado / Sin liquidar */
  @Input() liquidado: boolean | null = null;
  @Input() destacado = false;
  @Input() showStatus = true;
  @Input() menuOpen = false;
  @Input() hasMenu = false;
  @Input() interactive = true;
  @Input() titlePlaceholder = false;
  @Input() metaPlaceholder = false;
  /** Ruta al hacer click en la tarjeta (p. ej. inteligencia del evento). */
  @Input() cardRoute: string | null = null;

  imageReady = false;
  imageError = false;

  constructor(private router: Router) {}

  onCardClick(event: MouseEvent): void {
    if (!this.cardRoute) return;
    const target = event.target as HTMLElement;
    if (target.closest('.ev-evento-card__menu, .ev-evento-card__menu-btn, .ev-evento-card__menu-panel, a, button')) {
      return;
    }
    void this.router.navigateByUrl(this.cardRoute);
  }

  onCardKeydown(event: KeyboardEvent): void {
    if (!this.cardRoute || event.key !== 'Enter') return;
    event.preventDefault();
    void this.router.navigateByUrl(this.cardRoute);
  }

  onCoverLoad(): void {
    this.imageReady = true;
    this.imageError = false;
  }

  onCoverError(): void {
    this.imageReady = false;
    this.imageError = true;
  }
}
