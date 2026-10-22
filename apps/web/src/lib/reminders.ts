import { addDays, formatHM, toLocalDate } from '@openchair/engine';
import { whatsappUrl } from './clients';
import { formatDay } from './dates';

/** Igual que el valor por defecto de la base de datos (profiles.reminder_template). */
export const DEFAULT_TEMPLATE =
  'Hola {nombre}, te recuerdo tu cita de {servicio} {dia} a las {hora} en {negocio}. ¡Te espero!';

export const TEMPLATE_VARS = ['{nombre}', '{servicio}', '{dia}', '{hora}', '{negocio}'] as const;

export const firstName = (full: string): string => full.trim().split(/\s+/)[0] ?? '';

/** "hoy", "mañana" o "el lun 2 nov". */
export function dayWord(date: string, todayDate: string): string {
  if (date === todayDate) return 'hoy';
  if (date === addDays(todayDate, 1)) return 'mañana';
  return `el ${formatDay(date)}`;
}

/** 14:05 -> "2:05 pm" (hora local del negocio). */
export function clock12(ms: number, tzOffsetMinutes: number): string {
  const [h, m] = formatHM(ms, tzOffsetMinutes).split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${suffix}`;
}

export interface TemplateVars {
  nombre: string;
  servicio: string;
  dia: string;
  hora: string;
  negocio: string;
}

/** Reemplaza las variables. Sin nombre de negocio, desaparece también el " en {negocio}". */
export function renderTemplate(template: string, v: TemplateVars): string {
  let t = template;
  if (v.negocio.trim() === '') t = t.replace(/\s+en\s+\{negocio\}/g, '');
  for (const [k, val] of Object.entries(v)) t = t.split(`{${k}}`).join(val);
  return t.replace(/[ \t]{2,}/g, ' ').trim();
}

export interface ReminderItem {
  id: string;
  startsAt: string;
  serviceName: string;
  reminderSentAt: string | null;
  clientName: string;
  phone: string | null;
}

export function buildReminderMessage(args: {
  template: string;
  businessName: string;
  item: ReminderItem;
  tz: number;
  todayDate: string;
}): string {
  const ms = Date.parse(args.item.startsAt);
  return renderTemplate(args.template, {
    nombre: firstName(args.item.clientName),
    servicio: args.item.serviceName,
    dia: dayWord(toLocalDate(ms, args.tz), args.todayDate),
    hora: clock12(ms, args.tz),
    negocio: args.businessName.trim(),
  });
}

export const reminderLink = (item: ReminderItem, message: string): string | null =>
  whatsappUrl(item.phone, message);

export function summarize(items: ReminderItem[]) {
  let pending = 0;
  let sent = 0;
  let noPhone = 0;
  for (const i of items) {
    if (whatsappUrl(i.phone) === null) noPhone++;
    else if (i.reminderSentAt) sent++;
    else pending++;
  }
  return { pending, sent, noPhone };
}
