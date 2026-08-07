import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { MatCalendarHeader } from '@angular/material/datepicker';
import { DateTime } from 'luxon';

@Component({
  selector: 'ev-calendar-header',
  standalone: true,
  templateUrl: './ev-calendar-header.html',
  styleUrl: './ev-calendar-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class EvCalendarHeader extends MatCalendarHeader<DateTime> {
  get displayTitle(): string {
    const view = this.calendar.currentView;

    if (view === 'multi-year') {
      const range = this.periodButtonText
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\s*[-–—]\s*/g, '–');
      return `Años ${range}`;
    }

    if (view === 'year') {
      return this.periodButtonText;
    }

    const raw = this.periodButtonText;
    if (!raw) return '';
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }
}
