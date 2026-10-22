import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authErrorMessage } from './errors';
import { supabase } from './supabase';

type Status = 'loading' | 'out' | 'in';

export interface AuthResult {
  error: string | null;
  /** true si Supabase pidió confirmar el correo antes de entrar. */
  needsConfirmation?: boolean;
}

interface AuthApi {
  status: Status;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    if (!supabase) {
      setStatus('out');
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setStatus(data.session ? 'in' : 'out');
    });
    // Aquí solo se guarda el estado: no se hacen consultas dentro de este callback.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? 'in' : 'out');
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const api = useMemo<AuthApi>(
    () => ({
      status,
      session,
      async signIn(email, password) {
        if (!supabase) return { error: 'La app no está conectada a Supabase.' };
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return { error: error ? authErrorMessage(error.message) : null };
      },
      async signUp(email, password) {
        if (!supabase) return { error: 'La app no está conectada a Supabase.' };
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) return { error: authErrorMessage(error.message) };
        return { error: null, needsConfirmation: !data.session };
      },
      async signOut() {
        if (supabase) await supabase.auth.signOut();
      },
    }),
    [status, session],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
