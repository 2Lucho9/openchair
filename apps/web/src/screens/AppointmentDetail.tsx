import { useState } from 'react';
import { SlotPicker } from '../components/SlotPicker';
import {
  ACTION_LABEL,
  ACTION_TARGET,
  PAYMENT_METHODS,
  availableActions,
  canCharge,
  canReschedule,
  dbErrorMessage,
  paymentFormToRow,
  suggestedAmount,
  validatePaymentForm,
  validateReverseReason,
  type Action,
  type PaymentForm,
} from '../lib/appointments';
import { METHOD_LABEL, STATUS_LABEL, formatDateTime } from '../lib/dates';
import { toLocalDate, type AppointmentStatus } from '@openchair/engine';
import { formatMoney } from '../lib/money';
import type { Profile } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';
import { whatsappUrl } from '../lib/clients';

interface Appt {
  id: string;
  client_id: string;
  service_name: string;
  price: number;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  notes: string;
  cancel_reason: string | null;
}

interface Payment {
  id: string;
  amount: number;
  tip: number;
  method: string;
  paid_at: string;
  notes: string;
  reversed_at: string | null;
  reversed_reason: string | null;
}

interface Loaded {
  appt: Appt;
  client: { full_name: string; phone: string | null } | null;
  payments: Payment[];
}

async function load(id: string) {
  const [a, p] = await Promise.all([
    supabase!
      .from('appointments')
      .select('id, client_id, service_name, price, starts_at, ends_at, status, notes, cancel_reason')
      .eq('id', id)
      .maybeSingle(),
    supabase!
      .from('payments')
      .select('id, amount, tip, method, paid_at, notes, reversed_at, reversed_reason')
      .eq('appointment_id', id)
      .order('paid_at'),
  ]);
  const err = a.error ?? p.error;
  if (err) return { data: null, error: err };
  if (!a.data) return { data: null, error: { message: 'No se encontró la cita.' } };
  const appt = a.data as Appt;
  const c = await supabase!.from('clients').select('full_name, phone').eq('id', appt.client_id).maybeSingle();
  if (c.error) return { data: null, error: c.error };
  const loaded: Loaded = { appt, client: (c.data as Loaded['client']) ?? null, payments: (p.data ?? []) as Payment[] };
  return { data: loaded, error: null };
}

