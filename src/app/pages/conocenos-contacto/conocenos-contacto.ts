import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-conocenos-contacto',
  imports: [CommonModule, RouterModule],
  templateUrl: './conocenos-contacto.html',
  styleUrl: './conocenos-contacto.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ConocenosContacto {
  readonly currentYear = new Date().getFullYear();
  readonly email = 'eventumeventum1@gmail.com';
  readonly instagramUrl = 'https://www.instagram.com/eventumcol?igsh=MTFwMDNhbjI4aHZ2OQ==';
  readonly whatsappMessage = 'Hola, quiero recibir información sobre Eventum.';

  get whatsappUrl(): string {
    return this.buildWhatsappUrl(this.whatsappMessage);
  }

  get correoTrabajaConNosotrosUrl(): string {
    return this.buildGmailComposeUrl(
      'Trabajar con Eventum / Baria Dev',
      'Hola,\n\nMe interesa trabajar o colaborar con ustedes. Les cuento un poco:\n\n'
    );
  }

  get correoContactoUrl(): string {
    return this.buildGmailComposeUrl(
      'Contacto Eventum',
      'Hola,\n\nQuiero recibir información sobre Eventum.\n\n'
    );
  }

  private buildGmailComposeUrl(subject: string, body: string): string {
    const params = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: this.email,
      su: subject,
      body,
    });

    return `https://mail.google.com/mail/?${params.toString()}`;
  }

  private buildWhatsappUrl(message: string): string {
    const params = new URLSearchParams({ text: message });

    return `https://wa.me/573336126974?${params.toString()}`;
  }
}
