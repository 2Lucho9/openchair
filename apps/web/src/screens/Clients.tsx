import { useState } from 'react';
import { ClientForm } from '../components/ClientForm';
import {
  clientFormToRow,
  emptyClientForm,
  filterClients,
  findDuplicatePhone,
  type ClientForm as Form,
  type ClientStat,
} from '../lib/clients';
import { formatDay } from '../lib/dates';
import { formatMoney } from '../lib/money';
import type { Profile } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';
import { toLocalDate } from '@openchair/engine';
import { ClientDetail } from './ClientDetail';

interface PhoneRow {
  id: string;
  full_name: string;
  phone: string | null;
}

export function Clients({ profile }: { profile: Profile }) {
  const stats = useQuery<ClientStat[]>(
    () =>
      supabase!
        .from('client_stats')
        .select(
          'client_id, full_name, archived_at, visits, no_shows, cancellations, upcoming, last_visit_at, next_appointment_at, total_paid, total_tips, total_due, no_show_rate',
        )
        .order('full_name'),
    [],
  );
  const phones = useQuery<PhoneRow[]>(() => supabase!.from('clients').select('id, full_name, phone'), []);
  const [view, setView] = useState<{ kind: 'list' } | { kind: 'new' } | { kind: 'detail'; id: string }>({ kind: 'list' });
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  if (view.kind === 'new') {
    const known = phones.data ?? [];
    return (
      <ClientForm
        title="Nuevo cliente"
        initial={emptyClientForm}
        warn={(f) => {
          const dup = findDuplicatePhone(known, f.phone);
          return dup ? `Ya existe ${dup.full_name} con ese teléfono.` : null;
        }}
        onSubmit={async (f: Form) => {
          const { data, error } = await supabase!.from('clients').insert(clientFormToRow(f)).select('id').maybeSingle();
          if (error) return error.message;
          stats.reload();
          phones.reload();
          setView(data ? { kind: 'detail', id: (data as { id: string }).id } : { kind: 'list' });
          return null;
        }}
        onCancel={() => setView({ kind: 'list' })}
      />
    );
  }

  if (view.kind === 'detail') {
    return (
      <ClientDetail
        profile={profile}
        clientId={view.id}
        otherClients={phones.data ?? []}
        onBack={() => {
          stats.reload();
          phones.reload();
          setView({ kind: 'list' });
        }}
      />
    );
  }

  const all = stats.data ?? [];
  const archivedCount = all.filter((c) => c.archived_at !== null).length;
  const phoneById = new Map((phones.data ?? []).map((p) => [p.id, p.phone]));
  const base = all
    .filter((c) => showArchived || c.archived_at === null)
    .map((c) => ({ ...c, phone: phoneById.get(c.client_id) ?? null }));
  const filtered = filterClients(base, query);

  return (
    <>
      <button type="button" onClick={() => setView({ kind: 'new' })}>+ Nuevo cliente</button>
      <input
        type="search"
        placeholder="Buscar por nombre o teléfono"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Buscar cliente"
      />
      {stats.loading && <p className="muted">Cargando…</p>}
      {stats.error && <p className="msg error">No se pudo cargar: {stats.error}</p>}
      {!stats.loading && !stats.error && all.length === 0 && (
        <section className="card">
          <p className="muted">Todavía no tienes clientes. Agrega el primero con el botón de arriba.</p>
        </section>
      )}
      {!stats.loading && all.length > 0 && filtered.length === 0 && <p className="muted">Nadie coincide con la búsqueda.</p>}
      <ul className="list stack">
        {filtered.map((c) => (
          <li key={c.client_id}>
            <button type="button" className={c.archived_at ? 'item archived tap' : 'item tap'} onClick={() => setView({ kind: 'detail', id: c.client_id })}>
              <span className="grow">
                <b className="name">{c.full_name}</b>
                <span className="muted">
                  {c.visits} {c.visits === 1 ? 'visita' : 'visitas'}
                  {c.last_visit_at ? ` · última ${formatDay(toLocalDate(Date.parse(c.last_visit_at), profile.tz_offset_min))}` : ''}
                  {c.archived_at ? ' · archivado' : ''}
                </span>
              </span>
              {c.no_shows > 0 && <span className="pill warn-pill">{c.no_shows} falta{c.no_shows === 1 ? '' : 's'}</span>}
              {c.total_due > 0 && <span className="pill due-pill">Debe {formatMoney(c.total_due, profile.currency)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {archivedCount > 0 && (
        <button type="button" className="link" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? 'Ocultar archivados' : `Ver archivados (${archivedCount})`}
        </button>
      )}
    </>
  );
}
