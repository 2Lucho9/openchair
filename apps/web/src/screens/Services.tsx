import { useState } from 'react';
import { ServiceForm } from '../components/ServiceForm';
import { formatMoney } from '../lib/money';
import type { Profile } from '../lib/profile';
import {
  emptyServiceForm,
  formatDuration,
  serviceFormToRow,
  serviceToForm,
  type ServiceForm as Form,
  type ServiceRow,
} from '../lib/services';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';

export function Services({ profile }: { profile: Profile }) {
  const q = useQuery<ServiceRow[]>(
    () => supabase!.from('services').select('id, name, duration_min, price, archived_at').order('name'),
    [],
  );
  const [editing, setEditing] = useState<ServiceRow | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const symbol = profile.currency === 'CRC' ? '₡' : '$';

  async function save(f: Form): Promise<string | null> {
    const row = serviceFormToRow(f);
    const res =
      editing === 'new' || editing === null
        ? await supabase!.from('services').insert(row)
        : await supabase!.from('services').update(row).eq('id', editing.id);
    if (res.error) return res.error.message;
    setEditing(null);
    q.reload();
    return null;
  }

  async function setArchived(s: ServiceRow, archived: boolean) {
    setActionError(null);
    const { error } = await supabase!
      .from('services')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', s.id);
    if (error) setActionError(error.message);
    else q.reload();
  }

  if (editing !== null) {
    return (
      <ServiceForm
        title={editing === 'new' ? 'Nuevo servicio' : 'Editar servicio'}
        initial={editing === 'new' ? emptyServiceForm : serviceToForm(editing)}
        currencySymbol={symbol}
        onSubmit={save}
        onCancel={() => setEditing(null)}
      />
    );
  }

  const all = q.data ?? [];
  const list = all.filter((s) => showArchived || s.archived_at === null);
  const archivedCount = all.filter((s) => s.archived_at !== null).length;

  return (
    <>
      <button type="button" onClick={() => setEditing('new')}>+ Nuevo servicio</button>
      {q.loading && <p className="muted">Cargando…</p>}
      {q.error && <p className="msg error">No se pudo cargar: {q.error}</p>}
      {actionError && <p className="msg error">{actionError}</p>}
      {!q.loading && !q.error && list.length === 0 && (
        <section className="card">
          <p className="muted">Todavía no tienes servicios. Crea el primero (por ejemplo "Corte", 30 min).</p>
        </section>
      )}
      <ul className="list stack">
        {list.map((s) => (
          <li key={s.id} className={s.archived_at ? 'item archived' : 'item'}>
            <div className="grow">
              <b className="name">{s.name}</b>
              <span className="muted">
                {formatDuration(s.duration_min)} · {formatMoney(s.price, profile.currency)}
                {s.archived_at ? ' · archivado' : ''}
              </span>
            </div>
            <button type="button" className="secondary small" onClick={() => setEditing(s)}>Editar</button>
            <button type="button" className="secondary small" onClick={() => void setArchived(s, s.archived_at === null)}>
              {s.archived_at ? 'Restaurar' : 'Archivar'}
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
