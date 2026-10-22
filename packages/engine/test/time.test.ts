import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfWeek,
  formatHM,
  localMidnight,
  localToMs,
  parseHM,
  toLocalDate,
} from '../src';
import { TZ, WED } from './helpers';

describe('tiempo', () => {
  it('la medianoche de Costa Rica es 06:00 UTC', () => {
    expect(localMidnight('2026-10-21', -360)).toBe(Date.UTC(2026, 9, 21, 6));
  });

  it('convierte un instante a su fecha local', () => {
    expect(toLocalDate(Date.UTC(2026, 9, 22, 4, 30), -360)).toBe('2026-10-21');
    expect(toLocalDate(Date.UTC(2026, 9, 22, 6, 0), -360)).toBe('2026-10-22');
  });

  it('funciona con zonas al este de UTC', () => {
    expect(localMidnight('2026-10-21', 120)).toBe(Date.UTC(2026, 9, 20, 22));
  });

  it('calcula el dia de la semana', () => {
    expect(dayOfWeek('2026-10-21')).toBe(3);
    expect(dayOfWeek('2026-10-25')).toBe(0);
  });

  it('suma dias cruzando mes, ano y bisiesto', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('rechaza fechas invalidas', () => {
    expect(() => localMidnight('2026-02-30', TZ)).toThrow(RangeError);
    expect(() => localMidnight('21/10/2026', TZ)).toThrow(RangeError);
  });

  it('interpreta y formatea horas', () => {
    expect(parseHM('09:30')).toBe(570);
    expect(parseHM('26:00')).toBe(1560);
    expect(() => parseHM('9:75')).toThrow(RangeError);
    expect(formatHM(localToMs(WED, '09:05', TZ), TZ)).toBe('09:05');
    expect(formatHM(localToMs(WED, '26:00', TZ), TZ)).toBe('02:00');
  });
});
