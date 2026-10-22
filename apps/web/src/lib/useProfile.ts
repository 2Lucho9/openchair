import { useCallback, useEffect, useState } from 'react';
import type { Profile, ProfileForm } from './profile';
import { formToUpdate } from './profile';
import { supabase } from './supabase';

const COLUMNS =
  'id, display_name, business_name, phone, currency, tz_offset_min, buffer_min, slot_step_min, min_notice_min';

export function useProfile(userId: string) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    // El perfil lo crea un trigger al registrarse; maybeSingle evita fallar si tarda un instante.
    const { data, error: err } = await supabase
      .from('profiles')
      .select(COLUMNS)
      .eq('id', userId)
      .maybeSingle();
    if (err) setError(err.message);
    else if (!data) setError('No se encontró tu perfil. Cierra sesión y vuelve a entrar.');
    else setProfile(data as Profile);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (form: ProfileForm): Promise<string | null> => {
      if (!supabase) return 'La app no está conectada a Supabase.';
      const { data, error: err } = await supabase
        .from('profiles')
        .update(formToUpdate(form))
        .eq('id', userId)
        .select(COLUMNS)
        .maybeSingle();
      if (err) return err.message;
      if (!data) return 'No se pudo guardar (sin permiso).';
      setProfile(data as Profile);
      return null;
    },
    [userId],
  );

  return { profile, loading, error, reload: load, save };
}
