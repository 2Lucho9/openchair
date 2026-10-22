import { useState, type FormEvent } from 'react';
import { validateServiceForm, type ServiceForm as Form } from '../lib/services';

export function ServiceForm(props: {
  title: string;
  initial: Form;
  currencySymbol: string;
  onSubmit: (f: Form) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [f, setF] = useState<Form>(props.initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const all = validateServiceForm(f);
  // Los errores se muestran después del primer intento de guardar, no desde que se abre el formulario.
  const errors = tried ? all : {};

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
        Nombre
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Corte, Barba, Uñas acrílicas…" />
        {errors.name && <small className="field-error">{errors.name}</small>}
      </label>
      <label>
        Duración (minutos)
        <input inputMode="numeric" value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: e.target.value })} />
        {errors.duration_min && <small className="field-error">{errors.duration_min}</small>}
      </label>
      <label>
        Precio ({props.currencySymbol})
        <input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="0" />
        {errors.price && <small className="field-error">{errors.price}</small>}
      </label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="row">
        <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="secondary" onClick={props.onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
