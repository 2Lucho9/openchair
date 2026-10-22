import { describe, expect, it } from 'vitest';
import {
  ACTION_TARGET,
  TRANSITIONS,
  availableActions,
  buildAppointmentRow,
  canCharge,
  canReschedule,
  dbErrorMessage,
  paymentFormToRow,
  suggestedAmount,
  validatePaymentForm,
  validateReverseReason,
} from '../src/lib/appointments';
import { appointmentsOfDay, countByDay, reasonsText, weekDates } from '../src/lib/agenda';
import { buildSchedule, buildTodayView } from '../src/lib/today';

const STATUSES = ['scheduled', 'confirmed', 'completed', 'no_show', 'cancelled'] as const;
// Es la misma lista que prueba la base de datos en states_test.sql (Fase 3).
const DB_ALLOWED = [
  'scheduled>confirmed', 'scheduled>completed', 'scheduled>no_show', 'scheduled>cancelled',
  'confirmed>completed', 'confirmed>no_show', 'confirmed>cancelled',
  'no_show>completed', 'cancelled>scheduled',
];

describe('cambios de estado', () => {
  it('coinciden exactamente con los de la base de datos', () => {
    const pairs = STATUSES.flatMap((a) => TRANSITIONS[a].map((b) => `${a}>${b}`));
    expect(pairs.sort()).toEqual([...DB_ALLOWED].sort());
  });

  const NOW = Date.UTC(2026, 10, 2, 16, 0);
  it('ofrece solo acciones válidas', () => {
    const names = (s: (typeof STATUSES)[number]) => availableActions(s, NOW - 1000, NOW, false).map((a) => a.action);
    expect(names('scheduled')).toEqual(['confirm', 'complete', 'no_show', 'cancel']);
    expect(names('confirmed')).toEqual(['complete', 'no_show', 'cancel']);
    expect(names('completed')).toEqual([]);
    expect(names('no_show')).toEqual(['complete']);
    expect(names('cancelled')).toEqual(['reactivate']);
    expect(ACTION_TARGET.reactivate).toBe('scheduled');
  });

  it('no deja completar ni marcar falta antes de que empiece', () => {
    const a = availableActions('scheduled', NOW + 3_600_000, NOW, false);
    expect(a.find((x) => x.action === 'complete')?.enabled).toBe(false);
    expect(a.find((x) => x.action === 'no_show')?.enabled).toBe(false);
    expect(a.find((x) => x.action === 'confirm')?.enabled).toBe(true);
    expect(a.find((x) => x.action === 'cancel')?.enabled).toBe(true);
  });

  it('no deja cancelar con pagos vigentes', () => {
    const a = availableActions('confirmed', NOW - 1000, NOW, true);
    expect(a.find((x) => x.action === 'cancel')).toMatchObject({ enabled: false });
    expect(a.find((x) => x.action === 'complete')?.enabled).toBe(true);
  });

  it('cobrar y reprogramar según el estado', () => {
    expect(canCharge('cancelled')).toBe(false);
    expect(canCharge('completed')).toBe(true);
    expect(canCharge('no_show')).toBe(true);
    expect(canReschedule('scheduled')).toBe(true);
    expect(canReschedule('confirmed')).toBe(true);
    expect(canReschedule('completed')).toBe(false);
    expect(canReschedule('cancelled')).toBe(false);
  });
});

describe('pagos', () => {
  const ok = { amount: '5000', tip: '500', method: 'sinpe', notes: '' };
  it('valida como la base de datos', () => {
    expect(validatePaymentForm(ok)).toEqual({});
    expect(validatePaymentForm({ ...ok, amount: '', tip: '500' })).toEqual({});
    expect(validatePaymentForm({ ...ok, amount: '', tip: '' }).amount).toBeDefined();
    expect(validatePaymentForm({ ...ok, amount: '0', tip: '0' }).amount).toBeDefined();
    expect(validatePaymentForm({ ...ok, amount: 'abc' }).amount).toBeDefined();
    expect(validatePaymentForm({ ...ok, tip: '-1' }).tip).toBeDefined();
    expect(validatePaymentForm({ ...ok, method: 'bitcoin' }).method).toBeDefined();
    expect(validatePaymentForm({ ...ok, notes: 'x'.repeat(501) }).notes).toBeDefined();
  });
  it('arma la fila a guardar', () => {
    expect(paymentFormToRow({ amount: '5 000', tip: '', method: 'cash', notes: ' ok ' }, 'a1')).toEqual({
      appointment_id: 'a1', amount: 5000, tip: 0, method: 'cash', notes: 'ok',
    });
  });
  it('sugiere lo que falta por pagar', () => {
    expect(suggestedAmount(3000)).toBe('3000');
    expect(suggestedAmount(0)).toBe('');
  });
  it('pide un motivo para reversar', () => {
    expect(validateReverseReason('ok')).not.toBeNull();
    expect(validateReverseReason('  ab ')).not.toBeNull();
    expect(validateReverseReason('Error de monto')).toBeNull();
    expect(validateReverseReason('x'.repeat(201))).not.toBeNull();
  });
});

