export const SLOT_STEPS = [5, 10, 15, 20, 30, 60] as const;

export interface Profile {
  id: string;
  display_name: string;
  business_name: string;
  phone: string | null;
  currency: 'CRC' | 'USD';
  tz_offset_min: number;
  buffer_min: number;
  slot_step_min: number;
  min_notice_min: number;
  reminder_template: string;
}

export interface ProfileForm {
  display_name: string;
  business_name: string;
  phone: string;
  currency: string;
  buffer_min: string;
  slot_step_min: string;
  min_notice_min: string;
  reminder_template: string;
}

export type ProfileErrors = Partial<Record<keyof ProfileForm, string>>;

export function profileToForm(p: Profile): ProfileForm {
  return {
    display_name: p.display_name,
    business_name: p.business_name,
    phone: p.phone ?? '',
    currency: p.currency,
    buffer_min: String(p.buffer_min),
    slot_step_min: String(p.slot_step_min),
    min_notice_min: String(p.min_notice_min),
    reminder_template: p.reminder_template,
  };
}

const isInt = (s: string): boolean => /^\d+$/.test(s.trim());

/** Las mismas reglas que las restricciones CHECK de la tabla profiles. */
export function validateProfileForm(f: ProfileForm): ProfileErrors {
  const e: ProfileErrors = {};
  if (f.display_name.length > 120) e.display_name = 'Máximo 120 caracteres.';
  if (f.business_name.length > 120) e.business_name = 'Máximo 120 caracteres.';
  const phone = f.phone.trim();
  if (phone !== '' && (phone.length < 5 || phone.length > 32)) e.phone = 'Entre 5 y 32 caracteres.';
  if (f.currency !== 'CRC' && f.currency !== 'USD') e.currency = 'Moneda no soportada.';
  if (!isInt(f.buffer_min) || Number(f.buffer_min) > 240) e.buffer_min = 'Un número entre 0 y 240.';
  if (!isInt(f.slot_step_min) || !(SLOT_STEPS as readonly number[]).includes(Number(f.slot_step_min)))
    e.slot_step_min = 'Elige 5, 10, 15, 20, 30 o 60.';
  if (!isInt(f.min_notice_min) || Number(f.min_notice_min) > 10080)
    e.min_notice_min = 'Un número entre 0 y 10080 (una semana).';
  const tpl = f.reminder_template.trim().length;
  if (tpl < 1 || f.reminder_template.length > 500) e.reminder_template = 'Entre 1 y 500 caracteres.';
  return e;
}

export function formToUpdate(f: ProfileForm) {
  return {
    display_name: f.display_name.trim(),
    business_name: f.business_name.trim(),
    phone: f.phone.trim() === '' ? null : f.phone.trim(),
    currency: f.currency as 'CRC' | 'USD',
    buffer_min: Number(f.buffer_min),
    slot_step_min: Number(f.slot_step_min),
    min_notice_min: Number(f.min_notice_min),
    reminder_template: f.reminder_template.trim(),
  };
}
