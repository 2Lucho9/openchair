import { describe, expect, it } from 'vitest';
import { contains, mergeIntervals, overlaps } from '../src';

describe('intervalos', () => {
  it('tocarse no es chocar', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
    expect(overlaps({ start: 0, end: 10 }, { start: 9, end: 20 })).toBe(true);
    expect(overlaps({ start: 5, end: 8 }, { start: 0, end: 20 })).toBe(true);
  });

  it('contains exige que quede completo adentro', () => {
    expect(contains({ start: 0, end: 10 }, { start: 0, end: 10 })).toBe(true);
    expect(contains({ start: 0, end: 10 }, { start: 5, end: 11 })).toBe(false);
  });

  it('mergeIntervals une cruzados y pegados, descarta vacios y no muta', () => {
    const input = [
      { start: 20, end: 30 },
      { start: 0, end: 10 },
      { start: 10, end: 15 },
      { start: 12, end: 18 },
      { start: 50, end: 50 },
    ];
    const copy = JSON.parse(JSON.stringify(input));
    expect(mergeIntervals(input)).toEqual([
      { start: 0, end: 18 },
      { start: 20, end: 30 },
    ]);
    expect(input).toEqual(copy);
  });
});
