import { describe, expect, it } from 'vitest';
import { validateWeeklyHours, workingIntervals, type Schedule } from '../src';
import { FRI, SAT, TZ, WED, iv, shifts } from './helpers';

describe('workingIntervals', () => {
  it('un turno normal', () => {
    const s = shifts([3], '09:00', '18:00');
    expect(workingIntervals(WED, WED, s)).toEqual([iv('09:00', '18:00')]);
  });

  it('un dia sin turno no devuelve nada', () => {
    expect(workingIntervals('2026-10-25', '2026-10-25', shifts([3], '09:00', '18:00'))).toEqual([]);
  });

  it('turno partido por almuerzo', () => {
    const s: Schedule = {
      tzOffsetMinutes: TZ,
      weekly: {
        3: [
          { start: 540, end: 720 },
          { start: 780, end: 1080 },
        ],
      },
    };
    expect(workingIntervals(WED, WED, s)).toEqual([iv('09:00', '12:00'), iv('13:00', '18:00')]);
  });

  it('un turno puede pasar de medianoche', () => {
    const s = shifts([5], '20:00', '26:00');
    expect(workingIntervals(FRI, SAT, s)).toEqual([iv('20:00', '26:00', FRI)]);
  });

  it('une turnos que se tocan en la medianoche', () => {
    const s: Schedule = {
      tzOffsetMinutes: TZ,
      weekly: { 5: [{ start: 1080, end: 1440 }], 6: [{ start: 0, end: 240 }] },
    };
    expect(workingIntervals(FRI, SAT, s)).toEqual([iv('18:00', '28:00', FRI)]);
  });
});

describe('validateWeeklyHours', () => {
  it('acepta un horario correcto', () => {
    expect(validateWeeklyHours(shifts([1, 2, 3, 4, 5], '09:00', '18:00').weekly)).toEqual([]);
  });

  it('rechaza fin menor o igual al inicio', () => {
    expect(validateWeeklyHours({ 3: [{ start: 600, end: 600 }] })).toHaveLength(1);
  });

  it('rechaza turnos que se cruzan el mismo dia', () => {
    expect(
      validateWeeklyHours({
        3: [
          { start: 540, end: 720 },
          { start: 700, end: 900 },
        ],
      }),
    ).toHaveLength(1);
  });

  it('rechaza horas fuera de rango', () => {
    expect(validateWeeklyHours({ 3: [{ start: -10, end: 100 }] })).toHaveLength(1);
    expect(validateWeeklyHours({ 3: [{ start: 100, end: 3000 }] })).toHaveLength(1);
  });

  it('rechaza un turno de medianoche que choca con el dia siguiente', () => {
    expect(
      validateWeeklyHours({ 5: [{ start: 1200, end: 1560 }], 6: [{ start: 60, end: 300 }] }),
    ).toHaveLength(1);
  });
});