describe('nueva cita', () => {
  const service = { id: 's1', name: 'Corte', duration_min: 45, price: 5000 };
  const start = Date.UTC(2026, 10, 2, 16, 0);
  it('guarda copia del servicio y calcula el fin', () => {
    const r = buildAppointmentRow({ clientId: 'c1', service, startMs: start, priceText: '', notes: '' });
    expect(r).toEqual({
      ok: true,
      row: {
        client_id: 'c1', service_id: 's1', service_name: 'Corte', price: 5000,
        starts_at: '2026-11-02T16:00:00.000Z', ends_at: '2026-11-02T16:45:00.000Z', notes: '',
      },
    });
  });
  it('permite cambiar el precio de esta cita', () => {
    const r = buildAppointmentRow({ clientId: 'c1', service, startMs: start, priceText: '4500', notes: '' });
    expect(r.ok && r.row.price).toBe(4500);
  });
  it('rechaza datos incompletos o inválidos', () => {
    expect(buildAppointmentRow({ clientId: '', service, startMs: start, priceText: '', notes: '' }).ok).toBe(false);
    expect(buildAppointmentRow({ clientId: 'c1', service, startMs: Number.NaN, priceText: '', notes: '' }).ok).toBe(false);
    expect(buildAppointmentRow({ clientId: 'c1', service, startMs: start, priceText: 'gratis', notes: '' }).ok).toBe(false);
    expect(buildAppointmentRow({ clientId: 'c1', service, startMs: start, priceText: '', notes: 'x'.repeat(2001) }).ok).toBe(false);
  });
});

describe('errores de la base de datos', () => {
  it('los explica', () => {
    expect(dbErrorMessage({ code: '23P01', message: 'conflicting key' })).toBe('Ese horario se cruza con otra cita.');
    expect(dbErrorMessage({ code: 'P0001', message: 'Cambio de estado no permitido: completed -> cancelled' })).toContain('no permitido');
    expect(dbErrorMessage({ code: '42501', message: 'x' })).toContain('permiso');
    expect(dbErrorMessage({ code: '23503', message: 'x' })).toContain('ya no existe');
    expect(dbErrorMessage({ message: 'otra cosa' })).toBe('otra cosa');
  });
});

describe('agenda', () => {
  const TZ = -360;
  it('la semana empieza el lunes', () => {
    expect(weekDates('2026-11-02')[0]).toBe('2026-11-02'); // lunes
    expect(weekDates('2026-11-08')[0]).toBe('2026-11-02'); // domingo -> misma semana
    expect(weekDates('2026-11-04')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  });
  const list = [
    { starts_at: '2026-11-02T20:00:00Z', status: 'confirmed' as const },
    { starts_at: '2026-11-02T15:00:00Z', status: 'scheduled' as const },
    { starts_at: '2026-11-02T17:00:00Z', status: 'cancelled' as const },
    { starts_at: '2026-11-03T05:59:00Z', status: 'completed' as const }, // 23:59 del lunes en CR
    { starts_at: '2026-11-03T06:00:00Z', status: 'scheduled' as const }, // 00:00 del martes en CR
  ];
  it('separa los días con la hora local (no la UTC)', () => {
    expect(appointmentsOfDay(list, '2026-11-02', TZ).map((a) => a.starts_at)).toEqual([
      '2026-11-02T15:00:00Z', '2026-11-02T17:00:00Z', '2026-11-02T20:00:00Z', '2026-11-03T05:59:00Z',
    ]);
    expect(appointmentsOfDay(list, '2026-11-03', TZ)).toHaveLength(1);
  });
  it('cuenta solo las citas que ocupan tiempo', () => {
    expect(countByDay(list, TZ)).toEqual({ '2026-11-02': 3, '2026-11-03': 1 });
  });
  it('explica los motivos', () => {
    expect(reasonsText(['fuera_de_horario', 'choque_bloqueo'])).toEqual([
      'Está fuera de tu horario de trabajo.',
      'Cae en un bloqueo (almuerzo, vacaciones…).',
    ]);
  });

  const schedule = buildSchedule([{ weekday: 1, start_min: 540, end_min: 720 }], TZ); // lunes 09:00-12:00
  const NOW = Date.UTC(2026, 10, 1, 12, 0); // domingo: todo el lunes está en el futuro
  const base = { now: NOW, date: '2026-11-02', schedule, durationMin: 60, bufferMin: 0, stepMin: 60, minNoticeMin: 0 };
  const hhmm = (v: { freeStarts: { start: number }[] }) => v.freeStarts.map((s) => new Date(s.start).toISOString().slice(11, 16));
  it('las sillas libres respetan fecha, bloqueos y la cita que se reprograma', () => {
    const appts = [{ id: 'a', status: 'confirmed' as const, service_name: 'x', starts_at: '2026-11-02T16:00:00Z', ends_at: '2026-11-02T17:00:00Z' }];
    expect(hhmm(buildTodayView({ ...base, appointments: [] }))).toEqual(['15:00', '16:00', '17:00']);
    expect(hhmm(buildTodayView({ ...base, appointments: appts }))).toEqual(['15:00', '17:00']);
    expect(hhmm(buildTodayView({ ...base, appointments: appts, excludeId: 'a' }))).toEqual(['15:00', '16:00', '17:00']);
    const block = [{ start: Date.UTC(2026, 10, 2, 15, 0), end: Date.UTC(2026, 10, 2, 16, 0) }];
    expect(hhmm(buildTodayView({ ...base, appointments: [], timeOff: block }))).toEqual(['16:00', '17:00']);
    expect(buildTodayView({ ...base, date: '2026-11-03', appointments: [] }).hasHours).toBe(false); // martes sin horario
  });
});
