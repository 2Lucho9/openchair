import { describe, expect, it } from 'vitest';
import { authErrorMessage, validateCredentials } from '../src/lib/errors';
import { parseTab, tabHash } from '../src/lib/nav';
import { formToUpdate, validateProfileForm, type ProfileForm } from '../src/lib/profile';
import { buildSchedule, buildTodayView, todayRange, type AppointmentRow } from '../src/lib/today';

describe('nav', () => {
  it('lee la pestaña desde el hash', () => {
    expect(parseTab('#/clientes')).toBe('clientes');
    expect(parseTab('#/ajustes?x=1')).toBe('ajustes');
    expect(parseTab('')).toBe('hoy');
    expect(parseTab('#/nada')).toBe('hoy');
    expect(tabHash('agenda')).toBe('#/agenda');
  });
});

describe('errores de acceso', () => {
  it('traduce mensajes de Supabase', () => {
    expect(authErrorMessage('Invalid login credentials')).toBe('Correo o contraseña incorrectos.');
    expect(authErrorMessage('User already registered')).toContain('ya tiene una cuenta');
    expect(authErrorMessage('Email not confirmed')).toContain('confirmar');
    expect(authErrorMessage('Password should be at least 6 characters')).toContain('contraseña');
    expect(authErrorMessage(undefined)).toContain('error');
  });
  it('valida correo y contraseña', () => {
    expect(validateCredentials('a@b.co', '12345678')).toBeNull();
    expect(validateCredentials('sin-arroba', '12345678')).toContain('correo');
    expect(validateCredentials('a@b.co', '1234567')).toContain('8');
  });
});

const good: ProfileForm = {
  display_name: 'Luis',
  business_name: 'Barbería Luis',
  phone: '88887777',
  currency: 'CRC',
  buffer_min: '10',
  slot_step_min: '30',
  min_notice_min: '60',
};

describe('formulario de perfil', () => {
  it('acepta datos válidos y los convierte', () => {
    expect(validateProfileForm(good)).toEqual({});
    expect(formToUpdate({ ...good, phone: '  ' }).phone).toBeNull();
    expect(formToUpdate(good).buffer_min).toBe(10);
  });
  it('rechaza lo que la base también rechazaría', () => {
    expect(validateProfileForm({ ...good, phone: '123' }).phone).toBeDefined();
    expect(validateProfileForm({ ...good, currency: 'EUR' }).currency).toBeDefined();
    expect(validateProfileForm({ ...good, buffer_min: '241' }).buffer_min).toBeDefined();
    expect(validateProfileForm({ ...good, buffer_min: '-1' }).buffer_min).toBeDefined();
    expect(validateProfileForm({ ...good, buffer_min: '' }).buffer_min).toBeDefined();
    expect(validateProfileForm({ ...good, slot_step_min: '25' }).slot_step_min).toBeDefined();
    expect(validateProfileForm({ ...good, min_notice_min: '10081' }).min_notice_min).toBeDefined();
    expect(validateProfileForm({ ...good, display_name: 'x'.repeat(121) }).display_name).toBeDefined();
  });
});

// Costa Rica = UTC-6. 2026-11-02 es lunes. 10:00 local = 16:00 UTC.
const TZ = -360;
const NOW = Date.UTC(2026, 10, 2, 16, 0);

describe('vista de hoy', () => {
  it('calcula el rango UTC del día local', () => {
    const r = todayRange(NOW, TZ);
    expect(r.date).toBe('2026-11-02');
    expect(r.startIso).toBe('2026-11-02T06:00:00.000Z');
    expect(r.endIso).toBe('2026-11-03T06:00:00.000Z');
  });

  it('sin horario para el día no ofrece sillas', () => {
    const v = buildTodayView({
      now: NOW, schedule: buildSchedule([], TZ), appointments: [],
      durationMin: 30, bufferMin: 0, stepMin: 30, minNoticeMin: 0,
    });
    expect(v.hasHours).toBe(false);
    expect(v.freeStarts).toEqual([]);
  });

  it('ofrece sillas desde ahora, respetando citas y margen', () => {
    // Lunes (weekday 1) 09:00-12:00. Son las 10:00. Cita confirmada 10:30-11:00 y margen de 10 min.
    const schedule = buildSchedule([{ weekday: 1, start_min: 540, end_min: 720 }], TZ);
    const appts: AppointmentRow[] = [
      { id: 'a', status: 'confirmed', service_name: 'Corte', starts_at: '2026-11-02T16:30:00Z', ends_at: '2026-11-02T17:00:00Z' },
      { id: 'b', status: 'cancelled', service_name: 'Corte', starts_at: '2026-11-02T17:30:00Z', ends_at: '2026-11-02T18:00:00Z' },
    ];
    const v = buildTodayView({ now: NOW, schedule, appointments: appts, durationMin: 30, bufferMin: 10, stepMin: 30, minNoticeMin: 0 });
    const starts = v.freeStarts.map((s) => new Date(s.start).toISOString().slice(11, 16));
    // 10:00 local = 16:00Z no cabe (la cita de 10:30 está pegada: 10:00-10:30 y el margen lo estorba).
    // 10:30 y 11:00 chocan con la cita (+margen hasta 11:10); 11:30 sí (la cancelada no ocupa).
    expect(starts).toEqual(['17:30']);
  });

  it('los turnos del mismo día se ordenan', () => {
    const s = buildSchedule([
      { weekday: 1, start_min: 840, end_min: 1020 },
      { weekday: 1, start_min: 540, end_min: 720 },
    ], TZ);
    expect(s.weekly[1]).toEqual([{ start: 540, end: 720 }, { start: 840, end: 1020 }]);
  });
});
