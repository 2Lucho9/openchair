import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEMPLATE,
  buildReminderMessage,
  clock12,
  dayWord,
  firstName,
  renderTemplate,
  reminderLink,
  summarize,
  type ReminderItem,
} from '../src/lib/reminders';

const TZ = -360;
const item = (over: Partial<ReminderItem> = {}): ReminderItem => ({
  id: 'a1',
  startsAt: '2026-11-03T20:00:00Z', // martes 14:00 en Costa Rica
  serviceName: 'Corte',
  reminderSentAt: null,
  clientName: 'Ana María Pérez',
  phone: '8888-7777',
  ...over,
});

describe('recordatorios', () => {
  it('toma el primer nombre', () => {
    expect(firstName('Ana María Pérez')).toBe('Ana');
    expect(firstName('  José ')).toBe('José');
    expect(firstName('')).toBe('');
  });

  it('dice hoy, mañana o la fecha', () => {
    expect(dayWord('2026-11-02', '2026-11-02')).toBe('hoy');
    expect(dayWord('2026-11-03', '2026-11-02')).toBe('mañana');
    expect(dayWord('2026-11-05', '2026-11-02')).toBe('el jue 5 nov');
    expect(dayWord('2026-12-01', '2026-11-30')).toBe('mañana');
  });

  it('muestra la hora en formato de 12 horas', () => {
    expect(clock12(Date.UTC(2026, 10, 3, 20, 0), TZ)).toBe('2:00 pm');
    expect(clock12(Date.UTC(2026, 10, 3, 15, 5), TZ)).toBe('9:05 am');
    expect(clock12(Date.UTC(2026, 10, 3, 6, 0), TZ)).toBe('12:00 am');
    expect(clock12(Date.UTC(2026, 10, 3, 18, 30), TZ)).toBe('12:30 pm');
  });

  it('arma el mensaje con la plantilla por defecto', () => {
    const m = buildReminderMessage({ template: DEFAULT_TEMPLATE, businessName: 'Barbería Luis', item: item(), tz: TZ, todayDate: '2026-11-02' });
    expect(m).toBe('Hola Ana, te recuerdo tu cita de Corte mañana a las 2:00 pm en Barbería Luis. ¡Te espero!');
  });

  it('sin nombre de negocio no deja un " en " suelto', () => {
    const m = buildReminderMessage({ template: DEFAULT_TEMPLATE, businessName: '  ', item: item(), tz: TZ, todayDate: '2026-11-02' });
    expect(m).toBe('Hola Ana, te recuerdo tu cita de Corte mañana a las 2:00 pm. ¡Te espero!');
  });

  it('reemplaza todas las repeticiones y respeta texto propio', () => {
    expect(renderTemplate('{nombre}, {nombre}: {hora} {x}', { nombre: 'Ana', servicio: '', dia: '', hora: '9:00 am', negocio: 'B' })).toBe('Ana, Ana: 9:00 am {x}');
  });

  it('la cita de otro día usa la fecha', () => {
    const m = buildReminderMessage({ template: '{dia} {hora}', businessName: 'X', item: item(), tz: TZ, todayDate: '2026-10-30' });
    expect(m).toBe('el mar 3 nov 2:00 pm');
  });

  it('usa la hora local aunque en UTC ya sea otro día', () => {
    // 21:30 en Costa Rica = 03:30 UTC del día siguiente.
    const m = buildReminderMessage({ template: '{dia} {hora}', businessName: 'X', item: item({ startsAt: '2026-11-04T03:30:00Z' }), tz: TZ, todayDate: '2026-11-02' });
    expect(m).toBe('mañana 9:30 pm');
  });

  it('arma el enlace de WhatsApp con el texto codificado', () => {
    const url = reminderLink(item(), 'Hola Ana ¡mañana!');
    expect(url).toBe('https://wa.me/50688887777?text=Hola%20Ana%20%C2%A1ma%C3%B1ana!');
    expect(reminderLink(item({ phone: null }), 'x')).toBeNull();
    expect(reminderLink(item({ phone: '123' }), 'x')).toBeNull();
  });

  it('resume por enviar, enviados y sin teléfono', () => {
    expect(
      summarize([item(), item({ id: 'b', reminderSentAt: '2026-11-02T10:00:00Z' }), item({ id: 'c', phone: null }), item({ id: 'd', phone: '12' })]),
    ).toEqual({ pending: 1, sent: 1, noPhone: 2 });
  });
});
