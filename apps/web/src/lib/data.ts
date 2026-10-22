import { addDays, DAY_MS, localMidnight, type Interval } from '@openchair/engine';
import type { AgendaAppt, WorkingHoursRow } from './today';
import { supabase } from './supabase';

export const APPT_COLUMNS = 'id, client_id, starts_at, ends_at, status, service_name, price';

interface Res<T> {
  data: T | null;
  error: { message: string } | null;
}

/** Citas, horario y bloqueos alrededor de una fecha (con un día de margen para turnos nocturnos). */
export interface Window {
  appointments: AgendaAppt[];
  hours: WorkingHoursRow[];
  timeOff: Interval[];
}

export async function loadWindow(fromDate: string, toDate: string, tz: number): Promise<Res<Window>> {
  const lo = new Date(localMidnight(fromDate, tz) - DAY_MS).toISOString();
  const hi = new Date(localMidnight(addDays(toDate, 1), tz) + DAY_MS).toISOString();
  const [a, h, t] = await Promise.all([
    supabase!.from('appointments').select(APPT_COLUMNS).gte('starts_at', lo).lt('starts_at', hi).order('starts_at'),
    supabase!.from('working_hours').select('weekday, start_min, end_min'),
    supabase!.from('time_off').select('starts_at, ends_at').lt('starts_at', hi).gt('ends_at', lo),
  ]);
  const err = a.error ?? h.error ?? t.error;
  if (err) return { data: null, error: err };
  return {
    data: {
      appointments: (a.data ?? []) as AgendaAppt[],
      hours: (h.data ?? []) as WorkingHoursRow[],
      timeOff: ((t.data ?? []) as { starts_at: string; ends_at: string }[]).map((r) => ({
        start: Date.parse(r.starts_at),
        end: Date.parse(r.ends_at),
      })),
    },
    error: null,
  };
}
