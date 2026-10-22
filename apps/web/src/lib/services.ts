import { parsePrice } from './money';

export interface ServiceRow {
  id: string;
  name: string;
  duration_min: number;
  price: number;
  archived_at: string | null;
}

export interface ServiceForm {
  name: string;
  duration_min: string;
  price: string;
}

export type ServiceErrors = Partial<Record<keyof ServiceForm, string>>;

export const emptyServiceForm: ServiceForm = { name: '', duration_min: '30', price: '' };

export function serviceToForm(s: ServiceRow): ServiceForm {
  return { name: s.name, duration_min: String(s.duration_min), price: String(s.price) };
}

/** Mismas reglas que las restricciones de la tabla services. */
export function validateServiceForm(f: ServiceForm): ServiceErrors {
  const e: ServiceErrors = {};
  const name = f.name.trim();
  if (name.length < 1 || name.length > 120) e.name = 'Escribe un nombre (máximo 120 caracteres).';
  const dur = f.duration_min.trim();
  if (!/^\d+$/.test(dur) || Number(dur) < 5 || Number(dur) > 1440) e.duration_min = 'Entre 5 y 1440 minutos.';
  if (f.price.trim() !== '' && parsePrice(f.price) === null) e.price = 'Escribe un precio válido (ej. 5000).';
  return e;
}

export function serviceFormToRow(f: ServiceForm) {
  return {
    name: f.name.trim(),
    duration_min: Number(f.duration_min),
    price: f.price.trim() === '' ? 0 : (parsePrice(f.price) as number),
  };
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
