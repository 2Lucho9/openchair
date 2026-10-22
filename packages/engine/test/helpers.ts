import {
  CR_OFFSET_MINUTES,
  formatHM,
  localToMs,
  parseHM,
  type Appointment,
  type AppointmentStatus,
  type Interval,
  type Schedule,
  type WeeklyHours,
} from '../src';

export const TZ = CR_OFFSET_MINUTES;
export const WED = '2026-10-21';
export const FRI = '2026-10-23';
export const SAT = '2026-10-24';

export const at = (hm: string, date: string = WED): number => localToMs(date, hm, TZ);

export const iv = (from: string, to: string, date: string = WED): Interval => ({
  start: at(from, date),
  end: at(to, date),
});

export const appt = (
  id: string,
  from: string,
  to: string,
  status: AppointmentStatus = 'scheduled',
  date: string = WED,
): Appointment => ({ id, status, ...iv(from, to, date) });

/** Mismo turno (from-to) en los dias indicados (0 = domingo). */
export const shifts = (days: number[], from: string, to: string): Schedule => {
  const weekly: WeeklyHours = {};
  for (const d of days) weekly[d] = [{ start: parseHM(from), end: parseHM(to) }];
  return { tzOffsetMinutes: TZ, weekly };
};

export const startsOf = (slots: Interval[]): string[] => slots.map((s) => formatHM(s.start, TZ));
