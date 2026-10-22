import { dayOfWeek, formatHM, toLocalDate } from '@openchair/engine';

const DAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-11-02" -> "lun 2 nov" */
export function formatDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${DAYS_SHORT[dayOfWeek(date)]} ${d} ${MONTHS_SHORT[m - 1]}`;
}

/** Instante -> "lun 2 nov, 09:00" en la hora local del negocio. */
export function formatDateTime(ms: number, tzOffsetMinutes: number): string {
  return `${formatDay(toLocalDate(ms, tzOffsetMinutes))}, ${formatHM(ms, tzOffsetMinutes)}`;
}

export const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Programada',
  confirmed: 'Confirmada',
  completed: 'Completada',
  no_show: 'No asistió',
  cancelled: 'Cancelada',
};

export const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  sinpe: 'SINPE',
  transfer: 'Transferencia',
  other: 'Otro',
};
