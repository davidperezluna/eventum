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
import { FaqAccordion, FaqItem } from '../../components/faq-accordion/faq-accordion';
import {
  EVENTUM_CONTACTO,
  buildGmailComposeUrl,
  buildWhatsappUrl,
} from '../../constants/contacto.constants';
import { cuposEventumEnabled } from '../../core/cupos-feature';
import { CUPOS_LABELS } from '../../core/cupos-labels';
import { ORGANIZADORES_METRICAS, OrganizadoresMetrica } from './organizadores-metrics';
import { environment } from '../../../environments/environment';

interface PromiseItem {
  icon: string;
  title: string;
  description: string;
}

interface BenefitCard {
  icon: string;
  title: string;
  description: string;
}

interface CompareRow {
  feature: string;
  others: boolean | 'partial';
  eventum: boolean;
}

interface HowStep {
  step: number;
  title: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-organizadores',
  standalone: true,
  imports: [CommonModule, RouterModule, FaqAccordion],
  templateUrl: './organizadores.html',
  styleUrl: './organizadores.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Organizadores implements OnInit, AfterViewInit, OnDestroy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly currentYear = new Date().getFullYear();
  readonly cuposEventumEnabled = cuposEventumEnabled;
  readonly cuposLabels = CUPOS_LABELS;
  readonly instagramUrl = EVENTUM_CONTACTO.instagramUrl;
  readonly metricas: OrganizadoresMetrica[] = ORGANIZADORES_METRICAS;
  readonly showcaseModeEnabled = environment.showcaseModeEnabled;

  readonly demoWhatsappUrl = buildWhatsappUrl(
    'Hola, quiero agendar una demostración de Eventum para operar mis eventos.'
  );
  readonly whatsappUrl = buildWhatsappUrl(EVENTUM_CONTACTO.defaultWhatsappMessage);
  readonly demoEmailUrl = buildGmailComposeUrl(
    'Agendar demostración — Eventum Organizadores',
    'Hola,\n\nQuiero agendar una demostración de Eventum para operar mis eventos.\n\nNombre:\nEmpresa / marca:\nTipo de eventos:\nCiudad:\n\n'
  );

  readonly promises: PromiseItem[] = [
    {
      icon: 'schedule',
      title: 'Más tiempo para producir tu evento',
      description: 'Nosotros nos encargamos de la operación.',
    },
    {
      icon: 'insights',
      title: 'Más control en tiempo real',
      description: 'Ventas, accesos y reportes desde un solo lugar.',
    },
    {
      icon: 'handshake',
      title: 'Un equipo que te acompaña',
      description: 'Antes, durante y después del evento.',
    },
  ];

  readonly benefits: BenefitCard[] = [
    {
      icon: 'confirmation_number',
      title: 'Llena tu evento',
      description: 'Publica tus entradas en minutos y vende desde cualquier dispositivo.',
    },
    {
      icon: 'qr_code_scanner',
      title: 'Evita filas y errores en la entrada',
      description: 'Escanea rápidamente cada asistente y sigue el acceso en tiempo real.',
    },
    {
      icon: 'payments',
      title: 'Recibe tu dinero con tranquilidad',
      description: 'Gestionamos el proceso de pago para que puedas enfocarte en el evento.',
    },
    {
      icon: 'storefront',
      title: 'Aumenta tus ingresos',
      description: 'Vende alimentos, bebidas y merchandising desde la misma operación.',
    },
    {
      icon: 'insights',
      title: 'Decide con información en tiempo real',
      description: 'Conoce cómo avanza tu evento mientras está ocurriendo.',
    },
    {
      icon: 'support_agent',
      title: 'No estarás solo',
      description: 'Nuestro equipo te acompaña antes, durante y después del evento.',
    },
  ];

  readonly compareRows: CompareRow[] = [
    { feature: 'Venta de entradas', others: true, eventum: true },
    { feature: 'Control de acceso', others: 'partial', eventum: true },
    { feature: 'Venta de productos', others: false, eventum: true },
    { feature: 'Transferencia de entradas', others: 'partial', eventum: true },
    { feature: 'Gestión de palcos', others: false, eventum: true },
    { feature: 'Reportes en tiempo real', others: 'partial', eventum: true },
    { feature: 'Tablón de compra y venta', others: false, eventum: true },
    { feature: 'Soporte operativo', others: false, eventum: true },
    { feature: 'Pagos seguros', others: true, eventum: true },
    { feature: 'Experiencia del comprador', others: 'partial', eventum: true },
  ];

  readonly steps: HowStep[] = [
    {
      step: 1,
      title: 'Montas tu evento',
      description: 'Defines fecha, lugar y lo que verá tu público.',
      icon: 'add_circle',
    },
    {
      step: 2,
      title: 'Abres la venta',
      description: 'Publicas entradas y empiezas a vender sin complicaciones.',
      icon: 'sell',
    },
    {
      step: 3,
      title: 'Operas con control',
      description: 'Sigues ventas, productos y el pulso del evento en un solo lugar.',
      icon: 'shopping_bag',
    },
    {
      step: 4,
      title: 'Controlas la puerta',
      description: 'Validas accesos y resuelves con claridad en vivo.',
      icon: 'verified_user',
    },
  ];

  readonly faqs: FaqItem[] = [
    {
      question: '¿Necesito contrato?',
      answer:
        'Sí. Trabajamos con un acuerdo claro según el tipo de evento y el volumen de operación. En la demostración te explicamos condiciones y tiempos con total transparencia, para que sepas exactamente en qué te estás metiendo.',
    },
    {
      question: '¿Cómo recibo mis pagos?',
      answer:
        'Los cobros se procesan de forma segura con Wompi. Cada venta queda registrada y puedes seguir tus ingresos con claridad. Tú te enfocas en vender; nosotros cuidamos que el dinero llegue por un proceso confiable.',
    },
    {
      question: '¿Cuánto cuesta?',
      answer:
        'Depende de tu operación: aforo, canales de venta y el acompañamiento que necesites. En la demostración te mostramos números concretos para tu caso, no una tarifa genérica que no aplica a tu realidad.',
    },
    {
      question: '¿Puedo vender productos?',
      answer:
        'Sí. Además de entradas puedes vender comidas, bebidas y merchandising en el mismo flujo de compra. Tu público paga una sola vez y tú aumentas ingresos sin sumar caos operativo.',
    },
    {
      question: '¿Qué pasa si tengo problemas durante el evento?',
      answer:
        'No te dejamos solo. Nuestro equipo te acompaña antes, durante y después. Si algo falla en puerta o en ventas, hay alguien para ayudarte a resolverlo en el momento — cuando más lo necesitas.',
    },
  ];

  private revealObserver?: IntersectionObserver;
  private previousTitle = '';

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

  scrollToComoFunciona(event: Event): void {
    event.preventDefault();
    const el = document.getElementById('como-funciona');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  compareIcon(value: boolean | 'partial'): string {
    if (value === true) return 'check_circle';
    if (value === 'partial') return 'remove_circle';
    return 'cancel';
  }

  compareLabel(value: boolean | 'partial'): string {
    if (value === true) return 'Incluido';
    if (value === 'partial') return 'Limitado o incompleto';
    return 'No incluido';
  }

  private applySeo(): void {
    const pageTitle = 'Para organizadores | Eventum — Opera tus eventos de principio a fin';
    const description =
      'Eventum centraliza venta de boletas, pagos, acceso, productos, reportes y soporte operativo. Agenda una demostración.';
    const url = `${(environment as { publicAppUrl?: string }).publicAppUrl || 'https://www.eventumcol.com'}/organizadores`;

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
