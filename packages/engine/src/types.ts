/** Instante en milisegundos desde epoch (UTC). */
export type Ms = number;

/** Intervalo semiabierto [start, end): el instante `end` ya no pertenece. */
export interface Interval {
  start: Ms;
  end: Ms;
}

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'no_show'
  | 'cancelled';

export interface Appointment extends Interval {
  id: string;
  status: AppointmentStatus;
}

/**
 * Turno de trabajo en minutos desde la medianoche local del dia.
 * `end` puede pasar de 1440 para turnos que terminan despues de medianoche
 * (ej. 20:00 a 02:00 = { start: 1200, end: 1560 }).
 */
export interface DayHours {
  start: number;
  end: number;
}

/** Clave 0 = domingo ... 6 = sabado. Un dia sin clave no se trabaja. */
export type WeeklyHours = Partial<Record<number, DayHours[]>>;

export interface Schedule {
  /** Desfase respecto a UTC en minutos. Costa Rica = -360 (sin cambio de hora). */
  tzOffsetMinutes: number;
  weekly: WeeklyHours;
}
