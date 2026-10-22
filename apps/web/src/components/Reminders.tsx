import { useState } from 'react';
import { addDays, toLocalDate } from '@openchair/engine';
import { whatsappUrl } from '../lib/clients';
import { dbErrorMessage } from '../lib/appointments';
import { dayBounds } from '../lib/agenda';
import type { Profile } from '../lib/profile';
import { buildReminderMessage, clock12, reminderLink, summarize, type ReminderItem } from '../lib/reminders';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';

interface ApptRow {
  id: string;
  client_id: string;
  starts_at: string;
  service_name: string;
  reminder_sent_at: string | null;
}

export function Reminders({ profile, onOpen }: { profile: Profile; onOpen: (id: string) => void }) {
  const tz = profile.tz_offset_min;
  const todayDate = toLocalDate(Date.now(), tz);
  const [day, setDay] = useState<'tomorrow' | 'today'>('tomorrow');
  const date = day === 'tomorrow' ? addDays(todayDate, 1) : todayDate;
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const q = useQuery<ReminderItem[]>(async () => {
    const { startMs, endMs } = dayBounds(date, tz);
    const a = await supabase!
      .from('appointments')
      .select('id, client_id, starts_at, service_name, reminder_sent_at')
      .in('status', ['scheduled', 'confirmed'])
      .gte('starts_at', new Date(startMs).toISOString())
      .lt('starts_at', new Date(endMs).toISOString())
      .order('starts_at');
    if (a.error) return { data: null, error: a.error };
    const rows = (a.data ?? []) as ApptRow[];
    if (rows.length === 0) return { data: [], error: null };
    const c = await supabase!
      .from('clients')
      .select('id, full_name, phone')
      .in('id', Array.from(new Set(rows.map((r) => r.client_id))));
    if (c.error) return { data: null, error: c.error };
    const byId = new Map(((c.data ?? []) as { id: string; full_name: string; phone: string | null }[]).map((x) => [x.id, x]));
    const items: ReminderItem[] = rows.map((r) => ({
      id: r.id,
      startsAt: r.starts_at,
      serviceName: r.service_name,
      reminderSentAt: r.reminder_sent_at,
      clientName: byId.get(r.client_id)?.full_name ?? 'Cliente',
      phone: byId.get(r.client_id)?.phone ?? null,
    }));
    return { data: items, error: null };
  }, [date, tz]);

  const items = q.data ?? [];
  const sum = summarize(items);
  const message = (i: ReminderItem) =>
    buildReminderMessage({ template: profile.reminder_template, businessName: profile.business_name, item: i, tz, todayDate });

  async function markSent(id: string, value: string | null) {
    const { error } = await supabase!.from('appointments').update({ reminder_sent_at: value }).eq('id', id);
    if (error) setMsg(dbErrorMessage(error));
    else q.reload();
  }

  function send(i: ReminderItem) {
    const link = reminderLink(i, message(i));
    if (!link) return;
    // Se abre primero (antes de cualquier espera) para que el navegador no bloquee la ventana.
    window.open(link, '_blank', 'noopener,noreferrer');
    setMsg(null);
    void markSent(i.id, new Date().toISOString());
  }

  async function copy(i: ReminderItem) {
    try {
      await navigator.clipboard.writeText(message(i));
      setCopied(i.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setMsg('No se pudo copiar. Usa el botón de WhatsApp.');
    }
  }

  return (
    <section className="card">
      <h2>Recordatorios</h2>
      <div className="seg">
        <button type="button" className={day === 'tomorrow' ? 'on' : ''} onClick={() => setDay('tomorrow')}>Mañana</button>
        <button type="button" className={day === 'today' ? 'on' : ''} onClick={() => setDay('today')}>Hoy</button>
      </div>
      {q.loading && <p className="muted">Cargando…</p>}
      {q.error && <p className="msg error">{q.error}</p>}
      {!q.loading && !q.error && items.length === 0 && (
        <p className="muted">No hay citas {day === 'tomorrow' ? 'para mañana' : 'para hoy'} por recordar.</p>
      )}
      {items.length > 0 && (
        <small className="muted">
          {sum.pending} por enviar · {sum.sent} enviados{sum.noPhone > 0 ? ` · ${sum.noPhone} sin teléfono` : ''}
        </small>
      )}
      <ul className="list stack">
        {items.map((i) => {
          const hasPhone = whatsappUrl(i.phone) !== null;
          return (
            <li key={i.id} className="item">
              <button type="button" className="link plain" onClick={() => onOpen(i.id)} aria-label={`Abrir cita de ${i.clientName}`}>
                <b className="time">{clock12(Date.parse(i.startsAt), tz)}</b>
              </button>
              <span className="grow">
                <b className="name">{i.clientName}</b>
                <span className="muted">{i.serviceName}</span>
              </span>
              {!hasPhone && <span className="pill warn-pill">Sin teléfono</span>}
              {hasPhone && i.reminderSentAt && (
                <>
                  <span className="pill due-pill">Enviado ✓</span>
                  <button type="button" className="secondary small" onClick={() => send(i)}>Reenviar</button>
                </>
              )}
              {hasPhone && !i.reminderSentAt && (
                <button type="button" className="small" onClick={() => send(i)}>WhatsApp</button>
              )}
              {hasPhone && (
                <button type="button" className="secondary small" onClick={() => void copy(i)}>
                  {copied === i.id ? 'Copiado' : 'Copiar'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {sum.sent > 0 && (
        <small className="muted">"Enviado" se marca al abrir WhatsApp; el mensaje lo envías tú desde ahí.</small>
      )}
      {msg && <p className="msg error" role="alert">{msg}</p>}
    </section>
  );
}
