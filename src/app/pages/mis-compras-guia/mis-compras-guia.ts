import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { buildWhatsappUrl } from '../../constants/contacto.constants';
import { PwaUpdateService } from '../../services/pwa-update.service';

@Component({
  selector: 'app-mis-compras-guia',
  imports: [CommonModule, RouterModule],
  templateUrl: './mis-compras-guia.html',
  styleUrl: './mis-compras-guia.css',
})
export class MisComprasGuia {
  readonly updates = inject(PwaUpdateService);
  readonly supportWhatsappUrl = buildWhatsappUrl('Hola, necesito ayuda con Eventum.');
}
