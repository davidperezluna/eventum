import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { OrgSalesRowModel } from './org-sales-row.types';
import {
  orgSalesBuyerName,
  orgSalesDetalleEntradas,
  orgSalesEtiquetaMonto,
  orgSalesFechaCompleta,
  orgSalesFechaRelativa,
  orgSalesIcon,
  orgSalesKind,
  orgSalesMonto,
} from './org-sales-row.utils';

@Component({
  selector: 'li[org-sales-row], org-sales-row',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './org-sales-row.html',
  styleUrl: './org-sales-row.css',
  host: {
    class: 'org-sales-row',
    '[attr.data-kind]': 'kind',
  },
})
export class OrgSalesRow {
  @Input({ required: true }) venta!: OrgSalesRowModel;

  get kind(): string {
    return orgSalesKind(this.venta);
  }

  get icon(): string {
    return orgSalesIcon(this.venta);
  }

  get evento(): string {
    return this.venta.evento;
  }

  get monto(): string {
    return orgSalesMonto(this.venta);
  }

  get etiqueta(): string | null {
    return orgSalesEtiquetaMonto(this.venta);
  }

  get buyerName(): string {
    return orgSalesBuyerName(this.venta);
  }

  get buyerEmail(): string | null {
    return this.venta.compradorEmail && this.venta.compradorNombre
      ? this.venta.compradorEmail
      : null;
  }

  get detalleEntradas(): string {
    return orgSalesDetalleEntradas(this.venta);
  }

  get fechaRelativa(): string {
    return orgSalesFechaRelativa(this.venta.fecha);
  }

  get fechaCompleta(): string {
    return orgSalesFechaCompleta(this.venta.fecha);
  }
}
