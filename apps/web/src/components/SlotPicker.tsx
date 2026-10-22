import { useState } from 'react';
import { checkSlot, formatHM, localToMs, type Reason } from '@openchair/engine';
import { reasonsText } from '../lib/agenda';
import { loadWindow } from '../lib/data';
import type { Profile } from '../lib/profile';
import { buildSchedule, buildTodayView, toEngineAppointments } from '../lib/today';
import { useQuery } from '../lib/useQuery';

/**
 * Elige día y hora. Ofrece las sillas libres que calcula el motor y deja escribir otra hora:
 * si esa hora tiene problemas (fuera de horario, choque, bloqueo) se avisa y hay que marcar
 * "Agendar de todos modos".
 */
export function SlotPicker(props: {
  profile: Profile;
  date: string;
  onDate: (d: string) => void;
  durationMin: number;
  excludeId?: string;
  /** Se llama con la hora elegida (ms) y si se puede guardar así; null si no hay hora. */
  onPick: (startMs: number | null, allowed: boolean) => void;
}) {
  const { profile, date, durationMin } = props;
  const tz = profile.tz_offset_min;
  const win = useQuery(() => loadWindow(date, date, tz), [date, tz]);
  const [picked, setPicked] = useState<number | null>(null);
  const [manual, setManual] = useState('');
  const [override, setOverride] = useState(false);

  const w = win.data;
  const schedule = buildSchedule(w?.hours ?? [], tz);
  const view = buildTodayView({
    now: Date.now(),
    date,
    schedule,
    appointments: w?.appointments ?? [],
    timeOff: w?.timeOff,
    excludeId: props.excludeId,
    durationMin,
    bufferMin: profile.buffer_min,
    stepMin: profile.slot_step_min,
    minNoticeMin: profile.min_notice_min,
  });

  function evaluate(ms: number | null): Reason[] {
    if (ms === null || !w) return [];
    return checkSlot(
      { start: ms, end: ms + durationMin * 60_000 },
      {
        schedule,
        appointments: toEngineAppointments(w.appointments),
        timeOff: w.timeOff,
        bufferMin: profile.buffer_min,
        excludeId: props.excludeId,
      },
    ).reasons;
  }
  const reasons = evaluate(picked);

  function chooseChip(ms: number) {
    setPicked(ms);
    setManual('');
    setOverride(false);
    props.onPick(ms, true);
  }

  function onManual(value: string) {
    setManual(value);
    setOverride(false);
    if (!/^\d{2}:\d{2}$/.test(value)) {
      setPicked(null);
      props.onPick(null, false);
      return;
    }
    const ms = localToMs(date, value, tz);
    setPicked(ms);
    props.onPick(ms, evaluate(ms).length === 0);
  }

  function onOverride(checked: boolean) {
    setOverride(checked);
    props.onPick(picked, picked !== null && (reasons.length === 0 || checked));
  }

  function changeDate(d: string) {
    props.onDate(d);
    setPicked(null);
    setManual('');
    setOverride(false);
    props.onPick(null, false);
  }

  return (
    <div className="slotpicker">
      <label>
        Día
        <input
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) changeDate(e.target.value);
          }}
        />
      </label>
      {win.loading && <p className="muted">Calculando sillas libres…</p>}
      {win.error && <p className="msg error">{win.error}</p>}
      {!win.loading && !win.error && (
        <>
          <p className="muted">Sillas libres ({durationMin} min):</p>
          {!view.hasHours && <p className="muted">No tienes horario ese día. Puedes escribir una hora abajo.</p>}
          {view.hasHours && view.freeStarts.length === 0 && <p className="muted">No hay sillas libres ese día.</p>}
          <div className="chips">
            {view.freeStarts.map((s) => (
              <button
                key={s.start}
                type="button"
                className={picked === s.start && manual === '' ? 'chip selected' : 'chip'}
                onClick={() => chooseChip(s.start)}
              >
                {formatHM(s.start, tz)}
              </button>
            ))}
          </div>
          <label>
            …u otra hora
            <input type="time" value={manual} onChange={(e) => onManual(e.target.value)} />
          </label>
          {picked !== null && manual !== '' && reasons.length > 0 && (
            <div className="msg error">
              {reasonsText(reasons).map((t) => (
                <p key={t}>{t}</p>
              ))}
              <label className="check">
                <input type="checkbox" checked={override} onChange={(e) => onOverride(e.target.checked)} />
                Agendar de todos modos
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
