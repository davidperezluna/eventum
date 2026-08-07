import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import {
  EVENTUM_CONTACTO,
  buildGmailComposeUrl,
  buildWhatsappUrl,
} from '../../constants/contacto.constants';
import { cuposEventumEnabled } from '../../core/cupos-feature';
import { CUPOS_LABELS } from '../../core/cupos-labels';
import { environment } from '../../../environments/environment';

interface PromiseItem {
  icon: string;
  title: string;
  description: string;
}

interface AlianzaPoint {
  icon: string;
  title: string;
  description: string;
}

interface AudienceCard {
  icon: string;
  title: string;
  description: string;
  link?: string;
  linkLabel?: string;
}

interface ValueCard {
  icon: string;
  title: string;
  description: string;
}

interface WompiFeature {
  icon: string;
  title: string;
  description: string;
}

interface ContactChannel {
  icon: string;
  ionIcon: string;
  label: string;
  hint: string;
  href: string;
  modifier: string;
}

@Component({
  selector: 'app-conocenos-contacto',
  imports: [CommonModule, RouterModule],
  templateUrl: './conocenos-contacto.html',
  styleUrls: ['./conocenos-contacto.css', '../organizadores/organizadores.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ConocenosContacto implements OnInit, AfterViewInit, OnDestroy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly currentYear = new Date().getFullYear();
  readonly email = EVENTUM_CONTACTO.email;
  readonly instagramUrl = EVENTUM_CONTACTO.instagramUrl;
  readonly cuposEventumEnabled = cuposEventumEnabled;
  readonly cuposLabels = CUPOS_LABELS;
  readonly whatsappMessage = EVENTUM_CONTACTO.defaultWhatsappMessage;

  readonly promises: PromiseItem[] = [
    {
      icon: 'confirmation_number',
      title: 'Boletas digitales',
      description: 'Compra segura y acceso con QR al instante.',
    },
    {
      icon: 'payments',
      title: 'Pagos Wompi',
      description: 'Cifrado y estándares internacionales.',
    },
    {
      icon: 'support_agent',
      title: 'Equipo humano',
      description: 'Soporte antes, durante y después del evento.',
    },
  ];

  readonly alianzaPoints: AlianzaPoint[] = [
    {
      icon: 'event_available',
      title: 'Publica con nosotros',
      description: 'Inventario, reportes y cobros en un solo flujo.',
    },
    {
      icon: 'handshake',
      title: 'Alianzas',
      description: 'Patrocinios, activaciones y contenido con nuestra comunidad.',
    },
    {
      icon: 'groups',
      title: 'Equipo y partners tech',
      description: 'Integraciones, white-label y roadmap compartido.',
    },
  ];

  readonly audiences: AudienceCard[] = [
    {
      icon: 'celebration',
      title: 'Para asistentes',
      description:
        'Descubre conciertos y cultura, compra con tranquilidad y lleva tu boleta en el móvil. Nosotros cuidamos pagos, QR y soporte.',
      link: '/eventos-cliente',
      linkLabel: 'Explorar eventos',
    },
    {
      icon: 'business_center',
      title: 'Para organizadores',
      description:
        'Publica tu evento, configura entradas y sigue cada venta con métricas en tiempo real. Nos encargamos de lo operativo para que llenes el escenario.',
      link: '/organizadores',
      linkLabel: 'Ver propuesta para organizadores',
    },
  ];

  readonly values: ValueCard[] = [
    { icon: 'verified', title: 'Compra segura', description: 'Pagos protegidos y confirmación inmediata.' },
    { icon: 'qr_code', title: 'QR dinámico', description: 'Acceso ágil y trazable en puerta.' },
    { icon: 'support_agent', title: 'Soporte humano', description: 'Personas reales cuando las necesitas.' },
    { icon: 'insights', title: 'Métricas claras', description: 'Datos útiles para decidir en vivo.' },
    { icon: 'event_note', title: 'Gestión completa', description: 'De la venta al cierre de operación.' },
    { icon: 'payments', title: 'Wompi integrado', description: 'Infraestructura de pagos de confianza.' },
  ];

  readonly wompiFeatures: WompiFeature[] = [
    {
      icon: 'lock',
      title: 'Encriptación SSL/TLS',
      description: 'Tráfico cifrado de nivel bancario; no guardamos datos de pago en nuestros servidores.',
    },
    {
      icon: 'verified_user',
      title: 'Certificación PCI DSS',
      description: 'Infraestructura certificada PCI DSS Level 1 para el procesamiento de pagos.',
    },
    {
      icon: 'shield',
      title: 'Protección contra fraude',
      description: 'Análisis y bloqueo de operaciones sospechosas en tiempo real.',
    },
  ];

  private revealObserver?: IntersectionObserver;
  private previousTitle = '';

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

  get contactChannels(): ContactChannel[] {
    return [
      {
        icon: 'photo_camera',
        ionIcon: 'logo-instagram',
        label: 'Instagram',
        hint: 'Novedades y detrás de cámaras',
        href: this.instagramUrl,
        modifier: 'ig',
      },
      {
        icon: 'chat',
        ionIcon: 'logo-whatsapp',
        label: 'WhatsApp',
        hint: 'Respuesta ágil para dudas rápidas',
        href: this.whatsappUrl,
        modifier: 'wa',
      },
      {
        icon: 'mail',
        ionIcon: 'mail',
        label: 'Correo',
        hint: this.email,
        href: this.correoContactoUrl,
        modifier: 'mail',
      },
    ];
  }

  ngOnInit(): void {
    this.previousTitle = this.title.getTitle();
    this.applySeo();
  }

  ngAfterViewInit(): void {
    this.setupRevealAnimations();
  }

  ngOnDestroy(): void {
    this.revealObserver?.disconnect();
    if (this.previousTitle) {
      this.title.setTitle(this.previousTitle);
    }
  }

  scrollToContacto(event: Event): void {
    event.preventDefault();
    document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  scrollToAlianza(event: Event): void {
    event.preventDefault();
    document.getElementById('trabaja-con-nosotros')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private applySeo(): void {
    const pageTitle = 'Conócenos | Eventum — Experiencias, tecnología y comunidad';
    const description =
      'Eventum conecta organizadores y asistentes con boletas digitales, pagos Wompi y soporte humano. Trabaja con nosotros o contáctanos.';
    const url = `${(environment as { publicAppUrl?: string }).publicAppUrl || 'https://www.eventumcol.com'}/conocenos`;

    this.title.setTitle(pageTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: 'index,follow' });
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:locale', content: 'es_CO' });
    this.meta.updateTag({ property: 'og:site_name', content: 'Eventum' });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: pageTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
  }

  private setupRevealAnimations(): void {
    const nodes = Array.from(
      this.host.nativeElement.querySelectorAll('.org-reveal')
    ) as HTMLElement[];

    if (typeof IntersectionObserver === 'undefined') {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return;
    }

    this.revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            this.revealObserver?.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );

    nodes.forEach((node) => this.revealObserver?.observe(node));
  }
}
