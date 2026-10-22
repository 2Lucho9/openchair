-- OpenChair · Fase 2 · 2/4: horarios, bloqueos, clientes, servicios y citas
--
-- Reglas que garantiza la base de datos, no solo la pantalla:
--   * Dos citas activas de la misma persona nunca se solapan (restricción de exclusión).
--   * Una cita solo puede apuntar a clientes y servicios de su mismo dueño
--     (claves foráneas compuestas con owner_id).
--
-- El margen entre citas (profiles.buffer_min) NO se impone aquí: es una regla blanda
-- que aplica el motor al ofrecer horarios, y la persona puede saltársela a propósito.

-- Horario semanal. weekday: 0 = domingo ... 6 = sábado. Minutos desde la medianoche;
-- end_min puede pasar de 1440 para turnos que terminan después de medianoche.
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_min int not null check (start_min >= 0),
  end_min int not null,
  created_at timestamptz not null default now(),
  constraint working_hours_valid check (end_min > start_min and end_min <= 2880),
  constraint working_hours_no_overlap
    exclude using gist (owner_id with =, weekday with =, int4range(start_min, end_min) with &&)
);

-- Bloqueos: vacaciones, almuerzo, permisos.
create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  constraint time_off_valid check (ends_at > starts_at)
);
create index time_off_owner_starts_idx on public.time_off (owner_id, starts_at);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  phone text check (phone is null or char_length(phone) between 5 and 32),
  email text check (email is null or char_length(email) <= 200),
  -- Preferencias del cliente: tipo de corte, fórmulas de color, alergias a productos, etc.
  notes text not null default '' check (char_length(notes) <= 5000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index clients_owner_name_idx on public.clients (owner_id, lower(full_name));

create table public.services (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  duration_min int not null check (duration_min between 5 and 1440),
  price numeric(12, 2) not null default 0 check (price >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  client_id uuid not null,
  service_id uuid,
  -- Copia del servicio al agendar: cambiar el catálogo después no altera citas ya hechas.
  service_name text not null check (char_length(btrim(service_name)) between 1 and 120),
  price numeric(12, 2) not null default 0 check (price >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'completed', 'no_show', 'cancelled')),
  notes text not null default '' check (char_length(notes) <= 2000),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 200),
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint appointments_valid_range
    check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours'),
  constraint appointments_client_fk
    foreign key (client_id, owner_id) references public.clients (id, owner_id),
  constraint appointments_service_fk
    foreign key (service_id, owner_id) references public.services (id, owner_id),
  -- Canceladas y "no asistió" liberan el espacio; las demás lo ocupan.
  constraint appointments_no_overlap
    exclude using gist (owner_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
    where (status in ('scheduled', 'confirmed', 'completed'))
);
create index appointments_owner_starts_idx on public.appointments (owner_id, starts_at);
create index appointments_client_idx on public.appointments (owner_id, client_id, starts_at desc);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();
create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- status_changed_at solo se mueve cuando el estado cambia de verdad.
create or replace function public.appointments_touch_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  else
    new.status_changed_at := old.status_changed_at;
  end if;
  return new;
end
$$;

create trigger appointments_touch_status
  before update on public.appointments
  for each row execute function public.appointments_touch_status();

revoke all on function public.appointments_touch_status() from public, anon, authenticated;
