import { Pipe, PipeTransform } from '@angular/core';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

@Pipe({ name: 'relativeTime', standalone: true })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    if (!value) return '';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(date.getTime())) return '';
    const diff = date.getTime() - Date.now();
    const abs = Math.abs(diff);
    const suffix = diff >= 0 ? 'from now' : 'ago';

    if (abs < MINUTE) return 'just now';
    if (abs < HOUR) return `${Math.round(abs / MINUTE)}m ${suffix}`;
    if (abs < DAY) return `${Math.round(abs / HOUR)}h ${suffix}`;
    if (abs < WEEK) return `${Math.round(abs / DAY)}d ${suffix}`;
    if (abs < MONTH) return `${Math.round(abs / WEEK)}w ${suffix}`;
    if (abs < YEAR) return `${Math.round(abs / MONTH)}mo ${suffix}`;
    return `${Math.round(abs / YEAR)}y ${suffix}`;
  }
}
