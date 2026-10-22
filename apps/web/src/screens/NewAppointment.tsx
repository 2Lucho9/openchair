import { useState, type FormEvent } from 'react';
import { SlotPicker } from '../components/SlotPicker';
import { buildAppointmentRow, dbErrorMessage } from '../lib/appointments';
import { filterClients } from '../lib/clients';
import { formatDuration, type ServiceRow } from '../lib/services';
import { formatMoney } from '../lib/money';
import type { Profile } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';

interface ClientOpt {
  id: string;
  full_name: string;
  phone: string | null;
}

export function NewAppointment(props: {
  profile: Profile;
  initialDate: string;
  onDone: (createdId: string | null) => void;
}) {
  const { profile } = props;
  const clients = useQuery<ClientOpt[]>(
    () => supabase!.from('clients').select('id, full_name, phone').is('archived_at', null).order('full_name'),
    [],
  );
  const services = useQuery<ServiceRow[]>(
    () => supabase!.from('services').select('id, name, duration_min, price, archived_at').is('archived_at', null).order('name'),
    [],
  );
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [clientId, setClientId] = useState('');
  const [filter, setFilter] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(props.initialDate);
  const [startMs, setStartMs] = useState<number | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [priceText, setPriceText] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const service = (services.data ?? []).find((s) => s.id === serviceId);
  const clientList = clients.data ?? [];
  const matches = filterClients(clientList, filter).slice(0, 6);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!service) return setErr('Elige un servicio.');
    if (startMs === null) return setErr('Elige la hora.');
    if (!allowed) return setErr('Esa hora tiene problemas: elige otra o marca "Agendar de todos modos".');
    let cid = clientId;
    if (clientMode === 'new') {
      const name = newName.trim();
      const phone = newPhone.trim();
      if (name === '') return setErr('Escribe el nombre del cliente.');
      if (phone !== '' && (phone.length < 5 || phone.length > 32)) return setErr('El teléfono debe tener entre 5 y 32 caracteres.');
    }
    if (clientMode === 'existing' && !cid) return setErr('Elige un cliente.');

    setBusy(true);
    if (clientMode === 'new') {
      const { data, error } = await supabase!
        .from('clients')
        .insert({ full_name: newName.trim(), phone: newPhone.trim() === '' ? null : newPhone.trim() })
        .select('id')
        .maybeSingle();
      if (error || !data) {
        setBusy(false);
        return setErr(error ? dbErrorMessage(error) : 'No se pudo crear el cliente.');
      }
      cid = (data as { id: string }).id;
    }
    const built = buildAppointmentRow({ clientId: cid, service, startMs, priceText, notes });
    if (!built.ok) {
      setBusy(false);
      return setErr(built.error);
    }
    const { data, error } = await supabase!.from('appointments').insert(built.row).select('id').maybeSingle();
    setBusy(false);
    if (error) return setErr(dbErrorMessage(error));
    props.onDone(data ? (data as { id: string }).id : null);
  }

  if (clients.loading || services.loading) return <p className="muted">Cargando…</p>;
  if ((services.data ?? []).length === 0)
    return (
      <section className="card">
        <h2>Nueva cita</h2>
        <p className="muted">Primero crea al menos un servicio en la pestaña Servicios.</p>
        <button type="button" onClick={() => props.onDone(null)}>Volver</button>
      </section>
    );

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>Nueva cita</h2>

      <div className="seg" role="tablist">
        <button type="button" className={clientMode === 'existing' ? 'on' : ''} onClick={() => setClientMode('existing')}>Cliente existente</button>
        <button type="button" className={clientMode === 'new' ? 'on' : ''} onClick={() => setClientMode('new')}>Cliente nuevo</button>
      </div>

      {clientMode === 'existing' ? (
        <>
          <input type="search" placeholder="Buscar cliente" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Buscar cliente" />
          {clientList.length === 0 && <p className="muted">Aún no tienes clientes: usa "Cliente nuevo".</p>}
          <ul className="list">
            {matches.map((c) => (
              <li key={c.id}>
                <button type="button" className={c.id === clientId ? 'item tap picked' : 'item tap'} onClick={() => setClientId(c.id)}>
                  <span className="grow"><b className="name">{c.full_name}</b><span className="muted">{c.phone ?? 'sin teléfono'}</span></span>
                  {c.id === clientId && <span className="pill due-pill">Elegido</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <label>Nombre del cliente<input value={newName} onChange={(e) => setNewName(e.target.value)} autoComplete="off" /></label>
          <label>Teléfono / WhatsApp<input type="tel" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} /></label>
        </>
      )}

      <label>
        Servicio
        <select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setPriceText(''); setStartMs(null); setAllowed(false); }}>
          <option value="">Elige un servicio</option>
          {(services.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name} · {formatDuration(s.duration_min)} · {formatMoney(s.price, profile.currency)}</option>
          ))}
        </select>
      </label>

      {service && (
        <>
          <SlotPicker
            key={service.id}
            profile={profile}
            date={date}
            onDate={setDate}
            durationMin={service.duration_min}
            onPick={(ms, ok) => { setStartMs(ms); setAllowed(ok); }}
          />
          <label>
            Precio (déjalo vacío para usar {formatMoney(service.price, profile.currency)})
            <input inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
          </label>
          <label>
            Notas de la cita
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </>
      )}

      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="row">
        <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Agendar'}</button>
        <button type="button" className="secondary" onClick={() => props.onDone(null)}>Cancelar</button>
      </div>
    </form>
  );
}
