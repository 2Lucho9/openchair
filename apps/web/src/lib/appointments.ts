import type { AppointmentStatus } from '@openchair/engine';
import { parsePrice } from './money';

export type Action = 'confirm' | 'complete' | 'no_show' | 'cancel' | 'reactivate';

export const ACTION_TARGET: Record<Action, AppointmentStatus> = {
  confirm: 'confirmed',
  complete: 'completed',
  no_show: 'no_show',
  cancel: 'cancelled',
  reactivate: 'scheduled',
};

export const ACTION_LABEL: Record<Action, string> = {
  confirm: 'Confirmar',
  complete: 'Completar',
  no_show: 'No asistió',
  cancel: 'Cancelar cita',
  reactivate: 'Reactivar',
};

/** Los mismos cambios de estado que permite la base de datos (Fase 3). */
export const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['confirmed', 'completed', 'no_show', 'cancelled'],
  confirmed: ['completed', 'no_show', 'cancelled'],
  no_show: ['completed'],
  cancelled: ['scheduled'],
  completed: [],
};

export interface ActionInfo {
  action: Action;
  enabled: boolean;
  reason?: string;
}

const ORDER: Action[] = ['confirm', 'complete', 'no_show', 'cancel', 'reactivate'];

export function availableActions(
  status: AppointmentStatus,
  startsAtMs: number,
  now: number,
  hasActivePayments: boolean,
): ActionInfo[] {
  const allowed = new Set(TRANSITIONS[status]);
  return ORDER.filter((a) => allowed.has(ACTION_TARGET[a])).map((action) => {
    if ((action === 'complete' || action === 'no_show') && startsAtMs > now)
      return { action, enabled: false, reason: 'Todavía no empieza.' };
    if (action === 'cancel' && hasActivePayments)
      return { action, enabled: false, reason: 'Tiene pagos: reversalos primero.' };
    return { action, enabled: true };
  });
}

export const canCharge = (s: AppointmentStatus): boolean => s !== 'cancelled';
export const canReschedule = (s: AppointmentStatus): boolean => s === 'scheduled' || s === 'confirmed';

export const PAYMENT_METHODS = ['cash', 'sinpe', 'card', 'transfer', 'other'] as const;

export interface PaymentForm {
  amount: string;
  tip: string;
  method: string;
  notes: string;
}
export type PaymentErrors = Partial<Record<keyof PaymentForm, string>>;

const money = (s: string): number | null => (s.trim() === '' ? 0 : parsePrice(s));

export function validatePaymentForm(f: PaymentForm): PaymentErrors {
  const e: PaymentErrors = {};
  const amount = money(f.amount);
  const tip = money(f.tip);
  if (amount === null) e.amount = 'Monto no válido.';
  if (tip === null) e.tip = 'Propina no válida.';
  if (amount !== null && tip !== null && amount + tip <= 0) e.amount = 'Escribe un monto o una propina.';
  if (!(PAYMENT_METHODS as readonly string[]).includes(f.method)) e.method = 'Elige un método.';
  if (f.notes.length > 500) e.notes = 'Máximo 500 caracteres.';
  return e;
}

export function paymentFormToRow(f: PaymentForm, appointmentId: string) {
  return {
    appointment_id: appointmentId,
    amount: money(f.amount) as number,
    tip: money(f.tip) as number,
    method: f.method,
    notes: f.notes.trim(),
  };
}

/** Monto sugerido al cobrar: lo que falta por pagar. */
export function suggestedAmount(due: number): string {
  return due > 0 ? String(due) : '';
}

export function validateReverseReason(reason: string): string | null {
  const n = reason.trim().length;
  return n < 3 || n > 200 ? 'Escribe el motivo (entre 3 y 200 caracteres).' : null;
}

export interface NewAppointmentInput {
  clientId: string;
  service: { id: string; name: string; duration_min: number; price: number };
  startMs: number;
  priceText: string;
  notes: string;
}

export type BuiltAppointment =
  | { ok: true; row: { client_id: string; service_id: string; service_name: string; price: number; starts_at: string; ends_at: string; notes: string } }
  | { ok: false; error: string };

/** Arma la fila a guardar. La cita guarda una copia del nombre y precio del servicio. */
export function buildAppointmentRow(i: NewAppointmentInput): BuiltAppointment {
  if (!i.clientId) return { ok: false, error: 'Elige un cliente.' };
  if (!Number.isFinite(i.startMs)) return { ok: false, error: 'Elige la hora.' };
  const price = i.priceText.trim() === '' ? i.service.price : parsePrice(i.priceText);
  if (price === null) return { ok: false, error: 'Precio no válido.' };
  if (i.notes.length > 2000) return { ok: false, error: 'Las notas son muy largas (máximo 2000).' };
  return {
    ok: true,
    row: {
      client_id: i.clientId,
      service_id: i.service.id,
      service_name: i.service.name,
      price,
      starts_at: new Date(i.startMs).toISOString(),
      ends_at: new Date(i.startMs + i.service.duration_min * 60_000).toISOString(),
      notes: i.notes,
    },
  };
}

/** Mensaje claro para errores de la base de datos. */
export function dbErrorMessage(err: { code?: string; message: string }): string {
  if (err.code === '23P01') return 'Ese horario se cruza con otra cita.';
  if (err.code === '42501') return 'No tienes permiso para esa acción.';
  if (err.code === '23503') return 'El cliente o el servicio ya no existe.';
  if (err.code === 'P0001') return err.message;
  if (err.code === '23514') return 'Algún dato está fuera de lo permitido.';
  return err.message;
}
