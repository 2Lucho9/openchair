import { describe, expect, it } from 'vitest';
import { clientFormToRow, filterClients, findDuplicatePhone, validateClientForm, whatsappUrl } from '../src/lib/clients';
import { STATUS_LABEL, formatDateTime, formatDay } from '../src/lib/dates';
import { formatMinutes, groupByDay, isoToLocalInput, localInputToIso, parseShift, presetRows } from '../src/lib/hours';
import { formatMoney, parsePrice } from '../src/lib/money';
import { formatDuration, serviceFormToRow, validateServiceForm } from '../src/lib/services';

describe('dinero', () => {
  it('formatea colones y dólares', () => {
    expect(formatMoney(5000, 'CRC')).toBe('₡5 000');
    expect(formatMoney(1234567, 'CRC')).toBe('₡1 234 567');
    expect(formatMoney(0, 'CRC')).toBe('₡0');
    expect(formatMoney(12.5, 'USD')).toBe('$12,50');
    expect(formatMoney(-3000, 'CRC')).toBe('-₡3 000');
    expect(formatMoney(Number.NaN, 'CRC')).toBe('₡0');
  });
  it('lee precios escritos a mano', () => {
    expect(parsePrice('5000')).toBe(5000);
    expect(parsePrice(' 5 000 ')).toBe(5000);
    expect(parsePrice('5000,5')).toBe(5000.5);
    expect(parsePrice('12.25')).toBe(12.25);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('abc')).toBeNull();
    expect(parsePrice('-5')).toBeNull();
    expect(parsePrice('1.234')).toBeNull();
  });
});

