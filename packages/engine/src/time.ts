export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;
/** Costa Rica: UTC-6 todo el ano. */
export const CR_OFFSET_MINUTES = -360;

function parseDate(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`Fecha invalida: "${date}" (usa AAAA-MM-DD)`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    throw new RangeError(`Fecha invalida: "${date}"`);
  }
  return [y, mo, d];
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Instante de la medianoche local de `date` (AAAA-MM-DD). */
export function localMidnight(date: string, tzOffsetMinutes: number): number {
  const [y, mo, d] = parseDate(date);
  return Date.UTC(y, mo - 1, d) - tzOffsetMinutes * MINUTE_MS;
}

/** Fecha local (AAAA-MM-DD) de un instante. */
export function toLocalDate(ms: number, tzOffsetMinutes: number): string {
  return new Date(ms + tzOffsetMinutes * MINUTE_MS).toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sabado. */
export function dayOfWeek(date: string): number {
  const [y, mo, d] = parseDate(date);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, mo, d] = parseDate(date);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

/** "09:30" -> 570. Acepta hasta 47:59 para turnos que cruzan medianoche ("26:00"). */
export function parseHM(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) throw new RangeError(`Hora invalida: "${hm}" (usa HH:MM)`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 47 || min > 59) throw new RangeError(`Hora invalida: "${hm}"`);
  return h * 60 + min;
}

/** Instante de una hora local ("HH:MM" o minutos desde medianoche) en `date`. */
export function localToMs(
  date: string,
  time: string | number,
  tzOffsetMinutes: number,
): number {
  const minutes = typeof time === 'number' ? time : parseHM(time);
  return localMidnight(date, tzOffsetMinutes) + minutes * MINUTE_MS;
}

/** Hora local "HH:MM" de un instante. */
export function formatHM(ms: number, tzOffsetMinutes: number): string {
  const d = new Date(ms + tzOffsetMinutes * MINUTE_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
