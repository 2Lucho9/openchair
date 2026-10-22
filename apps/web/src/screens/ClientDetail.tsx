import { useState } from 'react';
import { ClientForm } from '../components/ClientForm';
import {
  clientFormToRow,
  findDuplicatePhone,
  whatsappUrl,
  type ClientForm as Form,
  type ClientStat,
} from '../lib/clients';
import { STATUS_LABEL, formatDateTime } from '../lib/dates';
import { formatMoney } from '../lib/money';
import type { Profile } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';

interface ClientRow {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string;
  archived_at: string | null;
}

interface HistoryRow {
  id: string;
  starts_at: string;
  service_name: string;
  price: number;
  status: string;
}

export function ClientDetail(props: {
  profile: Profile;
  clientId: string;
  otherClients: { id: string; full_name: string; phone: string | null }[];
  onBack: () => void;
}) {
  const { profile, clientId } = props;
  const client = useQuery<ClientRow>(
    () => supabase!.from('clients').select('id, full_name, phone, email, notes, archived_at').eq('id', clientId).maybeSingle(),
    [clientId],
  );
  const stat = useQuery<ClientStat>(
    () =>
      supabase!
        .from('client_stats')
        .select('client_id, full_name, archived_at, visits, no_shows, cancellations, upcoming, last_visit_at, next_appointment_at, total_paid, total_tips, total_due, no_show_rate')
        .eq('client_id', clientId)
        .maybeSingle(),
    [clientId],
  );
  const history = useQuery<HistoryRow[]>(
    () =>
      supabase!
        .from('appointments')
        .select('id, starts_at, service_name, price, status')
        .eq('client_id', clientId)
        .order('starts_at', { ascending: false })
        .limit(50),
    [clientId],
  );
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const c = client.data;
  if (client.loading) return <p className="muted">Cargando…</p>;
  if (client.error || !c)
    return (
      <section className="card">
        <p className="msg error">{client.error ?? 'No se encontró el cliente.'}</p>
        <button type="button" onClick={props.onBack}>Volver</button>
      </section>
    );

  if (editing) {
    return (
      <ClientForm
        title="Editar cliente"
        initial={{ full_name: c.full_name, phone: c.phone ?? '', email: c.email ?? '', notes: c.notes }}
        warn={(f: Form) => {
          const dup = findDuplicatePhone(props.otherClients, f.phone, c.id);
          return dup ? `Ya existe ${dup.full_name} con ese teléfono.` : null;
        }}
        onSubmit={async (f: Form) => {
          const { error } = await supabase!.from('clients').update(clientFormToRow(f)).eq('id', c.id);
          if (error) return error.message;
          setEditing(false);
          client.reload();
          stat.reload();
          return null;
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  async function setArchived(archived: boolean) {
    setActionError(null);
    const { error } = await supabase!
      .from('clients')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', c!.id);
    if (error) setActionError(error.message);
    else client.reload();
  }

  const s = stat.data;
  const wa = whatsappUrl(c.phone);
  const money = (n: number) => formatMoney(n, profile.currency);

  return (
    <>
      <button type="button" className="link left" onClick={props.onBack}>← Clientes</button>
      <section className="card">
        <h2>{c.full_name}{c.archived_at ? ' (archivado)' : ''}</h2>
        {c.phone && <p>{c.phone}</p>}
        {c.email && <p>{c.email}</p>}
        <div className="row">
          {wa && <a className="btn secondary" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
          <button type="button" className="secondary" onClick={() => setEditing(true)}>Editar</button>
          <button type="button" className="secondary" onClick={() => void setArchived(c.archived_at === null)}>
            {c.archived_at ? 'Restaurar' : 'Archivar'}
          </button>
        </div>
        {actionError && <p className="msg error">{actionError}</p>}
      </section>

      {s && (
        <section className="card">
          <h2>Control del cliente</h2>
          <div className="stats">
            <div><b>{s.visits}</b><span>Visitas</span></div>
            <div><b>{s.no_shows}</b><span>Faltas</span></div>
            <div><b>{s.cancellations}</b><span>Cancelaciones</span></div>
            <div><b>{money(s.total_paid)}</b><span>Pagado</span></div>
            <div><b>{money(s.total_tips)}</b><span>Propinas</span></div>
            <div className={s.total_due > 0 ? 'due' : ''}><b>{money(s.total_due)}</b><span>Pendiente</span></div>
          </div>
          {s.next_appointment_at && <p className="muted">Próxima cita: {formatDateTime(Date.parse(s.next_appointment_at), profile.tz_offset_min)}</p>}
        </section>
      )}

      {c.notes.trim() !== '' && (
        <section className="card">
          <h2>Notas</h2>
          <p className="notes">{c.notes}</p>
        </section>
      )}

      <section className="card">
        <h2>Historial</h2>
        {history.loading && <p className="muted">Cargando…</p>}
        {history.error && <p className="msg error">{history.error}</p>}
        {!history.loading && (history.data ?? []).length === 0 && <p className="muted">Sin citas todavía.</p>}
        <ul className="list">
          {(history.data ?? []).map((h) => (
            <li key={h.id} className="item">
              <span className="grow">
                <b className="name">{h.service_name}</b>
                <span className="muted">{formatDateTime(Date.parse(h.starts_at), profile.tz_offset_min)} · {STATUS_LABEL[h.status] ?? h.status}</span>
              </span>
              <span>{money(h.price)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
