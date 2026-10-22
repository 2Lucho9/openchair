import { useState } from 'react';
import { formatDateTime } from '../lib/dates';
import { localInputToIso } from '../lib/hours';
import type { Profile } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';

interface TimeOffRow {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
}

export function TimeOffEditor({ profile }: { profile: Profile }) {
  const tz = profile.tz_offset_min;
  const q = useQuery<TimeOffRow[]>(
    () =>
      supabase!
        .from('time_off')
        .select('id, starts_at, ends_at, reason')
        .gte('ends_at', new Date().toISOString())
        .order('starts_at'),
    [],
  );
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setErr(null);
    const a = localInputToIso(from, tz);
    const b = localInputToIso(to, tz);
    if (!a || !b) return setErr('Elige la fecha y hora de inicio y de fin.');
    if (Date.parse(b) <= Date.parse(a)) return setErr('El fin debe ser después del inicio.');
    if (reason.length > 200) return setErr('El motivo es muy largo (máximo 200).');
    setBusy(true);
    const { error } = await supabase!.from('time_off').insert({ starts_at: a, ends_at: b, reason: reason.trim() });
    setBusy(false);
    if (error) return setErr(error.message);
    setFrom('');
    setTo('');
    setReason('');
    q.reload();
  }

  async function remove(id: string) {
    const { error } = await supabase!.from('time_off').delete().eq('id', id);
    if (error) setErr(error.message);
    else q.reload();
  }

  const rows = q.data ?? [];
  return (
    <section className="card">
      <h2>Bloqueos</h2>
      <p className="muted">Vacaciones, almuerzo o permisos: en ese rango no se ofrecen sillas libres.</p>
      {q.error && <p className="msg error">{q.error}</p>}
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id} className="item">
            <span className="grow">
              <b className="name">{formatDateTime(Date.parse(r.starts_at), tz)} → {formatDateTime(Date.parse(r.ends_at), tz)}</b>
              {r.reason && <span className="muted">{r.reason}</span>}
            </span>
            <button type="button" className="x" aria-label="Quitar bloqueo" onClick={() => void remove(r.id)}>×</button>
          </li>
        ))}
      </ul>
      <label>
        Desde
        <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label>
        Hasta
        <input type="datetime-local" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
      </label>
      <label>
        Motivo (opcional)
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Almuerzo, vacaciones…" />
      </label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <button type="button" disabled={busy} onClick={() => void add()}>Agregar bloqueo</button>
    </section>
  );
}
