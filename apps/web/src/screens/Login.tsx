import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { validateCredentials } from '../lib/errors';

export function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const invalid = validateCredentials(email, password);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    const res = mode === 'in' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (res.error) setError(res.error);
    else if (res.needsConfirmation)
      setNotice('Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego inicia sesión.');
  }

  return (
    <div className="auth">
      <h1 className="logo">OpenChair</h1>
      <p className="tagline">Tu agenda, siempre con silla libre.</p>
      <form className="card" onSubmit={onSubmit} noValidate>
        <h2>{mode === 'in' ? 'Entrar' : 'Crear cuenta'}</h2>
        <label>
          Correo
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        {notice && <p className="msg ok" role="status">{notice}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'in' ? 'Entrar' : 'Crear cuenta'}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in');
            setError(null);
            setNotice(null);
          }}
        >
          {mode === 'in' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Entrar'}
        </button>
      </form>
    </div>
  );
}
