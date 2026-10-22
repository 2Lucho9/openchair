import { useState, type FormEvent } from 'react';
import { ENGINE_VERSION } from '@openchair/engine';
import { HoursEditor } from '../components/HoursEditor';
import { TimeOffEditor } from '../components/TimeOffEditor';
import { useAuth } from '../lib/auth';
import {
  SLOT_STEPS,
  profileToForm,
  validateProfileForm,
  type Profile,
  type ProfileForm,
} from '../lib/profile';

export function Settings(props: {
  profile: Profile;
  email: string;
  onSave: (f: ProfileForm) => Promise<string | null>;
}) {
  const { signOut } = useAuth();
  const [form, setForm] = useState<ProfileForm>(() => profileToForm(props.profile));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const errors = validateProfileForm(form);
  const set = (k: keyof ProfileForm) => (v: string) => setForm({ ...form, [k]: v });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      setMsg({ kind: 'error', text: 'Revisa los campos marcados.' });
      return;
    }
    setBusy(true);
    const err = await props.onSave(form);
    setBusy(false);
    setMsg(err ? { kind: 'error', text: err } : { kind: 'ok', text: 'Guardado.' });
  }

  const field = (k: keyof ProfileForm, label: string, extra?: { type?: string; hint?: string }) => (
    <label>
      {label}
      <input
        type={extra?.type ?? 'text'}
        inputMode={extra?.type === 'number' ? 'numeric' : undefined}
        value={form[k]}
        onChange={(e) => set(k)(e.target.value)}
      />
      {errors[k] && <small className="field-error">{errors[k]}</small>}
      {extra?.hint && !errors[k] && <small className="muted">{extra.hint}</small>}
    </label>
  );

  return (
    <>
      <form className="card" onSubmit={submit} noValidate>
        <h2>Tu negocio</h2>
        {field('display_name', 'Tu nombre')}
        {field('business_name', 'Nombre del negocio')}
        {field('phone', 'Teléfono / WhatsApp')}
        <label>
          Moneda
          <select value={form.currency} onChange={(e) => set('currency')(e.target.value)}>
            <option value="CRC">Colones (₡)</option>
            <option value="USD">Dólares ($)</option>
          </select>
        </label>
        {field('buffer_min', 'Margen entre citas (min)', { type: 'number', hint: 'Tiempo para limpiar o descansar.' })}
        <label>
          Cada cuántos minutos ofrecer horarios
          <select value={form.slot_step_min} onChange={(e) => set('slot_step_min')(e.target.value)}>
            {SLOT_STEPS.map((s) => (
              <option key={s} value={String(s)}>
                {s} min
              </option>
            ))}
          </select>
        </label>
        {field('min_notice_min', 'Aviso mínimo para agendar (min)', { type: 'number', hint: '0 = se puede agendar de inmediato.' })}
        {msg && <p className={'msg ' + msg.kind}>{msg.text}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
      <HoursEditor />
      <TimeOffEditor profile={props.profile} />
      <section className="card">
        <h2>Cuenta</h2>
        <p className="muted">{props.email}</p>
        <button type="button" className="secondary" onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </section>
      <small className="foot">OpenChair · motor v{ENGINE_VERSION}</small>
    </>
  );
}