export function AppointmentDetail(props: { profile: Profile; id: string; onBack: () => void }) {
  const { profile } = props;
  const tz = profile.tz_offset_min;
  const q = useQuery<Loaded>(() => load(props.id), [props.id]);
  const [msg, setMsg] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [resDate, setResDate] = useState('');
  const [resStart, setResStart] = useState<number | null>(null);
  const [resOk, setResOk] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [pay, setPay] = useState<PaymentForm | null>(null);
  const [reversing, setReversing] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (q.loading && !q.data) return <p className="muted">Cargando…</p>;
  if (q.error || !q.data)
    return (
      <section className="card">
        <p className="msg error">{q.error ?? 'No se pudo cargar la cita.'}</p>
        <button type="button" onClick={props.onBack}>Volver</button>
      </section>
    );

  const { appt, client, payments } = q.data;
  const money = (n: number) => formatMoney(n, profile.currency);
  const active = payments.filter((p) => p.reversed_at === null);
  const paid = active.reduce((t, p) => t + p.amount, 0);
  const tips = active.reduce((t, p) => t + p.tip, 0);
  const due = appt.status === 'completed' ? Math.max(appt.price - paid, 0) : 0;
  const startMs = Date.parse(appt.starts_at);
  const actions = availableActions(appt.status, startMs, Date.now(), active.length > 0);
  const duration = Math.round((Date.parse(appt.ends_at) - startMs) / 60_000);
  const wa = whatsappUrl(client?.phone);

  async function run(fn: () => PromiseLike<{ error: { code?: string; message: string } | null }>, after?: () => void) {
    setBusy(true);
    setMsg(null);
    const { error } = await fn();
    setBusy(false);
    if (error) return setMsg(dbErrorMessage(error));
    after?.();
    q.reload();
  }

  const setStatus = (a: Action, reason?: string) =>
    run(
      () =>
        supabase!
          .from('appointments')
          .update(a === 'cancel' ? { status: ACTION_TARGET[a], cancel_reason: reason || null } : { status: ACTION_TARGET[a] })
          .eq('id', appt.id),
      () => setCancelling(false),
    );

  const startPay = () => setPay({ amount: suggestedAmount(due), tip: '', method: 'cash', notes: '' });
  const payErrors = pay ? validatePaymentForm(pay) : {};

  return (
    <>
      <button type="button" className="link left" onClick={props.onBack}>← Agenda</button>

      <section className="card">
        <h2>{client?.full_name ?? 'Cliente'}</h2>
        <p>{appt.service_name} · {duration} min · {money(appt.price)}</p>
        <p>{formatDateTime(startMs, tz)}</p>
        <p><span className={'pill status-' + appt.status}>{STATUS_LABEL[appt.status]}</span></p>
        {appt.cancel_reason && <p className="muted">Motivo: {appt.cancel_reason}</p>}
        {wa && <a className="btn secondary" href={wa} target="_blank" rel="noreferrer">WhatsApp al cliente</a>}
      </section>

      {actions.length > 0 && (
        <section className="card">
          <h2>Estado</h2>
          <div className="row">
            {actions.map((a) => (
              <button
                key={a.action}
                type="button"
                className={a.action === 'cancel' || a.action === 'no_show' ? 'secondary' : ''}
                disabled={!a.enabled || busy}
                onClick={() => (a.action === 'cancel' ? setCancelling(true) : void setStatus(a.action))}
              >
                {ACTION_LABEL[a.action]}
              </button>
            ))}
          </div>
          {actions.filter((a) => !a.enabled).map((a) => (
            <small key={a.action} className="muted">{ACTION_LABEL[a.action]}: {a.reason}</small>
          ))}
          {cancelling && (
            <div className="card inner">
              <label>
                Motivo de la cancelación (opcional)
                <input value={cancelReason} maxLength={200} onChange={(e) => setCancelReason(e.target.value)} placeholder="El cliente avisó, enfermedad…" />
              </label>
              <div className="row">
                <button type="button" disabled={busy} onClick={() => void setStatus('cancel', cancelReason.trim())}>Confirmar cancelación</button>
                <button type="button" className="secondary" onClick={() => setCancelling(false)}>Volver</button>
              </div>
            </div>
          )}
        </section>
      )}

      {canReschedule(appt.status) && (
        <section className="card">
          <h2>Reprogramar</h2>
          {!rescheduling ? (
            <button type="button" className="secondary" onClick={() => { setRescheduling(true); setResDate(toLocalDate(startMs, tz)); }}>Cambiar día u hora</button>
          ) : (
            <>
              <SlotPicker
                profile={profile}
                date={resDate}
                onDate={setResDate}
                durationMin={duration}
                excludeId={appt.id}
                onPick={(ms, ok) => { setResStart(ms); setResOk(ok); }}
              />
              <div className="row">
                <button
                  type="button"
                  disabled={busy || resStart === null || !resOk}
                  onClick={() =>
                    void run(
                      () =>
                        supabase!
                          .from('appointments')
                          .update({ starts_at: new Date(resStart!).toISOString(), ends_at: new Date(resStart! + duration * 60_000).toISOString() })
                          .eq('id', appt.id),
                      () => setRescheduling(false),
                    )
                  }
                >
                  Guardar nueva hora
                </button>
                <button type="button" className="secondary" onClick={() => setRescheduling(false)}>Cancelar</button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="card">
        <h2>Cobro</h2>
        <div className="stats">
          <div><b>{money(appt.price)}</b><span>Precio</span></div>
          <div><b>{money(paid)}</b><span>Pagado</span></div>
          <div className={due > 0 ? 'due' : ''}><b>{money(due)}</b><span>Pendiente</span></div>
        </div>
        {tips > 0 && <small className="muted">Propinas: {money(tips)}</small>}
        <ul className="list stack">
          {payments.map((p) => (
            <li key={p.id} className={p.reversed_at ? 'item archived' : 'item'}>
              <span className="grow">
                <b className="name">{money(p.amount)}{p.tip > 0 ? ` + ${money(p.tip)} propina` : ''}</b>
                <span className="muted">
                  {METHOD_LABEL[p.method] ?? p.method} · {formatDateTime(Date.parse(p.paid_at), tz)}
                  {p.reversed_at ? ` · REVERSADO: ${p.reversed_reason}` : ''}
                </span>
              </span>
              {!p.reversed_at && (
                <button type="button" className="secondary small" onClick={() => { setReversing(p.id); setReverseReason(''); }}>Reversar</button>
              )}
            </li>
          ))}
        </ul>
        {reversing && (
          <div className="card inner">
            <label>
              Motivo de la reversa
              <input value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="Error de monto, cobro duplicado…" />
            </label>
            <div className="row">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const e = validateReverseReason(reverseReason);
                  if (e) return setMsg(e);
                  void run(
                    () => supabase!.from('payments').update({ reversed_reason: reverseReason.trim() }).eq('id', reversing),
                    () => setReversing(null),
                  );
                }}
              >
                Reversar pago
              </button>
              <button type="button" className="secondary" onClick={() => setReversing(null)}>Volver</button>
            </div>
          </div>
        )}
        {canCharge(appt.status) && !pay && <button type="button" onClick={startPay}>Registrar pago</button>}
        {!canCharge(appt.status) && <small className="muted">Una cita cancelada no se cobra.</small>}
        {pay && (
          <div className="card inner">
            <label>Monto<input inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />{payErrors.amount && <small className="field-error">{payErrors.amount}</small>}</label>
            <label>Propina<input inputMode="decimal" value={pay.tip} onChange={(e) => setPay({ ...pay, tip: e.target.value })} />{payErrors.tip && <small className="field-error">{payErrors.tip}</small>}</label>
            <label>
              Método
              <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </select>
            </label>
            <label>Nota (opcional)<input value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} /></label>
            <div className="row">
              <button
                type="button"
                disabled={busy || Object.keys(payErrors).length > 0}
                onClick={() => void run(() => supabase!.from('payments').insert(paymentFormToRow(pay, appt.id)), () => setPay(null))}
              >
                Guardar pago
              </button>
              <button type="button" className="secondary" onClick={() => setPay(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Notas de la cita</h2>
        <textarea rows={3} value={notes ?? appt.notes} onChange={(e) => setNotes(e.target.value)} />
        {notes !== null && notes !== appt.notes && (
          <button type="button" disabled={busy} onClick={() => void run(() => supabase!.from('appointments').update({ notes }).eq('id', appt.id), () => setNotes(null))}>Guardar notas</button>
        )}
      </section>

      {msg && <p className="msg error" role="alert">{msg}</p>}
    </>
  );
}
