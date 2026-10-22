import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  MINUTE_MS,
  checkSlot,
  findConflicts,
  formatHM,
  freeSlots,
  localMidnight,
  occupiesTime,
  type Appointment,
  type AppointmentStatus,
  type Interval,
  type Schedule,
} from '../src';
import { FRI, SAT, TZ, WED, appt, at, iv, shifts, startsOf } from './helpers';

const lunesASabado = shifts([1, 2, 3, 4, 5, 6], '09:00', '18:00');

describe('findConflicts', () => {
  const a = appt('a', '10:00', '11:00');

  it('citas pegadas sin margen no chocan', () => {
    expect(findConflicts(iv('11:00', '12:00'), [a])).toEqual([]);
    expect(findConflicts(iv('09:00', '10:00'), [a])).toEqual([]);
  });

  it('un minuto de cruce si choca', () => {
    expect(findConflicts(iv('10:59', '12:00'), [a])).toEqual([a]);
    expect(findConflicts(iv('09:00', '10:01'), [a])).toEqual([a]);
  });

  it('el margen se respeta antes y despues de cada cita', () => {
    const opts = { bufferMin: 10 };
    expect(findConflicts(iv('11:00', '12:00'), [a], opts)).toEqual([a]);
    expect(findConflicts(iv('11:10', '12:10'), [a], opts)).toEqual([]);
    expect(findConflicts(iv('09:00', '09:55'), [a], opts)).toEqual([a]);
    expect(findConflicts(iv('08:50', '09:50'), [a], opts)).toEqual([]);
  });

  it('canceladas y no asistio liberan el espacio; completada y confirmada no', () => {
    const statuses: AppointmentStatus[] = ['scheduled', 'confirmed', 'completed', 'no_show', 'cancelled'];
    const blocks = statuses.map((s) => findConflicts(iv('10:00', '11:00'), [appt('x', '10:00', '11:00', s)]).length > 0);
    expect(blocks).toEqual([true, true, true, false, false]);
    expect(statuses.map(occupiesTime)).toEqual(blocks);
  });

  it('excludeId permite mover una cita sobre si misma', () => {
    expect(findConflicts(iv('10:00', '11:00'), [a], { excludeId: 'a' })).toEqual([]);
  });

  it('un margen negativo es un error', () => {
    expect(() => findConflicts(iv('10:00', '11:00'), [a], { bufferMin: -5 })).toThrow(RangeError);
  });
});

describe('checkSlot', () => {
  const base = { schedule: lunesASabado, appointments: [appt('a', '10:00', '11:00')] };

  it('acepta una cita libre dentro del horario, incluso justo al limite', () => {
    expect(checkSlot(iv('11:00', '12:00'), base).ok).toBe(true);
    expect(checkSlot(iv('17:00', '18:00'), base).ok).toBe(true);
    expect(checkSlot(iv('09:00', '10:00'), base).ok).toBe(true);
  });

  it('rechaza fuera de horario', () => {
    expect(checkSlot(iv('08:30', '09:30'), base).reasons).toEqual(['fuera_de_horario']);
    expect(checkSlot(iv('17:30', '18:30'), base).reasons).toEqual(['fuera_de_horario']);
  });

  it('un dia sin turno es fuera de horario, salvo que se ignore', () => {
    const domingo = '2026-10-25';
    expect(checkSlot(iv('10:00', '11:00', domingo), base).reasons).toEqual(['fuera_de_horario']);
    expect(checkSlot(iv('10:00', '11:00', domingo), { ...base, ignoreWorkingHours: true }).ok).toBe(true);
  });

  it('reporta el choque y con quien', () => {
    const r = checkSlot(iv('10:30', '11:30'), base);
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(['choque_cita']);
    expect(r.conflicts.map((c) => c.id)).toEqual(['a']);
  });

  it('reporta bloqueos y puede juntar varios motivos', () => {
    const timeOff = [iv('12:00', '13:00')];
    expect(checkSlot(iv('12:30', '13:30'), { ...base, timeOff }).reasons).toEqual(['choque_bloqueo']);
    expect(checkSlot(iv('17:30', '18:30'), { ...base, timeOff: [iv('18:00', '19:00')] }).reasons).toEqual([
      'fuera_de_horario',
      'choque_bloqueo',
    ]);
  });

  it('una duracion cero o negativa es invalida', () => {
    expect(checkSlot(iv('10:00', '10:00'), base).reasons).toEqual(['duracion_invalida']);
    expect(checkSlot({ start: 5, end: 1 }, base).reasons).toEqual(['duracion_invalida']);
  });

  it('acepta citas que cruzan medianoche dentro de un turno nocturno', () => {
    const noche = { schedule: shifts([5], '20:00', '26:00'), appointments: [] };
    expect(checkSlot(iv('23:30', '24:30', FRI), noche).ok).toBe(true);
    expect(checkSlot(iv('23:30', '26:30', FRI), noche).reasons).toEqual(['fuera_de_horario']);
  });
});

