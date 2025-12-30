import { Pipe, PipeTransform } from '@angular/core';
import { TimezoneService } from '../services/timezone.service';

/**
 * Pipe personalizado para formatear fechas en español
 * Usa el servicio de timezone para asegurar formato consistente
 */
@Pipe({
  name: 'dateFormat',
  standalone: true
})
export class DateFormatPipe implements PipeTransform {
  constructor(private timezoneService: TimezoneService) { }

  transform(value: string | Date | null | undefined, format: 'full' | 'short' | 'medium' | 'date' | 'time' | 'datetime' | 'shortDate' | 'day' | 'month' = 'short'): string {
    if (!value) return '';

    // Convertir a Date si es string
    // Asegurar que las fechas ISO se interpreten como UTC
    let date: Date;
    if (typeof value === 'string') {
      const dateStr = value.trim();
      // Si es formato ISO sin Z ni offset, agregar Z para forzar UTC
      if (dateStr.includes('T') && !dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
        date = new Date(dateStr + 'Z');
      } else {
        date = new Date(dateStr);
      }
    } else {
      date = value;
    }

    if (isNaN(date.getTime())) {
      return '';
    }

    switch (format) {
      case 'full':
        // Formato completo: "lunes, 30 de octubre de 2024, 3:45 PM"
        return this.timezoneService.formatDateTime(date, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

      case 'medium':
        // Formato medio: "30 oct 2024, 3:45 PM"
        return this.timezoneService.formatDateTime(date, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

      case 'short':
        // Formato corto: "30/10/2024, 3:45 PM"
        return this.timezoneService.formatDateTime(date, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

      case 'date':
        // Solo fecha: "30/10/2024"
        return this.timezoneService.formatDate(date, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });

      case 'time':
        // Solo hora: "3:45 PM"
        return date.toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: this.timezoneService.getCurrentTimezone()
        });

      case 'datetime':
        // Fecha y hora: "30/10/2024 3:45 PM"
        return this.timezoneService.formatDateTime(date, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

      case 'shortDate':
        // Solo fecha corta: "30/10/2024"
        return this.timezoneService.formatDate(date, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });

      case 'day':
        // Solo día: "30"
        return this.timezoneService.formatDate(date, {
          day: 'numeric'
        });

      case 'month':
        // Solo mes corto: "oct"
        return this.timezoneService.formatDate(date, {
          month: 'short'
        }).replace('.', '');

      default:
        return this.timezoneService.formatDateTime(date, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
    }
  }
}