describe('servicios', () => {
  it('valida como la base de datos', () => {
    expect(validateServiceForm({ name: 'Corte', duration_min: '30', price: '5000' })).toEqual({});
    expect(validateServiceForm({ name: '  ', duration_min: '30', price: '' }).name).toBeDefined();
    expect(validateServiceForm({ name: 'x', duration_min: '4', price: '' }).duration_min).toBeDefined();
    expect(validateServiceForm({ name: 'x', duration_min: '1441', price: '' }).duration_min).toBeDefined();
    expect(validateServiceForm({ name: 'x', duration_min: '30', price: 'gratis' }).price).toBeDefined();
  });
  it('convierte el formulario (precio vacío = 0)', () => {
    expect(serviceFormToRow({ name: ' Corte ', duration_min: '45', price: '' })).toEqual({ name: 'Corte', duration_min: 45, price: 0 });
  });
  it('muestra duraciones', () => {
    expect(formatDuration(30)).toBe('30 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
  });
});

describe('clientes', () => {
  it('valida como la base de datos', () => {
    expect(validateClientForm({ full_name: 'Ana', phone: '', email: '', notes: '' })).toEqual({});
    expect(validateClientForm({ full_name: ' ', phone: '', email: '', notes: '' }).full_name).toBeDefined();
    expect(validateClientForm({ full_name: 'Ana', phone: '123', email: '', notes: '' }).phone).toBeDefined();
    expect(validateClientForm({ full_name: 'Ana', phone: '', email: 'x', notes: '' }).email).toBeDefined();
    expect(validateClientForm({ full_name: 'Ana', phone: '', email: '', notes: 'x'.repeat(5001) }).notes).toBeDefined();
  });
  it('limpia campos vacíos a null', () => {
    expect(clientFormToRow({ full_name: ' Ana ', phone: ' ', email: '', notes: 'ok' })).toEqual({ full_name: 'Ana', phone: null, email: null, notes: 'ok' });
  });
  const list = [
    { id: '1', full_name: 'José Ángel Mora', phone: '8888-7777' },
    { id: '2', full_name: 'María Solís', phone: null },
  ];
  it('busca sin tildes ni mayúsculas, y por teléfono', () => {
    expect(filterClients(list, 'jose angel').map((c) => c.id)).toEqual(['1']);
    expect(filterClients(list, 'MARIA').map((c) => c.id)).toEqual(['2']);
    expect(filterClients(list, '8888 77').map((c) => c.id)).toEqual(['1']);
    expect(filterClients(list, '  ')).toHaveLength(2);
    expect(filterClients(list, 'zzz')).toHaveLength(0);
  });
  it('detecta teléfonos repetidos', () => {
    expect(findDuplicatePhone(list, '88887777')?.id).toBe('1');
    expect(findDuplicatePhone(list, '88887777', '1')).toBeUndefined();
    expect(findDuplicatePhone(list, '123')).toBeUndefined();
  });
  it('arma el enlace de WhatsApp', () => {
    expect(whatsappUrl('8888-7777')).toBe('https://wa.me/50688887777');
    expect(whatsappUrl('+506 8888 7777')).toBe('https://wa.me/50688887777');
    expect(whatsappUrl('8888-7777', 'Hola Ana')).toBe('https://wa.me/50688887777?text=Hola%20Ana');
    expect(whatsappUrl('123')).toBeNull();
    expect(whatsappUrl(null)).toBeNull();
  });
});

describe('horario', () => {
  it('convierte turnos, incluso los que cruzan medianoche', () => {
    expect(parseShift('09:00', '18:00')).toEqual({ ok: true, start_min: 540, end_min: 1080 });
    expect(parseShift('20:00', '02:00')).toEqual({ ok: true, start_min: 1200, end_min: 1560 });
    expect(parseShift('09:00', '09:00').ok).toBe(false);
    expect(parseShift('', '09:00').ok).toBe(false);
    expect(parseShift('24:00', '09:00').ok).toBe(false);
  });
  it('muestra minutos como hora', () => {
    expect(formatMinutes(540)).toBe('09:00');
    expect(formatMinutes(1560)).toBe('02:00 (día siguiente)');
  });
  it('agrupa por día y ordena', () => {
    const g = groupByDay([
      { id: 'b', weekday: 1, start_min: 840, end_min: 1020 },
      { id: 'a', weekday: 1, start_min: 540, end_min: 720 },
      { id: 'c', weekday: 0, start_min: 600, end_min: 700 },
    ]);
    expect(g[1].map((r) => r.id)).toEqual(['a', 'b']);
    expect(g[0]).toHaveLength(1);
    expect(g[2]).toBeUndefined();
  });
  it('arma el horario rápido', () => {
    expect(presetRows([1, 2], 540, 1080)).toEqual([
      { weekday: 1, start_min: 540, end_min: 1080 },
      { weekday: 2, start_min: 540, end_min: 1080 },
    ]);
  });
  it('convierte fecha-hora local a UTC y de vuelta (Costa Rica = UTC-6)', () => {
    expect(localInputToIso('2026-11-02T09:00', -360)).toBe('2026-11-02T15:00:00.000Z');
    expect(localInputToIso('2026-11-02T20:30', -360)).toBe('2026-11-03T02:30:00.000Z');
    expect(localInputToIso('', -360)).toBeNull();
    expect(localInputToIso('2026-11-02', -360)).toBeNull();
    expect(isoToLocalInput('2026-11-03T02:30:00.000Z', -360)).toBe('2026-11-02T20:30');
  });
});

describe('fechas y etiquetas', () => {
  it('formatea el día y la hora local', () => {
    expect(formatDay('2026-11-02')).toBe('lun 2 nov');
    expect(formatDay('2026-01-31')).toBe('sáb 31 ene');
    expect(formatDateTime(Date.UTC(2026, 10, 2, 15, 0), -360)).toBe('lun 2 nov, 09:00');
    expect(formatDateTime(Date.UTC(2026, 10, 3, 2, 30), -360)).toBe('lun 2 nov, 20:30');
  });
  it('traduce los estados', () => {
    expect(STATUS_LABEL.no_show).toBe('No asistió');
    expect(Object.keys(STATUS_LABEL)).toHaveLength(5);
  });
});
