export type OrgSalesRowKind = 'boleta' | 'palco' | 'producto' | 'mixta';

export interface OrgSalesRowModel {
  key: string;
  fecha: string;
  evento: string;
  compradorEmail: string;
  compradorNombre: string;
  tiposEntrada: string;
  total: number;
  /** Valor de lista cuando es manual/cortesía (subtotal). */
  valorLista: number;
  esManual: boolean;
  boletas: number;
  palcos: number;
  palcosNumeros: Array<string | number>;
  tipoVenta: string;
}
