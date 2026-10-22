import { mergeIntervals } from './intervals';
import { MINUTE_MS, addDays, dayOfWeek, localMidnight } from './time';
import type { Interval, Schedule, WeeklyHours } from './types';

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/** Devuelve una lista de problemas en espanol; vacia si el horario es valido. */
export function validateWeeklyHours(weekly: WeeklyHours): string[] {
  const problems: string[] = [];

  for (let dow = 0; dow < 7; dow++) {
    const name = DAY_NAMES[dow];
    const shifts = weekly[dow] ?? [];

    for (const s of shifts) {
      if (!Number.isFinite(s.start) || !Number.isFinite(s.end)) {
        problems.push(`${name}: las horas deben ser numeros`);
        continue;
      }
      if (s.start < 0 || s.end > 2880) {
        problems.push(`${name}: las horas deben estar entre 00:00 y 48:00`);
      }
      if (s.end <= s.start) {
        problems.push(`${name}: la hora de fin debe ser mayor que la de inicio`);
      }
    }

    const sorted = [...shifts].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) {
        problems.push(`${name}: hay turnos que se cruzan`);
      }
    }

    for (const s of shifts) {
      if (s.end > 1440) {
        const overflow = s.end - 1440;
        for (const n of weekly[(dow + 1) % 7] ?? []) {
          if (n.start < overflow) {
            problems.push(
              `${name}: el turno que pasa de medianoche se cruza con el de ${DAY_NAMES[(dow + 1) % 7]}`,
            );
          }
        }
      }
    }
  }

  return problems;
}

/**
 * Intervalos de trabajo de las fechas locales [fromDate, toDate] (inclusive),
 * ya unidos: un turno que termina a medianoche y otro que empieza a medianoche
 * forman uno solo.
 */
export function workingIntervals(
  fromDate: string,
  toDate: string,
  schedule: Schedule,
): Interval[] {
  const out: Interval[] = [];
  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    const midnight = localMidnight(date, schedule.tzOffsetMinutes);
    for (const s of schedule.weekly[dayOfWeek(date)] ?? []) {
      if (s.end > s.start) {
        out.push({
          start: midnight + s.start * MINUTE_MS,
          end: midnight + s.end * MINUTE_MS,
        });
      }
    }
  }
  return mergeIntervals(out);
}
