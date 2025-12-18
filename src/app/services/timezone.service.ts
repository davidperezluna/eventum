import { Injectable } from '@angular/core';
import { DateTimeUtil } from '../utils/date-time.util';

/**
 * Servicio para manejo centralizado de zona horaria
 * Proporciona métodos para configurar y obtener información de zona horaria
 */
@Injectable({
  providedIn: 'root'
})
export class TimezoneService {
  private currentTimezone: string = 'America/Bogota'; // Zona horaria por defecto para Colombia

  constructor() {
    this.initializeTimezone();
  }

  /**
   * Inicializa la zona horaria del sistema
   */
  private initializeTimezone(): void {
    // Intentar obtener la zona horaria del navegador
    const browserTimezone = DateTimeUtil.getTimezone();
    
    // Si es una zona horaria válida de Colombia, usarla
    if (this.isColombianTimezone(browserTimezone)) {
      this.currentTimezone = browserTimezone;
    }
    
    // Configurar la zona horaria en el sistema
    this.setSystemTimezone(this.currentTimezone);
  }

  /**
   * Verifica si una zona horaria es de Colombia
   */
  private isColombianTimezone(timezone: string): boolean {
    const colombianTimezones = [
      'America/Bogota',
      'America/Cartagena',
      'America/Cali',
      'America/Medellin',
      'America/Barranquilla'
    ];
    
    return colombianTimezones.includes(timezone);
  }

  /**
   * Configura la zona horaria del sistema
   */
  private setSystemTimezone(timezone: string): void {
    // Configurar Intl.DateTimeFormat para usar la zona horaria especificada
    try {
      // Verificar que la zona horaria sea válida
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      this.currentTimezone = timezone;
    } catch (error) {
    }
  }

  /**
   * Obtiene la zona horaria actual
   */
  getCurrentTimezone(): string {
    return this.currentTimezone;
  }

  /**
   * Establece una nueva zona horaria
   */
  setTimezone(timezone: string): void {
    this.setSystemTimezone(timezone);
  }

  /**
   * Obtiene información completa de zona horaria
   */
  getTimezoneInfo(): any {
    return {
      current: this.currentTimezone,
      browser: DateTimeUtil.getTimezone(), 
      offset: DateTimeUtil.getTimezoneOffset(),
      offsetHours: DateTimeUtil.getTimezoneOffset() / 60,
      isColombian: this.isColombianTimezone(this.currentTimezone),
      currentTime: new Date().toISOString(),
      localTime: new Date().toString() 
    };
  } 

  /**
   * Formatea una fecha usando la zona horaria configurada
   * La fecha debe venir en formato ISO (UTC) desde la base de datos
   */
  formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
    // Asegurar que la fecha se interprete como UTC si viene como string ISO
    let dateObj: Date;
    if (typeof date === 'string') {
      const dateStr = date.trim();
      if (dateStr.includes('T') && !dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
        // Formato ISO sin Z ni offset - asumir UTC
        dateObj = new Date(dateStr + 'Z');
      } else {
        dateObj = new Date(dateStr);
      }
    } else {
      dateObj = date;
    }
    
    const defaultOptions: Intl.DateTimeFormatOptions = {
      timeZone: this.currentTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    };
    
    return dateObj.toLocaleDateString('es-CO', { ...defaultOptions, ...options });
  }

  /**
   * Formatea una fecha y hora usando la zona horaria configurada
   * La fecha debe venir en formato ISO (UTC) desde la base de datos
   */
  formatDateTime(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
    // Asegurar que la fecha se interprete como UTC si viene como string ISO
    let dateObj: Date;
    if (typeof date === 'string') {
      // Si el string termina en Z o tiene formato ISO, new Date() lo interpreta como UTC
      // Si no, agregar Z para forzar interpretación UTC
      const dateStr = date.trim();
      if (dateStr.includes('T') && !dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
        // Formato ISO sin Z ni offset - asumir UTC
        dateObj = new Date(dateStr + 'Z');
      } else {
        dateObj = new Date(dateStr);
      }
    } else {
      dateObj = date;
    }
    
    const defaultOptions: Intl.DateTimeFormatOptions = {
      timeZone: this.currentTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    return dateObj.toLocaleString('es-CO', { ...defaultOptions, ...options });
  }

  /**
   * Obtiene la fecha actual en la zona horaria configurada
   */
  getCurrentDate(): Date {
    return new Date();
  }

  /**
   * Obtiene la fecha actual como string ISO en la zona horaria configurada
   */
  getCurrentDateISO(): string {
    return DateTimeUtil.nowISO();
  }

  /**
   * Convierte una fecha de la zona horaria local a UTC para guardar en BD
   */
  localToUTC(date: Date): string {
    return DateTimeUtil.localToUTC(date);
  }

  /**
   * Convierte una fecha UTC a la zona horaria local para mostrar
   */
  utcToLocal(utcString: string): Date {
    return DateTimeUtil.utcToLocal(utcString);
  }

  /**
   * Verifica si una fecha está en el rango de hoy (considerando zona horaria)
   */
  isToday(dateString: string): boolean {
    return DateTimeUtil.isToday(dateString);
  }

  /**
   * Obtiene el inicio del día en la zona horaria configurada
   */
  getTodayStart(): string {
    return DateTimeUtil.todayStart();
  }

  /**
   * Obtiene el final del día en la zona horaria configurada
   */
  getTodayEnd(): string {
    return DateTimeUtil.todayEnd();
  }

  /**
   * Calcula un rango de fechas considerando la zona horaria
   */
  calculateDateRange(tipo: 'hoy' | 'semana' | 'mes' | 'personalizado', fechaInicio?: string, fechaFin?: string): { fechaInicio: string; fechaFin: string } {
    return DateTimeUtil.calculateDateRange(tipo, fechaInicio, fechaFin);
  }

  /**
   * Convierte una fecha de input datetime-local a ISO string para guardar en BD
   * El input datetime-local viene en formato "YYYY-MM-DDTHH:mm" y representa la hora local
   */
  datetimeLocalToISO(datetimeLocalString: string): string {
    if (!datetimeLocalString) return '';
    // Crear Date desde el string (se interpreta como hora local)
    const localDate = new Date(datetimeLocalString);
    // Convertir a UTC usando toISOString
    return localDate.toISOString();
  }

  /**
   * Convierte una fecha ISO a formato datetime-local para inputs
   * Convierte desde UTC a la zona horaria local
   */
  isoToDatetimeLocal(isoString: string): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    // Obtener componentes en la zona horaria local
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
}

