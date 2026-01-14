/* ============================================
   EXCEL EXPORT SERVICE
   Servicio para exportar reportes a Excel
   ============================================ */

import { Injectable } from '@angular/core';

// Importación dinámica de xlsx para evitar problemas con TypeScript
let XLSX: any;

@Injectable({
  providedIn: 'root'
})
export class ExcelExportService {
  
  /**
   * Carga xlsx de forma dinámica
   */
  private async loadXLSX(): Promise<any> {
    if (!XLSX) {
      XLSX = await import('xlsx');
    }
    return XLSX;
  }

  /**
   * Exporta datos a un archivo Excel
   */
  async exportToExcel(data: any[], filename: string, sheetName: string = 'Reporte'): Promise<void> {
    const xlsx = await this.loadXLSX();
    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Generar el archivo Excel
    xlsx.writeFile(workbook, `${filename}.xlsx`);
  }

  /**
   * Exporta múltiples hojas a un archivo Excel
   */
  async exportMultipleSheets(sheets: { name: string; data: any[] }[], filename: string): Promise<void> {
    const xlsx = await this.loadXLSX();
    const workbook = xlsx.utils.book_new();
    
    sheets.forEach(sheet => {
      const worksheet = xlsx.utils.json_to_sheet(sheet.data);
      xlsx.utils.book_append_sheet(workbook, worksheet, sheet.name);
    });
    
    xlsx.writeFile(workbook, `${filename}.xlsx`);
  }

  /**
   * Formatea un número como moneda colombiana
   */
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  /**
   * Formatea una fecha
   */
  formatDate(date: string | Date): string {
    const d = new Date(date);
    return d.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  /**
   * Obtiene el label de un método de pago
   */
  getMetodoPagoLabel(metodo: string): string {
    const labels: { [key: string]: string } = {
      'tarjeta_credito': 'Tarjeta de Crédito',
      'tarjeta_debito': 'Tarjeta de Débito',
      'transferencia': 'Transferencia',
      'efectivo': 'Efectivo',
      'pse': 'PSE',
      'nequi': 'Nequi',
      'daviplata': 'Daviplata',
      'puntos_colombia': 'Puntos Colombia',
      'bnpl_bancolombia': 'BNPL Bancolombia',
      'su_plus': 'SU Plus',
      'otro': 'Otro'
    };
    return labels[metodo] || metodo;
  }

  /**
   * Obtiene el label de un estado de pago
   */
  getEstadoPagoLabel(estado: string): string {
    const labels: { [key: string]: string } = {
      'pendiente': 'Pendiente',
      'completado': 'Completado',
      'fallido': 'Fallido',
      'reembolsado': 'Reembolsado',
      'cancelado': 'Cancelado'
    };
    return labels[estado] || estado;
  }

  /**
   * Obtiene el label de un estado de compra
   */
  getEstadoCompraLabel(estado: string): string {
    const labels: { [key: string]: string } = {
      'pendiente': 'Pendiente',
      'confirmada': 'Confirmada',
      'cancelada': 'Cancelada',
      'reembolsada': 'Reembolsada'
    };
    return labels[estado] || estado;
  }

  /**
   * Obtiene el label de un estado de evento
   */
  getEstadoEventoLabel(estado: string): string {
    const labels: { [key: string]: string } = {
      'borrador': 'Borrador',
      'publicado': 'Publicado',
      'finalizado': 'Finalizado',
      'cancelado': 'Cancelado'
    };
    return labels[estado] || estado;
  }
}
