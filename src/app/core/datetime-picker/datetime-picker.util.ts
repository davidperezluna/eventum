const MONTHS_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

const MONTHS_FULL_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const WEEKDAYS_ES = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];

export interface EvTimeSlot {
  value: string;
  label: string;
}

export function splitDatetimeLocal(value: string | null | undefined): { date: string; time: string } {
  if (!value?.includes('T')) {
    return { date: '', time: '' };
  }
  const [date, timePart] = value.split('T');
  const time = timePart?.slice(0, 5) ?? '';
  return { date: date ?? '', time };
}

export function joinDatetimeLocal(date: string, time: string): string {
  if (!date) return '';
  const safeTime = time || '12:00';
  return `${date}T${safeTime}`;
}

export function compareDatetimeLocal(a: string, b: string): number {
  const da = parseDatetimeLocal(a);
  const db = parseDatetimeLocal(b);
  if (!da && !db) return 0;
  if (!da) return -1;
  if (!db) return 1;
  return da.getTime() - db.getTime();
}

export function parseDatetimeLocal(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseDateOnly(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateDisplay(dateKey: string): string {
  const date = parseDateOnly(dateKey);
  if (!date) return 'Seleccionar fecha';
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatMonthYear(date: Date): string {
  return `${MONTHS_FULL_ES[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatTimeDisplay(time24: string): string {
  if (!time24) return 'Seleccionar hora';
  const [hStr, mStr] = time24.split(':');
  const hours = Number(hStr);
  const minutes = Number(mStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 'Seleccionar hora';
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function generateTimeSlots(intervalMinutes = 30): EvTimeSlot[] {
  const slots: EvTimeSlot[] = [];
  for (let total = 0; total < 24 * 60; total += intervalMinutes) {
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    slots.push({ value, label: formatTimeDisplay(value) });
  }
  return slots;
}

export function getCalendarWeekdayLabels(): string[] {
  return [...WEEKDAYS_ES];
}

export interface CalendarDayCell {
  date: Date;
  dateKey: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

export function buildCalendarMonth(viewDate: Date, selectedKey: string): CalendarDayCell[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  const todayKey = formatDateKey(new Date());
  const cells: CalendarDayCell[] = [];

  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const dateKey = formatDateKey(date);
    cells.push({
      date,
      dateKey,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
      isToday: dateKey === todayKey,
      isSelected: !!selectedKey && dateKey === selectedKey,
    });
  }

  return cells;
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function coerceToDatetimeLocalString(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 16);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function getRangeValidationMessage(start: string | Date | null | undefined, end: string | Date | null | undefined): string | null {
  const startValue = coerceToDatetimeLocalString(start);
  const endValue = coerceToDatetimeLocalString(end);
  if (!startValue || !endValue) return null;
  if (compareDatetimeLocal(startValue, endValue) >= 0) {
    return 'La fecha de inicio debe ser anterior a la de fin.';
  }
  return null;
}
