import { contains, overlaps } from './intervals';
import { workingIntervals } from './schedule';
import { DAY_MS, MINUTE_MS, addDays, localMidnight, toLocalDate } from './time';
import type { Appointment, AppointmentStatus, Interval, Schedule } from './types';

export type Reason =
  | 'duracion_invalida'
  | 'fuera_de_horario'
  | 'choque_cita'
  | 'choque_bloqueo';

export interface SlotContext {
  schedule: Schedule;
  appointments: Appointment[];
  /** Bloqueos: vacaciones, almuerzo, permisos. */
  timeOff?: Interval[];
  /** Minutos de margen despues de cada cita (limpieza, descanso). */
  bufferMin?: number;
  /** Cita a ignorar (al reprogramarla). */
  excludeId?: string;
  /** Permite agendar fuera del horario habitual. */
  ignoreWorkingHours?: boolean;
}

export interface SlotCheck {
  ok: boolean;
  reasons: Reason[];
  conflicts: Appointment[];
}

/** Canceladas y "no asistio" liberan el espacio; las demas lo ocupan. */
export function occupiesTime(status: AppointmentStatus): boolean {
  return status === 'scheduled' || status === 'confirmed' || status === 'completed';
}

function withBuffer(i: Interval, bufferMin: number): Interval {
  return { start: i.start, end: i.end + bufferMin * MINUTE_MS };
}

export function findConflicts(
  candidate: Interval,
  appointments: Appointment[],
  opts: { bufferMin?: number; excludeId?: string } = {},
): Appointment[] {
  const buffer = opts.bufferMin ?? 0;
  if (!(buffer >= 0)) throw new RangeError('bufferMin no puede ser negativo');
  const cand = withBuffer(candidate, buffer);
  return appointments.filter(
    (a) =>
      a.id !== opts.excludeId &&
      occupiesTime(a.status) &&
      overlaps(cand, withBuffer(a, buffer)),
  );
}

export function findTimeOffConflicts(candidate: Interval, timeOff: Interval[] = []): Interval[] {
  return timeOff.filter((t) => overlaps(candidate, t));
}

/** Valida una cita concreta contra horario, otras citas y bloqueos. */
export function checkSlot(candidate: Interval, ctx: SlotContext): SlotCheck {
  if (!(candidate.end > candidate.start)) {
    return { ok: false, reasons: ['duracion_invalida'], conflicts: [] };
  }

  const reasons: Reason[] = [];

  if (!ctx.ignoreWorkingHours) {
    const tz = ctx.schedule.tzOffsetMinutes;
    const from = addDays(toLocalDate(candidate.start, tz), -1);
    const to = addDays(toLocalDate(candidate.end - 1, tz), 1);
    const inside = workingIntervals(from, to, ctx.schedule).some((w) => contains(w, candidate));
    if (!inside) reasons.push('fuera_de_horario');
  }

  const conflicts = findConflicts(candidate, ctx.appointments, {
    bufferMin: ctx.bufferMin,
    excludeId: ctx.excludeId,
  });
  if (conflicts.length > 0) reasons.push('choque_cita');

  if (findTimeOffConflicts(candidate, ctx.timeOff).length > 0) reasons.push('choque_bloqueo');

  return { ok: reasons.length === 0, reasons, conflicts };
}

export interface FreeSlotsOptions extends Omit<SlotContext, 'ignoreWorkingHours'> {
  /** Fecha local AAAA-MM-DD. */
  date: string;
  durationMin: number;
  /** Cada cuantos minutos se ofrece un horario (por defecto 30). */
  stepMin?: number;
  /** Instante actual: no se ofrecen horarios anteriores a now + minNoticeMin. */
  now?: number;
  minNoticeMin?: number;
}

/**
 * Horarios de inicio disponibles para un servicio en una fecha local.
 * Los horarios caen en una cuadricula desde la medianoche (con paso 30: :00 y :30).
 * Incluye los que empiezan ese dia aunque terminen despues de medianoche.
 */
export function freeSlots(opts: FreeSlotsOptions): Interval[] {
  const { date, durationMin, schedule } = opts;
  const step = opts.stepMin ?? 30;
  if (!(durationMin > 0)) throw new RangeError('durationMin debe ser mayor que 0');
  if (!(step > 0)) throw new RangeError('stepMin debe ser mayor que 0');

  const tz = schedule.tzOffsetMinutes;
  const dayStart = localMidnight(date, tz);
  const dayEnd = dayStart + DAY_MS;
  const stepMs = step * MINUTE_MS;
  const durMs = durationMin * MINUTE_MS;
  const earliest =
    opts.now === undefined ? -Infinity : opts.now + (opts.minNoticeMin ?? 0) * MINUTE_MS;

  const slots: Interval[] = [];
  for (const w of workingIntervals(addDays(date, -1), addDays(date, 1), schedule)) {
    const lo = Math.max(w.start, dayStart);
    const hi = Math.min(w.end, dayEnd);
    let t = dayStart + Math.ceil((lo - dayStart) / stepMs) * stepMs;
    for (; t < hi && t + durMs <= w.end; t += stepMs) {
      if (t < earliest) continue;
      const cand = { start: t, end: t + durMs };
      if (
        findConflicts(cand, opts.appointments, {
          bufferMin: opts.bufferMin,
          excludeId: opts.excludeId,
        }).length === 0 &&
        findTimeOffConflicts(cand, opts.timeOff).length === 0
      ) {
        slots.push(cand);
      }
    }
  }
  return slots;
}
