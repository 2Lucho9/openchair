import { useState } from 'react';
import {
  DAY_NAMES,
  WEEK_ORDER,
  formatMinutes,
  groupByDay,
  parseShift,
  presetRows,
  type HourRow,
} from '../lib/hours';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';

export function HoursEditor() {
  const q = useQuery<HourRow[]>(
    () => supabase!.from('working_hours').select('id, weekday, start_min, end_min').order('start_min'),
    [],
  );
  const [day, setDay] = useState('1');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rows = q.data ?? [];
  const byDay = groupByDay(rows);

  async function add() {
    setErr(null);
    const shift = parseShift(start, end);
    if (!shift.ok) return setErr(shift.error);
    setBusy(true);
    const { error } = await supabase!
      .from('working_hours')
      .insert({ weekday: Number(day), start_min: shift.start_min, end_min: shift.end_min });
    setBusy(false);
    if (error) setErr(error.code === '23P01' ? 'Ese turno se cruza con otro del mismo día.' : error.message);
    else q.reload();
  }

  async function remove(id: string) {
    setErr(null);
    const { error } = await supabase!.from('working_hours').delete().eq('id', id);
    if (error) setErr(error.message);
    else q.reload();
  }

  async function preset() {
    setErr(null);
    setBusy(true);
    const { error } = await supabase!.from('working_hours').insert(presetRows([1, 2, 3, 4, 5, 6], 540, 1080));
    setBusy(false);
    if (error) setErr(error.code === '23P01' ? 'Ya tienes turnos que se cruzan con ese horario. Quita los existentes primero.' : error.message);
    else q.reload();
  }

  return (
    <section className="card">
      <h2>Horario semanal</h2>
      {q.loading && <p className="muted">Cargando…</p>}
      {q.error && <p className="msg error">{q.error}</p>}
      {!q.loading && rows.length === 0 && (
        <>
          <p className="muted">Aún no tienes horario. Sin horario no se ofrecen sillas libres.</p>
          <button type="button" className="secondary" disabled={busy} onClick={() => void preset()}>
            Usar lunes a sábado, 09:00 a 18:00
          </button>
        </>
      )}
      <ul className="list">
        {WEEK_ORDER.filter((d) => byDay[d]).map((d) => (
          <li key={d} className="item">
            <b className="day">{DAY_NAMES[d]}</b>
            <span className="grow">
              {byDay[d].map((r) => (
                <span key={r.id} className="shift">
                  {formatMinutes(r.start_min)} – {formatMinutes(r.end_min)}
                  <button type="button" className="x" aria-label={`Quitar turno de ${DAY_NAMES[d]}`} onClick={() => void remove(r.id)}>×</button>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="add-shift">
        <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Día">
          {WEEK_ORDER.map((d) => (
            <option key={d} value={String(d)}>{DAY_NAMES[d]}</option>
          ))}
        </select>
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Desde" />
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Hasta" />
        <button type="button" disabled={busy} onClick={() => void add()}>Agregar</button>
      </div>
      <small className="muted">Si la hora final es menor que la inicial, el turno termina al día siguiente (ej. 20:00 a 02:00).</small>
      {err && <p className="msg error" role="alert">{err}</p>}
    </section>
  );
}
