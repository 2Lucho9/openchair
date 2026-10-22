import { useMemo } from 'react';
import {
  CR_OFFSET_MINUTES,
  ENGINE_VERSION,
  formatHM,
  freeSlots,
  localToMs,
  parseHM,
  toLocalDate,
  type Schedule,
  type WeeklyHours,
} from '@openchair/engine';

const weekly: WeeklyHours = {};
for (const d of [1, 2, 3, 4, 5, 6]) weekly[d] = [{ start: parseHM('09:00'), end: parseHM('18:00') }];
const schedule: Schedule = { tzOffsetMinutes: CR_OFFSET_MINUTES, weekly };

export default function App() {
  const { today, starts } = useMemo(() => {
    const now = Date.now();
    const date = toLocalDate(now, CR_OFFSET_MINUTES);
    const slots = freeSlots({
      date,
      durationMin: 45,
      bufferMin: 10,
      schedule,
      now,
      appointments: [
        {
          id: 'demo',
          status: 'confirmed',
          start: localToMs(date, '11:00', CR_OFFSET_MINUTES),
          end: localToMs(date, '12:00', CR_OFFSET_MINUTES),
        },
      ],
    });
    return { today: date, starts: slots.map((s) => formatHM(s.start, CR_OFFSET_MINUTES)) };
  }, []);

  return (
    <main>
      <h1>OpenChair</h1>
      <p>Tu agenda, siempre con silla libre.</p>
      <section className="card">
        <p>
          Sillas libres hoy ({today}): servicio de 45 min, margen de 10 min y una cita a las 11:00.
        </p>
        <div className="chips">
          {starts.length === 0 && <span>Sin sillas libres hoy</span>}
          {starts.map((s) => (
            <span className="chip" key={s}>
              {s}
            </span>
          ))}
        </div>
      </section>
      <small>motor v{ENGINE_VERSION}</small>
    </main>
  );
}
