import { useState, type FormEvent } from 'react';
import { validateClientForm, type ClientForm as Form } from '../lib/clients';

export function ClientForm(props: {
  title: string;
  initial: Form;
  /** Aviso opcional (por ejemplo, teléfono repetido) según lo escrito. */
  warn?: (f: Form) => string | null;
  onSubmit: (f: Form) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [f, setF] = useState<Form>(props.initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const all = validateClientForm(f);
  // Los errores se muestran después del primer intento de guardar, no desde que se abre el formulario.
  const errors = tried ? all : {};
  const warning = props.warn ? props.warn(f) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.keys(all).length > 0) {
      setErr('Revisa los campos marcados.');
      return;
    }
    setBusy(true);
    const res = await props.onSubmit(f);
    setBusy(false);
    if (res) setErr(res);
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>{props.title}</h2>
      <label>
        Nombre completo
        <input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoComplete="off" />
        {errors.full_name && <small className="field-error">{errors.full_name}</small>}
      </label>
      <label>
        Teléfono / WhatsApp
        <input type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="8888 7777" />
        {errors.phone && <small className="field-error">{errors.phone}</small>}
        {!errors.phone && warning && <small className="warn">{warning}</small>}
      </label>
      <label>
        Correo (opcional)
        <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        {errors.email && <small className="field-error">{errors.email}</small>}
      </label>
      <label>
        Notas (preferencias, fórmulas de color, alergias a productos…)
        <textarea rows={4} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        {errors.notes && <small className="field-error">{errors.notes}</small>}
      </label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="row">
        <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="secondary" onClick={props.onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
