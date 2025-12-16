/**
 * Utilidades para manejo de fechas y horas con zona horaria
 * Soluciona problemas de conversión entre UTC y zona horaria local
 */

export class DateTimeUtil {
  /**
   * Obtiene la zona horaria del navegador
   */
  static getTimezone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  /**
   * Obtiene el offset de zona horaria en minutos
   */
  static getTimezoneOffset(): number {
    return new Date().getTimezoneOffset();
  }

  /**
   * Convierte una fecha local a UTC
   * Útil para guardar en base de datos
   * Nota: getTime() ya devuelve milisegundos UTC, así que toISOString() es correcto
   */
  static localToUTC(date: Date): string {
    // toISOString() ya convierte correctamente a UTC
    return date.toISOString();
  }

  /**
   * Convierte una fecha UTC a hora local para mostrar
   * Útil para mostrar fechas desde la base de datos
   * Nota: new Date(utcString) ya interpreta correctamente la fecha UTC
   */
  static utcToLocal(utcString: string): Date {
    // new Date() ya interpreta correctamente las fechas ISO en UTC
    return new Date(utcString);
  }

  /**
   * Obtiene la fecha actual en formato ISO para guardar en BD
   * Considera la zona horaria local
   */
  static nowISO(): string {
    return this.localToUTC(new Date());
  }

  /**
   * Obtiene la fecha de hoy a las 00:00:00 en zona horaria local
   * Convertida a UTC para comparar con fechas de BD que están en UTC
   */
  static todayStart(): string {
    const now = new Date();
    const localDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    
    // Convertir la fecha local a UTC
    // Si es 2025-10-30 00:00:00 en Colombia (UTC-5), debe ser 2025-10-30 05:00:00 UTC
    const offsetMs = localDate.getTimezoneOffset() * 60000;
    const utcDate = new Date(localDate.getTime() - offsetMs);
    
    return utcDate.toISOString();
  }

  /**
   * Obtiene la fecha de hoy a las 23:59:59 en zona horaria local
   * Convertida a UTC para comparar con fechas de BD que están en UTC
   */
  static todayEnd(): string {
    const now = new Date();
    const localDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    // Convertir la fecha local a UTC
    // Si es 2025-10-30 23:59:59 en Colombia (UTC-5), debe ser 2025-10-31 04:59:59 UTC
    const offsetMs = localDate.getTimezoneOffset() * 60000;
    const utcDate = new Date(localDate.getTime() - offsetMs);
    
    return utcDate.toISOString();
  }

  /**
   * Formatea una fecha para mostrar en la interfaz
   * Usa la zona horaria local del usuario
   */
  static formatForDisplay(dateString: string, options?: Intl.DateTimeFormatOptions): string {
    const date = new Date(dateString);
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Bogota' // Forzar zona horaria de Colombia
    };
    
    return date.toLocaleString('es-CO', { ...defaultOptions, ...options });
  }

  /**
   * Formatea solo la fecha (sin hora) para mostrar
   */
  static formatDateOnly(dateString: string): string {
    return this.formatForDisplay(dateString, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  /**
   * Formatea solo la hora para mostrar
   */
  static formatTimeOnly(dateString: string): string {
    return this.formatForDisplay(dateString, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Formatea fecha y hora específicamente para promociones
   * SIN conversión de zona horaria - muestra exactamente la hora guardada
   */
  static formatPromocionDateTime(dateString: string): string {
    if (!dateString) return 'No especificado';
    
    // Extraer fecha y hora directamente del string ISO
    // Formato: 2025-10-24T17:21:00.000Z
    const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    
    if (!isoMatch) {
      return 'Fecha inválida';
    }
    
    const [, year, month, day, hours, minutes] = isoMatch;
    
    // Crear fecha directamente con los valores extraídos
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
    
    // Formatear SIN conversión de zona horaria
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    };
    
    return date.toLocaleString('es-CO', options);
  }

  /**
   * Crea un objeto Date desde un string de fecha/hora local
   * Útil para inputs de fecha/hora
   */
  static createFromLocalString(dateTimeString: string): Date {
    // Si viene en formato ISO, convertir a local
    if (dateTimeString.includes('T')) {
      return new Date(dateTimeString);
    }
    
    // Si viene en formato local, crear Date directamente
    return new Date(dateTimeString);
  }

  /**
   * Convierte un input de datetime-local a ISO string para BD
   * SIN conversión de zona horaria - guarda exactamente la hora seleccionada
   */
  static datetimeLocalToISO(dateTimeLocalString: string): string {
    // Simplemente agregar segundos y Z para formato ISO
    // Si seleccionas 9:00 AM, se guarda como 9:00 AM UTC
    return `${dateTimeLocalString}:00.000Z`;
  }

  /**
   * Convierte una fecha ISO a formato datetime-local para inputs
   * SIN conversión de zona horaria - muestra exactamente la hora guardada
   */
  static isoToDatetimeLocal(isoString: string): string {
    // Simplemente extraer la parte de fecha y hora sin conversión
    // Si se guardó 9:00 AM, se muestra 9:00 AM
    return isoString.slice(0, 16);
  }

  /**
   * Calcula fechas de rango para reportes considerando zona horaria
   */
  static calculateDateRange(tipo: 'hoy' | 'semana' | 'mes' | 'personalizado', fechaInicio?: string, fechaFin?: string): { fechaInicio: string; fechaFin: string } {
    const ahora = new Date();
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

    switch (tipo) {
      case 'hoy':
        return {
          fechaInicio: this.todayStart(),
          fechaFin: this.todayEnd()
        };
      
      case 'semana':
        const inicioSemana = new Date(hoy);
        inicioSemana.setDate(hoy.getDate() - 7);
        inicioSemana.setHours(0, 0, 0, 0);
        const finSemana = new Date(hoy);
        finSemana.setHours(23, 59, 59, 999);
        return {
          fechaInicio: this.localToUTC(inicioSemana),
          fechaFin: this.localToUTC(finSemana)
        };
      
      case 'mes':
        const inicioMes = new Date(hoy);
        inicioMes.setDate(hoy.getDate() - 30);
        inicioMes.setHours(0, 0, 0, 0);
        const finMes = new Date(hoy);
        finMes.setHours(23, 59, 59, 999);
        return {
          fechaInicio: this.localToUTC(inicioMes),
          fechaFin: this.localToUTC(finMes)
        };
      
      case 'personalizado':
        if (!fechaInicio || !fechaFin) {
          return { fechaInicio: this.todayStart(), fechaFin: this.todayEnd() };
        }
        
        const inicioPersonalizado = new Date(fechaInicio);
        const finPersonalizado = new Date(fechaFin);
        inicioPersonalizado.setHours(0, 0, 0, 0);
        finPersonalizado.setHours(23, 59, 59, 999);
        
        return {
          fechaInicio: this.localToUTC(inicioPersonalizado),
          fechaFin: this.localToUTC(finPersonalizado)
        };
      
      default:
        return { fechaInicio: this.todayStart(), fechaFin: this.todayEnd() };
    }
  }

  /**
   * Verifica si una fecha está en el rango de hoy (considerando zona horaria)
   */
  static isToday(dateString: string): boolean {
    const date = new Date(dateString);
    const today = new Date();
    
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  /**
   * Obtiene información de zona horaria para debugging
   */
  static getTimezoneInfo(): any {
    return {
      timezone: this.getTimezone(),
      offset: this.getTimezoneOffset(),
      offsetHours: this.getTimezoneOffset() / 60,
      currentTime: new Date().toISOString(),
      localTime: new Date().toString()
    };
  }
}

