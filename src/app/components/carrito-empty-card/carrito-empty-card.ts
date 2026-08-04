import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { coversEventumEnabled } from '../../core/covers-feature';

@Component({
  selector: 'app-carrito-empty-card',
  imports: [CommonModule, RouterModule],
  templateUrl: './carrito-empty-card.html',
  styleUrl: './carrito-empty-card.css',
})
export class CarritoEmptyCard {
  readonly coversEventumEnabled = coversEventumEnabled;
}
