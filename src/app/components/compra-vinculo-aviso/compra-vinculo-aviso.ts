import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { COMPRA_COPY } from '../../core/compra-copy';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-compra-vinculo-aviso',
  imports: [CommonModule, RouterModule],
  templateUrl: './compra-vinculo-aviso.html',
  styleUrl: './compra-vinculo-aviso.css',
})
export class CompraVinculoAviso {
  @Input() emailCuenta = '';
  @Input() documentoIdentidad = '';
  @Input() esMixto = false;
  @Input() tieneBoletas = false;
  @Input() tieneProductos = false;
  @Input() returnUrlLogin = '/carrito';
  @Input() returnUrlCambiarCuenta = '/pago-wompi';
  @Input() ocultarCambiarCuenta = false;

  cambiandoCuenta = false;
  readonly compraCopy = COMPRA_COPY;

  constructor(
    private authService: AuthService,
    private alertService: AlertService,
  ) {}

  get tieneSesion(): boolean {
    return !!this.emailCuenta.trim();
  }

  async cambiarCuenta(): Promise<void> {
    if (this.cambiandoCuenta) {
      return;
    }
    this.cambiandoCuenta = true;
    const { error } = await this.authService.cambiarCuentaGoogle(this.returnUrlCambiarCuenta);
    if (error) {
      this.cambiandoCuenta = false;
      void this.alertService.warning(
        'No se pudo cambiar de cuenta',
        'Intenta de nuevo o cierra sesión desde Mi perfil.',
      );
    }
  }
}
