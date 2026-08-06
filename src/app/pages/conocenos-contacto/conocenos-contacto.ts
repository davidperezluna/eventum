import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  EVENTUM_CONTACTO,
  buildGmailComposeUrl,
  buildWhatsappUrl,
} from '../../constants/contacto.constants';

@Component({
  selector: 'app-conocenos-contacto',
  imports: [CommonModule, RouterModule],
  templateUrl: './conocenos-contacto.html',
  styleUrl: './conocenos-contacto.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ConocenosContacto {
  readonly currentYear = new Date().getFullYear();
  readonly email = EVENTUM_CONTACTO.email;
  readonly instagramUrl = EVENTUM_CONTACTO.instagramUrl;
  readonly whatsappMessage = EVENTUM_CONTACTO.defaultWhatsappMessage;

  get whatsappUrl(): string {
    return buildWhatsappUrl(this.whatsappMessage);
  }

  get correoTrabajaConNosotrosUrl(): string {
    return buildGmailComposeUrl(
      'Trabajar con Eventum / Baria Dev',
      'Hola,\n\nMe interesa trabajar o colaborar con ustedes. Les cuento un poco:\n\n'
    );
  }

  get correoContactoUrl(): string {
    return buildGmailComposeUrl(
      'Contacto Eventum',
      'Hola,\n\nQuiero recibir información sobre Eventum.\n\n'
    );
  }
}
