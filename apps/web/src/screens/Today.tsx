import { useEffect, useState } from 'react';
import { formatHM } from '@openchair/engine';
import { buildSchedule, buildTodayView, todayRange, type AppointmentRow, type WorkingHoursRow } from '../lib/today';
import type { Profile } from '../lib/profile';
import { supabase } from '../lib/supabase';

export function Today({ profile }: { profile: Profile }) {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; appts: AppointmentRow[]; hours: WorkingHoursRow[] }
  >({ kind: 'loading' });

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { startIso, endIso } = todayRange(Date.now(), profile.tz_offset_min);
    Promise.all([
      supabase
        .from('appointments')
        .select('id, starts_at, ends_at, status, service_name')
        .gte('starts_at', startIso)
        .lt('starts_at', endIso)
        .order('starts_at'),
      supabase.from('working_hours').select('weekday, start_min, end_min'),
    ]).then(([a, h]) => {
      if (!active) return;
      const err = a.error ?? h.error;
      if (err) setState({ kind: 'error', message: err.message });
      else
        setState({
          kind: 'ready',
          appts: (a.data ?? []) as AppointmentRow[],
          hours: (h.data ?? []) as WorkingHoursRow[],
        });
    });
    return () => {
      active = false;
    };
  }, [profile.tz_offset_min]);

  if (state.kind === 'loading') return <p className="muted">Cargando tu día…</p>;
  if (state.kind === 'error') return <p className="msg error">No se pudo cargar: {state.message}</p>;

  const tz = profile.tz_offset_min;
  const view = buildTodayView({
    now: Date.now(),
    schedule: buildSchedule(state.hours, tz),
    appointments: state.appts,
    durationMin: profile.slot_step_min,
    bufferMin: profile.buffer_min,
    stepMin: profile.slot_step_min,
    minNoticeMin: profile.min_notice_min,
  });
  const active = state.appts.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show');

  return (
    <>
      <section className="card">
        <h2>Citas de hoy</h2>
        {active.length === 0 ? (
          <p className="muted">Hoy no tienes citas. Las pantallas para agendar llegan en la Fase 5.</p>
        ) : (
          <ul className="list">
            {active.map((a) => (
              <li key={a.id}>
                <b>{formatHM(Date.parse(a.starts_at), tz)}</b> {a.service_name}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2>Sillas libres hoy</h2>
        {!view.hasHours ? (
          <p className="muted">Todavía no hay horario para hoy. Se configura en la Fase 5.</p>
        ) : view.freeStarts.length === 0 ? (
          <p className="muted">Sin sillas libres hoy.</p>
        ) : (
          <div className="chips">
            {view.freeStarts.map((s) => (
              <span className="chip" key={s.start}>
                {formatHM(s.start, tz)}
              </span>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
