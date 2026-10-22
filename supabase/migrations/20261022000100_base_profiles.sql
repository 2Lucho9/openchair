-- OpenChair · Fase 2 · 1/4: extensiones, utilidades y perfiles
-- Cada persona (barbero, estilista, manicurista) es un usuario con su propia agenda.

create extension if not exists btree_gist with schema extensions;

-- Mantiene updated_at al día en las tablas que lo tienen.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 120),
  business_name text not null default '' check (char_length(business_name) <= 120),
  phone text check (phone is null or char_length(phone) between 5 and 32),
  currency text not null default 'CRC' check (currency in ('CRC', 'USD')),
  -- Desfase respecto a UTC en minutos (Costa Rica = -360, sin cambio de hora).
  tz_offset_min int not null default -360 check (tz_offset_min between -720 and 840),
  -- Margen entre citas, paso de la agenda y aviso mínimo: alimentan el motor.
  buffer_min int not null default 0 check (buffer_min between 0 and 240),
  slot_step_min int not null default 30 check (slot_step_min in (5, 10, 15, 20, 30, 60)),
  min_notice_min int not null default 0 check (min_notice_min between 0 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Al crear un usuario en Supabase Auth se crea su perfil automáticamente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Las funciones de trigger no se llaman a mano.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