describe('freeSlots', () => {
  it('dia libre: un servicio de 1 hora cada 30 min', () => {
    const slots = freeSlots({ date: WED, durationMin: 60, schedule: lunesASabado, appointments: [] });
    expect(slots).toHaveLength(17);
    expect(startsOf(slots)[0]).toBe('09:00');
    expect(startsOf(slots).at(-1)).toBe('17:00');
  });

  it('servicio largo (3 horas) con una cita al medio del dia', () => {
    const slots = freeSlots({
      date: WED,
      durationMin: 180,
      schedule: lunesASabado,
      appointments: [appt('a', '12:00', '13:00')],
    });
    expect(startsOf(slots)).toEqual(['09:00', '13:00', '13:30', '14:00', '14:30', '15:00']);
  });

  it('el margen entre citas recorta los horarios', () => {
    const slots = freeSlots({
      date: WED,
      durationMin: 60,
      bufferMin: 10,
      schedule: lunesASabado,
      appointments: [appt('a', '12:00', '13:00')],
    });
    expect(startsOf(slots)).toEqual([
      '09:00', '09:30', '10:00', '10:30',
      '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00',
    ]);
  });

  it('los bloqueos quitan horarios y tocarse no cuenta', () => {
    const starts = startsOf(
      freeSlots({
        date: WED,
        durationMin: 60,
        schedule: lunesASabado,
        appointments: [],
        timeOff: [iv('14:00', '15:00')],
      }),
    );
    expect(starts).toContain('13:00');
    expect(starts).toContain('15:00');
    for (const s of ['13:30', '14:00', '14:30']) expect(starts).not.toContain(s);
  });

  it('respeta la hora actual y el aviso minimo', () => {
    const base = { date: WED, durationMin: 60, schedule: lunesASabado, appointments: [] };
    expect(startsOf(freeSlots({ ...base, now: at('10:00'), minNoticeMin: 60 }))[0]).toBe('11:00');
    expect(startsOf(freeSlots({ ...base, now: at('16:10') }))[0]).toBe('16:30');
    expect(freeSlots({ ...base, now: at('17:30') })).toEqual([]);
  });

  it('un dia sin turno no ofrece nada', () => {
    expect(freeSlots({ date: '2026-10-25', durationMin: 30, schedule: lunesASabado, appointments: [] })).toEqual([]);
  });

  it('turno nocturno: viernes hasta las 23:30 y sabado hasta la 01:00', () => {
    const schedule = shifts([5], '20:00', '26:00');
    const viernes = freeSlots({ date: FRI, durationMin: 60, schedule, appointments: [] });
    const sabado = freeSlots({ date: SAT, durationMin: 60, schedule, appointments: [] });
    expect(startsOf(viernes)).toEqual(['20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30']);
    expect(startsOf(sabado)).toEqual(['00:00', '00:30', '01:00']);
  });

  it('una cita nocturna bloquea las primeras horas del dia siguiente', () => {
    const schedule = shifts([5], '20:00', '26:00');
    const sabado = freeSlots({
      date: SAT,
      durationMin: 60,
      schedule,
      appointments: [appt('n', '23:00', '25:00', 'confirmed', FRI)],
    });
    expect(startsOf(sabado)).toEqual(['01:00']);
  });

  it('reprogramar: excludeId libera la propia cita', () => {
    const a = appt('a', '10:00', '11:00');
    const sin = freeSlots({ date: WED, durationMin: 60, schedule: lunesASabado, appointments: [a] });
    const con = freeSlots({ date: WED, durationMin: 60, schedule: lunesASabado, appointments: [a], excludeId: 'a' });
    expect(startsOf(sin)).not.toContain('10:00');
    expect(startsOf(con)).toContain('10:00');
  });

  it('parametros invalidos lanzan error', () => {
    const base = { date: WED, schedule: lunesASabado, appointments: [] };
    expect(() => freeSlots({ ...base, durationMin: 0 })).toThrow(RangeError);
    expect(() => freeSlots({ ...base, durationMin: 30, stepMin: 0 })).toThrow(RangeError);
  });
});

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function pick<T>(r: () => number, xs: T[]): T {
  return xs[Math.floor(r() * xs.length)] as T;
}

describe('consistencia entre freeSlots y checkSlot', () => {
  it('coinciden en 150 escenarios al azar (margen, bloqueos, turno nocturno)', () => {
    const r = lcg(2026);
    const schedule: Schedule = {
      tzOffsetMinutes: TZ,
      weekly: { 5: [{ start: 600, end: 1560 }], 6: [{ start: 540, end: 780 }] },
    };
    const statuses: AppointmentStatus[] = ['scheduled', 'confirmed', 'completed', 'no_show', 'cancelled'];
    const friMidnight = localMidnight(FRI, TZ);
    const mismatches: string[] = [];
    let totalSlots = 0;

    for (let n = 0; n < 150; n++) {
      const bufferMin = pick(r, [0, 5, 10, 15]);
      const durationMin = pick(r, [15, 30, 45, 60, 90, 180]);
      const stepMin = pick(r, [15, 30]);

      const appointments: Appointment[] = Array.from({ length: Math.floor(r() * 7) }, (_, i) => {
        const start = friMidnight + Math.floor(r() * 104) * 15 * MINUTE_MS;
        const len = (1 + Math.floor(r() * 8)) * 15 * MINUTE_MS;
        return { id: `c${i}`, start, end: start + len, status: pick(r, statuses) };
      });

      const timeOff: Interval[] =
        r() < 0.5
          ? [{ start: friMidnight + Math.floor(r() * 104) * 15 * MINUTE_MS, end: 0 }].map((t) => ({
              start: t.start,
              end: t.start + 60 * MINUTE_MS,
            }))
          : [];

      const ctx = { schedule, appointments, timeOff, bufferMin };

      for (const date of [FRI, SAT]) {
        const got = new Set(freeSlots({ ...ctx, date, durationMin, stepMin }).map((s) => s.start));
        totalSlots += got.size;
        const dayStart = localMidnight(date, TZ);
        for (let t = dayStart; t < dayStart + DAY_MS; t += stepMin * MINUTE_MS) {
          const expected = checkSlot({ start: t, end: t + durationMin * MINUTE_MS }, ctx).ok;
          if (got.has(t) !== expected) {
            mismatches.push(`n=${n} ${date} ${formatHM(t, TZ)} dur=${durationMin} buf=${bufferMin} esperado=${expected}`);
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
    expect(totalSlots).toBeGreaterThan(0);
  });
});
