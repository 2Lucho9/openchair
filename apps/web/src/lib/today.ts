import {
  addDays,
  dayOfWeek,
  freeSlots,
  localMidnight,
  toLocalDate,
  type Appointment,
  type AppointmentStatus,
  type Interval,
  type Schedule,
  type WeeklyHours,
} from '@openchair/engine';

export interface WorkingHoursRow {
  weekday: number;
  start_min: number;
  end_min: number;
}

export interface AppointmentRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  service_name: string;
}

export function buildSchedule(rows: WorkingHoursRow[], tzOffsetMinutes: number): Schedule {
  const weekly: WeeklyHours = {};
  for (const r of rows) {
    (weekly[r.weekday] ??= []).push({ start: r.start_min, end: r.end_min });
  }
  for (const list of Object.values(weekly)) list?.sort((a, b) => a.start - b.start);
  return { tzOffsetMinutes, weekly };
}

export function toEngineAppointments(rows: AppointmentRow[]): Appointment[] {
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    start: Date.parse(r.starts_at),
    end: Date.parse(r.ends_at),
  }));
}

/** Rango UTC (ISO) del día local de `now`, para pedirle a la base solo las citas de hoy. */
export function todayRange(now: number, tzOffsetMinutes: number) {
  const date = toLocalDate(now, tzOffsetMinutes);
  const start = localMidnight(date, tzOffsetMinutes);
  const end = localMidnight(addDays(date, 1), tzOffsetMinutes);
  return { date, startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString() };
}

export interface TodayView {
  date: string;
  hasHours: boolean;
  freeStarts: Interval[];
}

/** Sillas libres de hoy para un servicio de `durationMin`, según horario, citas y margen. */
export function buildTodayView(opts: {
  now: number;
  schedule: Schedule;
  appointments: AppointmentRow[];
  durationMin: number;
  bufferMin: number;
  stepMin: number;
  minNoticeMin: number;
}): TodayView {
  const date = toLocalDate(opts.now, opts.schedule.tzOffsetMinutes);
  const hasHours = (opts.schedule.weekly[dayOfWeek(date)] ?? []).length > 0;
  const freeStarts = hasHours
    ? freeSlots({
        date,
        durationMin: opts.durationMin,
        bufferMin: opts.bufferMin,
        stepMin: opts.stepMin,
        minNoticeMin: opts.minNoticeMin,
        now: opts.now,
        schedule: opts.schedule,
        appointments: toEngineAppointments(opts.appointments),
      })
    : [];
  return { date, hasHours, freeStarts };
}
