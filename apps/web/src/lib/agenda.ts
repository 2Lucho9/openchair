import { addDays, dayOfWeek, localMidnight, toLocalDate, type Reason } from '@openchair/engine';
import type { AgendaAppt } from './today';

export const REASON_TEXT: Record<Reason, string> = {
  duracion_invalida: 'La duración no es válida.',
  fuera_de_horario: 'Está fuera de tu horario de trabajo.',
  choque_cita: 'Se cruza con otra cita (o con su margen).',
  choque_bloqueo: 'Cae en un bloqueo (almuerzo, vacaciones…).',
};

export function reasonsText(reasons: Reason[]): string[] {
  return reasons.map((r) => REASON_TEXT[r] ?? String(r));
}

/** Los 7 días (lunes a domingo) de la semana que contiene `date`. */
export function weekDates(date: string): string[] {
  const monday = addDays(date, -((dayOfWeek(date) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function dayBounds(date: string, tzOffsetMinutes: number) {
  return { startMs: localMidnight(date, tzOffsetMinutes), endMs: localMidnight(addDays(date, 1), tzOffsetMinutes) };
}

const OCCUPYING = new Set(['scheduled', 'confirmed', 'completed']);

/** Citas que empiezan en `date` (hora local), ordenadas. */
export function appointmentsOfDay<T extends { starts_at: string }>(list: T[], date: string, tz: number): T[] {
  const { startMs, endMs } = dayBounds(date, tz);
  return list
    .filter((a) => {
      const t = Date.parse(a.starts_at);
      return t >= startMs && t < endMs;
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/** Cuántas citas que ocupan tiempo hay por día (para la tira de la semana). */
export function countByDay(list: Pick<AgendaAppt, 'starts_at' | 'status'>[], tz: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of list) {
    if (!OCCUPYING.has(a.status)) continue;
    const d = toLocalDate(Date.parse(a.starts_at), tz);
    out[d] = (out[d] ?? 0) + 1;
  }
  return out;
}

export const DAY_LETTER = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
