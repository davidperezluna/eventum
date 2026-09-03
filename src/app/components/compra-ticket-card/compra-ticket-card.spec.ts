import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  CompraTicketCardComponent,
  CoverTicketCard,
  EntradaTicketCard,
  ProductoTicketCard,
} from './compra-ticket-card';

describe('CompraTicketCardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompraTicketCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders an entry and emits its QR action', () => {
    const fixture = TestBed.createComponent(CompraTicketCardComponent);
    const card: EntradaTicketCard = {
      kind: 'entrada',
      title: 'General',
      price: '$ 50.000',
      reference: 'Compra TX-1',
      received: false,
      used: false,
      hasTalon: true,
      qr: { ready: true, icon: 'qr_code_2', title: 'Ver código QR', subtitle: 'Disponible' },
      clickable: true,
    };
    fixture.componentInstance.card = card;
    const actions: string[] = [];
    fixture.componentInstance.action.subscribe((action) => actions.push(action));
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('General');
    (element.querySelector('.ticket-action') as HTMLButtonElement).click();
    expect(actions).toEqual(['view-qr']);
  });

  it('renders a redeemed product order', () => {
    const fixture = TestBed.createComponent(CompraTicketCardComponent);
    const card: ProductoTicketCard = {
      kind: 'producto',
      purchaseLabel: 'Compra confirmada',
      purchaseMeta: '1 unidad',
      countLabel: '1 producto',
      items: [{
        name: 'Bebida',
        alcohol: true,
        badge: { label: 'Redimido', className: 'badge-warning' },
        quantityLine: '1 × $ 10.000',
      }],
      redeemed: true,
      total: '$ 10.000',
      clickable: false,
    };
    fixture.componentInstance.card = card;
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Productos retirados');
    expect(element.textContent).toContain('Bebida');
  });

  it('emits activate when the entry body is clicked', () => {
    const fixture = TestBed.createComponent(CompraTicketCardComponent);
    fixture.componentInstance.card = {
      kind: 'entrada',
      title: 'General',
      price: '$ 50.000',
      reference: 'Compra TX-1',
      received: false,
      used: false,
      hasTalon: false,
      clickable: true,
    };
    const actions: string[] = [];
    fixture.componentInstance.action.subscribe((action) => actions.push(action));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.ticket-card__body') as HTMLElement).click();
    expect(actions).toEqual(['activate']);
  });

  it('renders cover actions and emits transfer', () => {
    const fixture = TestBed.createComponent(CompraTicketCardComponent);
    const card: CoverTicketCard = {
      kind: 'cover',
      title: 'Cover general',
      reference: 'Cover recibido',
      received: true,
      badge: { label: 'Sin usar', className: 'badge-success' },
      dateTitle: 'viernes, 31 de julio',
      dateSubtitle: '8:00 p. m. – 2:00 a. m.',
      canTransfer: true,
      clickable: false,
    };
    fixture.componentInstance.card = card;
    const actions: string[] = [];
    fixture.componentInstance.action.subscribe((action) => actions.push(action));
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('.ticket-card__secondary-action') as HTMLButtonElement).click();
    expect(actions).toEqual(['transfer']);
  });
});
