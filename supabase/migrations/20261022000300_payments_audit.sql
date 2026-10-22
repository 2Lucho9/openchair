-- OpenChair · Fase 2 · 3/4: pagos inmutables y auditoría
--
-- Un pago nunca se edita ni se borra: si hubo un error se REVERSA (queda el motivo)
-- y se registra uno nuevo. Así el historial de cobros siempre cuadra.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  appointment_id uuid not null,
  amount numeric(12, 2) not null check (amount >= 0),
  tip numeric(12, 2) not null default 0 check (tip >= 0),
  method text not null default 'cash'
    check (method in ('cash', 'card', 'sinpe', 'transfer', 'other')),
  paid_at timestamptz not null default now(),
  notes text not null default '' check (char_length(notes) <= 500),
  reversed_at timestamptz,
  reversed_reason text,
  created_at timestamptz not null default now(),
  constraint payments_not_empty check (amount + tip > 0),
  constraint payments_reversal_pair check ((reversed_at is null) = (reversed_reason is null)),
  constraint payments_reversal_reason check (
    reversed_reason is null or char_length(btrim(reversed_reason)) between 3 and 200
  ),
  constraint payments_appointment_fk
    foreign key (appointment_id, owner_id) references public.appointments (id, owner_id)
);
create index payments_appointment_idx on public.payments (owner_id, appointment_id);
create index payments_owner_paid_idx on public.payments (owner_id, paid_at desc);

-- Guardia de inmutabilidad. Lo único permitido: reversar un pago vigente.
-- Excepción: al eliminar una cuenta completa (su perfil ya no existe) se borran sus pagos en cascada.
create or replace function public.payments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.reversed_at is not null or new.reversed_reason is not null then
      raise exception 'Un pago nuevo no puede nacer reversado';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.reversed_at is not null then
      raise exception 'Este pago ya fue reversado y no se puede modificar';
    end if;
    if (new.id, new.owner_id, new.appointment_id, new.amount, new.tip, new.method,
        new.paid_at, new.notes, new.created_at)
       is distinct from
       (old.id, old.owner_id, old.appointment_id, old.amount, old.tip, old.method,
        old.paid_at, old.notes, old.created_at) then
      raise exception 'Los pagos no se editan: reversa el pago y registra uno nuevo';
    end if;
    -- La hora de la reversa la pone el servidor, nunca el cliente.
    if new.reversed_reason is not null then
      new.reversed_at := now();
    else
      new.reversed_at := null;
    end if;
    return new;
  else
    if not exists (select 1 from public.profiles where id = old.owner_id) then
      return old;
    end if;
    raise exception 'Los pagos no se borran: reversa el pago';
  end if;
end
$$;

create trigger payments_guard
  before insert or update or delete on public.payments
  for each row execute function public.payments_guard();

-- Auditoría: quién cambió qué y cuándo. Solo se inserta desde triggers.
create table public.audit_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_row jsonb,
  new_row jsonb,
  actor uuid,
  at timestamptz not null default now()
);
create index audit_log_owner_at_idx on public.audit_log (owner_id, at desc);
create index audit_log_row_idx on public.audit_log (owner_id, table_name, row_id);

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
begin
  -- Al borrar una cuenta completa (el perfil ya no existe) no se audita fila por fila.
  if tg_op = 'DELETE' and not exists (select 1 from public.profiles where id = old.owner_id) then
    return null;
  end if;
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return null;
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  insert into public.audit_log (owner_id, table_name, row_id, action, old_row, new_row, actor)
  values (
    (v_row ->> 'owner_id')::uuid,
    tg_table_name,
    (v_row ->> 'id')::uuid,
    tg_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    auth.uid()
  );
  return null;
end
$$;

create trigger clients_audit
  after insert or update or delete on public.clients
  for each row execute function public.audit_row();
create trigger appointments_audit
  after insert or update or delete on public.appointments
  for each row execute function public.audit_row();
create trigger payments_audit
  after insert or update or delete on public.payments
  for each row execute function public.audit_row();

-- El registro de auditoría no se edita ni se borra (salvo la cascada de borrar la cuenta).
create or replace function public.audit_log_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.profiles where id = old.owner_id) then
    return old;
  end if;
  raise exception 'El registro de auditoría no se modifica';
end
$$;

create trigger audit_log_guard
  before update or delete on public.audit_log
  for each row execute function public.audit_log_guard();

revoke all on function public.payments_guard() from public, anon, authenticated;
revoke all on function public.audit_row() from public, anon, authenticated;
revoke all on function public.audit_log_guard() from public, anon, authenticated;
