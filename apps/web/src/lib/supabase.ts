import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Si faltan las variables, la app lo dice en pantalla en vez de quedar en blanco. */
export const configError: string | null =
  !url || !key
    ? 'Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en apps/web/.env.local'
    : null;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
