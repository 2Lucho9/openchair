import { useEffect, useState } from 'react';
import { Shell } from './components/Shell';
import { AuthProvider, useAuth } from './lib/auth';
import { TABS, parseTab, type TabId } from './lib/nav';
import { configError } from './lib/supabase';
import { useProfile } from './lib/useProfile';
import { Coming } from './screens/Coming';
import { Login } from './screens/Login';
import { Settings } from './screens/Settings';
import { Today } from './screens/Today';

function useTab(): TabId {
  const [tab, setTab] = useState<TabId>(() => parseTab(window.location.hash));
  useEffect(() => {
    const onHash = () => setTab(parseTab(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return tab;
}

function Private({ userId, email }: { userId: string; email: string }) {
  const tab = useTab();
  const { profile, loading, error, reload, save } = useProfile(userId);
  const label = TABS.find((t) => t.id === tab)?.label ?? 'Hoy';

  let body;
  if (loading) body = <p className="muted">Cargando…</p>;
  else if (error || !profile)
    body = (
      <section className="card">
        <p className="msg error">{error ?? 'No se pudo cargar tu perfil.'}</p>
        <button type="button" onClick={() => void reload()}>
          Reintentar
        </button>
      </section>
    );
  else if (tab === 'hoy') body = <Today profile={profile} />;
  else if (tab === 'agenda') body = <Coming what="Agenda del día y la semana" phase="Fase 5" />;
  else if (tab === 'clientes') body = <Coming what="Clientes: historial, notas y control" phase="Fase 5" />;
  else if (tab === 'servicios') body = <Coming what="Servicios y precios" phase="Fase 5" />;
  else body = <Settings profile={profile} email={email} onSave={save} />;

  const subtitle = tab === 'hoy' && profile?.business_name ? profile.business_name : undefined;
  return (
    <Shell tab={tab} title={label} subtitle={subtitle}>
      {body}
    </Shell>
  );
}

function Gate() {
  const { status, session } = useAuth();
  if (configError)
    return (
      <div className="auth">
        <h1 className="logo">OpenChair</h1>
        <p className="msg error">{configError}</p>
      </div>
    );
  if (status === 'loading') return <div className="auth"><p className="muted">Cargando…</p></div>;
  if (status === 'out' || !session) return <Login />;
  return <Private userId={session.user.id} email={session.user.email ?? ''} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
