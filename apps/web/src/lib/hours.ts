import { localToMs, parseHM } from '@openchair/engine';

/** Orden de la semana para mostrar: lunes primero. Los números son los de la base (0 = domingo). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export interface HourRow {
  id: string;
  weekday: number;
  start_min: number;
  end_min: number;
}

export type ShiftResult = { ok: true; start_min: number; end_min: number } | { ok: false; error: string };

/**
 * "09:00" + "18:00" -> minutos. Si la hora final es menor que la inicial, el turno termina
 * al día siguiente (ej. 20:00 a 02:00).
 */
export function parseShift(start: string, end: string): ShiftResult {
  let s: number;
  let e: number;
  try {
    s = parseHM(start);
    e = parseHM(end);
  } catch {
    return { ok: false, error: 'Escribe las dos horas.' };
  }
  if (s >= 1440 || e >= 1440) return { ok: false, error: 'Las horas van de 00:00 a 23:59.' };
  if (s === e) return { ok: false, error: 'La hora final no puede ser igual a la inicial.' };
  return { ok: true, start_min: s, end_min: e > s ? e : e + 1440 };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** 540 -> "09:00"; 1560 -> "02:00 (día siguiente)" */
export function formatMinutes(m: number): string {
  const next = m >= 1440;
  const mm = next ? m - 1440 : m;
  return `${pad(Math.floor(mm / 60))}:${pad(mm % 60)}` + (next ? ' (día siguiente)' : '');
}

export function groupByDay(rows: HourRow[]): Record<number, HourRow[]> {
  const out: Record<number, HourRow[]> = {};
  for (const r of rows) (out[r.weekday] ??= []).push(r);
  for (const list of Object.values(out)) list.sort((a, b) => a.start_min - b.start_min);
  return out;
}

export function presetRows(days: number[], start_min: number, end_min: number) {
  return days.map((weekday) => ({ weekday, start_min, end_min }));
}

/** Valor de <input type="datetime-local"> ("2026-11-02T09:00") en hora local -> ISO UTC. */
export function localInputToIso(value: string, tzOffsetMinutes: number): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  if (!m) return null;
  try {
    return new Date(localToMs(m[1], m[2], tzOffsetMinutes)).toISOString();
  } catch {
    return null;
  }
}

export function isoToLocalInput(iso: string, tzOffsetMinutes: number): string {
  return new Date(Date.parse(iso) + tzOffsetMinutes * 60_000).toISOString().slice(0, 16);
}
