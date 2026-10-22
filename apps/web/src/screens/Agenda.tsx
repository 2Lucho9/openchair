import { useState } from 'react';
import { addDays, dayOfWeek, formatHM, toLocalDate } from '@openchair/engine';
import { DAY_LETTER, appointmentsOfDay, countByDay, weekDates } from '../lib/agenda';
import { loadWindow } from '../lib/data';
import { STATUS_LABEL, formatDay } from '../lib/dates';
import { formatMoney } from '../lib/money';
import type { Profile } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { buildSchedule, buildTodayView } from '../lib/today';
import { useQuery } from '../lib/useQuery';
import { Reminders } from '../components/Reminders';
import { AppointmentDetail } from './AppointmentDetail';
import { NewAppointment } from './NewAppointment';

type Flow = { kind: 'day' } | { kind: 'new' } | { kind: 'detail'; id: string };

interface Extras {
  clients: Map<string, string>;
  balances: Map<string, { paid: number; due: number }>;
}

export function Agenda({ profile, mode }: { profile: Profile; mode: 'today' | 'agenda' }) {
  const tz = profile.tz_offset_min;
  const todayDate = toLocalDate(Date.now(), tz);
  const [picked, setPicked] = useState(todayDate);
  const [flow, setFlow] = useState<Flow>({ kind: 'day' });
  const date = mode === 'today' ? todayDate : picked;
  const week = weekDates(date);

  const q = useQuery(async () => {
    const win = await loadWindow(week[0], week[6], tz);
    if (win.error || !win.data) return { data: null, error: win.error };
    const ids = win.data.appointments.map((a) => a.id);
    const [c, b] = await Promise.all([
      supabase!.from('clients').select('id, full_name'),
      ids.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase!.from('appointment_balances').select('appointment_id, paid, due').in('appointment_id', ids),
    ]);
    const err = c.error ?? b.error;
    if (err) return { data: null, error: err };
    const extras: Extras = {
      clients: new Map(((c.data ?? []) as { id: string; full_name: string }[]).map((x) => [x.id, x.full_name])),
      balances: new Map(
        ((b.data ?? []) as { appointment_id: string; paid: number; due: number }[]).map((x) => [x.appointment_id, { paid: x.paid, due: x.due }]),
      ),
    };
    return { data: { win: win.data, extras }, error: null };
  }, [week[0], tz]);

  if (flow.kind === 'new') {
    return (
      <NewAppointment
        profile={profile}
        initialDate={date}
        onDone={(id) => {
          q.reload();
          setFlow(id ? { kind: 'detail', id } : { kind: 'day' });
        }}
      />
    );
  }
  if (flow.kind === 'detail') {
    return (
      <AppointmentDetail
        profile={profile}
        id={flow.id}
        onBack={() => {
          q.reload();
          setFlow({ kind: 'day' });
        }}
      />
    );
  }

  const data = q.data;
  const day = data ? appointmentsOfDay(data.win.appointments, date, tz) : [];
  const counts = data ? countByDay(data.win.appointments, tz) : {};
  const view = data
    ? buildTodayView({
        now: Date.now(),
        date,
        schedule: buildSchedule(data.win.hours, tz),
        appointments: data.win.appointments,
        timeOff: data.win.timeOff,
        durationMin: profile.slot_step_min,
        bufferMin: profile.buffer_min,
        stepMin: profile.slot_step_min,
        minNoticeMin: profile.min_notice_min,
      })
    : null;
  const money = (n: number) => formatMoney(n, profile.currency);

  return (
    <>
      <button type="button" onClick={() => setFlow({ kind: 'new' })}>+ Nueva cita</button>

      {mode === 'agenda' && (
        <section className="card">
          <div className="datenav">
            <button type="button" className="secondary small" onClick={() => setPicked(addDays(date, -1))} aria-label="Día anterior">‹</button>
            <input type="date" value={date} onChange={(e) => e.target.value && setPicked(e.target.value)} aria-label="Fecha" />
            <button type="button" className="secondary small" onClick={() => setPicked(addDays(date, 1))} aria-label="Día siguiente">›</button>
            <button type="button" className="secondary small" onClick={() => setPicked(todayDate)}>Hoy</button>
          </div>
          <div className="week">
            {week.map((d) => (
              <button
                key={d}
                type="button"
                className={d === date ? 'daybtn on' : 'daybtn'}
                onClick={() => setPicked(d)}
                aria-label={formatDay(d)}
              >
                <small>{DAY_LETTER[dayOfWeek(d)]}</small>
                <b>{Number(d.slice(8))}</b>
                <span className={counts[d] ? 'dot' : 'dot off'}>{counts[d] ?? 0}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {mode === 'today' && <Reminders profile={profile} onOpen={(id) => setFlow({ kind: 'detail', id })} />}

      {q.loading && <p className="muted">Cargando…</p>}
      {q.error && <p className="msg error">No se pudo cargar: {q.error}</p>}

      {data && (
        <>
          <section className="card">
            <h2>{mode === 'today' ? 'Citas de hoy' : `Citas del ${formatDay(date)}`}</h2>
            {day.length === 0 ? (
              <p className="muted">No hay citas este día.</p>
            ) : (
              <ul className="list stack">
                {day.map((a) => {
                  const bal = data.extras.balances.get(a.id);
                  const off = a.status === 'cancelled' || a.status === 'no_show';
                  return (
                    <li key={a.id}>
                      <button type="button" className={off ? 'item tap archived' : 'item tap'} onClick={() => setFlow({ kind: 'detail', id: a.id })}>
                        <b className="time">{formatHM(Date.parse(a.starts_at), tz)}</b>
                        <span className="grow">
                          <b className="name">{data.extras.clients.get(a.client_id) ?? 'Cliente'}</b>
                          <span className="muted">{a.service_name} · {STATUS_LABEL[a.status] ?? a.status}</span>
                        </span>
                        {a.status === 'completed' && bal && bal.due > 0 && <span className="pill due-pill">Debe {money(bal.due)}</span>}
                        {a.status === 'completed' && bal && bal.due === 0 && <span className="pill">Pagada</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {date >= todayDate && (
          <section className="card">
            <h2>Sillas libres</h2>
            {!view?.hasHours ? (
              <p className="muted">Ese día no tienes horario. Se configura en Ajustes.</p>
            ) : view.freeStarts.length === 0 ? (
              <p className="muted">Sin sillas libres.</p>
            ) : (
              <>
                <div className="chips">
                  {view.freeStarts.map((s) => (
                    <span className="chip" key={s.start}>{formatHM(s.start, tz)}</span>
                  ))}
                </div>
                <small className="muted">Para un servicio de {profile.slot_step_min} min.</small>
              </>
            )}
          </section>
          )}
        </>
      )}
    </>
  );
}
