export interface ClientStat {
  client_id: string;
  full_name: string;
  archived_at: string | null;
  visits: number;
  no_shows: number;
  cancellations: number;
  upcoming: number;
  last_visit_at: string | null;
  next_appointment_at: string | null;
  total_paid: number;
  total_tips: number;
  total_due: number;
  no_show_rate: number | null;
}

export interface ClientForm {
  full_name: string;
  phone: string;
  email: string;
  notes: string;
}

export type ClientErrors = Partial<Record<keyof ClientForm, string>>;

export const emptyClientForm: ClientForm = { full_name: '', phone: '', email: '', notes: '' };

/** Mismas reglas que las restricciones de la tabla clients. */
export function validateClientForm(f: ClientForm): ClientErrors {
  const e: ClientErrors = {};
  const name = f.full_name.trim();
  if (name.length < 1 || name.length > 120) e.full_name = 'Escribe el nombre (máximo 120 caracteres).';
  const phone = f.phone.trim();
  if (phone !== '' && (phone.length < 5 || phone.length > 32)) e.phone = 'Entre 5 y 32 caracteres.';
  if (f.email.trim().length > 200) e.email = 'Máximo 200 caracteres.';
  else if (f.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Correo no válido.';
  if (f.notes.length > 5000) e.notes = 'Máximo 5000 caracteres.';
  return e;
}

export function clientFormToRow(f: ClientForm) {
  return {
    full_name: f.full_name.trim(),
    phone: f.phone.trim() === '' ? null : f.phone.trim(),
    email: f.email.trim() === '' ? null : f.email.trim(),
    notes: f.notes,
  };
}

const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const digits = (s: string): string => s.replace(/\D/g, '');

/** Busca por nombre (sin tildes ni mayúsculas) o por dígitos del teléfono. */
export function filterClients<T extends { full_name: string; phone?: string | null }>(list: T[], query: string): T[] {
  const q = fold(query.trim());
  if (q === '') return list;
  const qd = digits(q);
  return list.filter(
    (c) => fold(c.full_name).includes(q) || (qd.length >= 3 && digits(c.phone ?? '').includes(qd)),
  );
}

/** Otro cliente con el mismo teléfono (comparando solo dígitos). */
export function findDuplicatePhone<T extends { id: string; full_name: string; phone: string | null }>(
  list: T[],
  phone: string,
  exceptId?: string,
): T | undefined {
  const d = digits(phone);
  if (d.length < 5) return undefined;
  return list.find((c) => c.id !== exceptId && digits(c.phone ?? '') === d);
}

/** Enlace de WhatsApp. Un número de 8 dígitos se asume de Costa Rica (+506). */
export function whatsappUrl(phone: string | null | undefined, text?: string): string | null {
  const d = digits(phone ?? '');
  const full = d.length === 8 ? '506' + d : d;
  if (full.length < 10) return null;
  return `https://wa.me/${full}` + (text ? `?text=${encodeURIComponent(text)}` : '');
}
