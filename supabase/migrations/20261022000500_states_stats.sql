-- OpenChair · Fase 3: estados de la cita, reglas de cobro y estadísticas por cliente
--
-- Reglas que garantiza la base de datos (no solo la pantalla):
--
--   Estados y cambios permitidos
--     programada (scheduled) -> confirmada, completada, no asistió, cancelada
--     confirmada (confirmed) -> completada, no asistió, cancelada
--     no asistió (no_show)   -> completada   (el cliente llegó tarde)
--     cancelada (cancelled)  -> programada   (se reactiva; el choque de horario se revisa solo)
--     completada (completed) -> nada         (hay plata de por medio: es historial)
--
--   * Una cita nueva nace programada, confirmada o completada (nunca cancelada ni "no asistió").
--   * "Completada" y "no asistió" solo se marcan cuando la cita ya empezó.
--   * Una cita cerrada (completada, no asistió, cancelada) no cambia de cliente, servicio,
--     precio ni horario. Si hay que cambiar algo, se cancela y se agenda otra.
--   * No se cancela una cita con pagos vigentes: primero se reversan.
--   * No se cobra una cita cancelada.
--   * El motivo de cancelación solo existe mientras la cita está cancelada.

create or replace function public.appointments_state_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  -- Un estado desconocido lo rechaza la restricción CHECK de la tabla, con su propio error.
  if new.status not in ('scheduled', 'confirmed', 'completed', 'no_show', 'cancelled') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('scheduled', 'confirmed', 'completed') then
      raise exception 'Una cita nueva no puede nacer cancelada ni como "no asistió"';
    end if;
    if new.status = 'completed' and new.starts_at > now() then
      raise exception 'No se puede registrar como completada una cita que todavía no empieza';
    end if;
    new.cancel_reason := null;
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    v_ok := case old.status
      when 'scheduled' then new.status in ('confirmed', 'completed', 'no_show', 'cancelled')
      when 'confirmed' then new.status in ('completed', 'no_show', 'cancelled')
      when 'no_show'   then new.status in ('completed')
      when 'cancelled' then new.status in ('scheduled')
      else false
    end;
    if not coalesce(v_ok, false) then
      raise exception 'Cambio de estado no permitido: % -> %', old.status, new.status;
    end if;

    if new.status in ('completed', 'no_show') and new.starts_at > now() then
      raise exception 'No se puede marcar como % una cita que todavía no empieza', new.status;
    end if;

    if new.status = 'cancelled' and exists (
      select 1 from public.payments p
      where p.appointment_id = old.id and p.owner_id = old.owner_id and p.reversed_at is null
    ) then
      raise exception 'Esta cita tiene pagos vigentes: reversalos antes de cancelarla';
    end if;
  end if;

  if old.status in ('completed', 'no_show', 'cancelled') then
    if (new.client_id, new.service_id, new.service_name, new.price, new.starts_at, new.ends_at)
       is distinct from
       (old.client_id, old.service_id, old.service_name, old.price, old.starts_at, old.ends_at) then
      raise exception 'Una cita cerrada no cambia de cliente, servicio, precio ni horario';
    end if;
  end if;

  if new.status <> 'cancelled' then
    new.cancel_reason := null;
  end if;
  return new;
end
$$;

create trigger appointments_state_guard
  before insert or update on public.appointments
  for each row execute function public.appointments_state_guard();

-- No se cobra una cita cancelada.
create or replace function public.payments_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select a.status into v_status
  from public.appointments a
  where a.id = new.appointment_id and a.owner_id = new.owner_id;

  if v_status = 'cancelled' then
    raise exception 'No se puede cobrar una cita cancelada';
  end if;
  return new;
end
$$;

create trigger payments_status_guard
  before insert on public.payments
  for each row execute function public.payments_status_guard();

revoke all on function public.appointments_state_guard() from public, anon, authenticated;
revoke all on function public.payments_status_guard() from public, anon, authenticated;

------------------------------------------------------------------------------
-- Vistas. Con security_invoker cada persona solo ve lo suyo (se aplica el RLS de las tablas).
------------------------------------------------------------------------------

-- Cuánto se ha pagado de cada cita y cuánto falta. Los pagos reversados no cuentan.
-- "due" (pendiente) solo aplica a citas completadas.
create view public.appointment_balances
with (security_invoker = true) as
select
  a.id as appointment_id,
  a.owner_id,
  a.client_id,
  a.status,
  a.price,
  coalesce(p.paid, 0)::numeric(12, 2) as paid,
  coalesce(p.tips, 0)::numeric(12, 2) as tips,
  (case when a.status = 'completed' then greatest(a.price - coalesce(p.paid, 0), 0) else 0 end)::numeric(12, 2) as due
from public.appointments a
left join (
  select owner_id, appointment_id, sum(amount) as paid, sum(tip) as tips
  from public.payments
  where reversed_at is null
  group by owner_id, appointment_id
) p on p.appointment_id = a.id and p.owner_id = a.owner_id;

-- Ficha de control por cliente: visitas, faltas, cancelaciones, plata y próxima cita.
create view public.client_stats
with (security_invoker = true) as
select
  c.id as client_id,
  c.owner_id,
  c.full_name,
  c.archived_at,
  coalesce(s.visits, 0)::int as visits,
  coalesce(s.no_shows, 0)::int as no_shows,
  coalesce(s.cancellations, 0)::int as cancellations,
  coalesce(s.upcoming, 0)::int as upcoming,
  s.last_visit_at,
  s.next_appointment_at,
  coalesce(b.total_paid, 0)::numeric(12, 2) as total_paid,
  coalesce(b.total_tips, 0)::numeric(12, 2) as total_tips,
  coalesce(b.total_due, 0)::numeric(12, 2) as total_due,
  case
    when coalesce(s.visits, 0) + coalesce(s.no_shows, 0) > 0
    then round(coalesce(s.no_shows, 0)::numeric / (coalesce(s.visits, 0) + coalesce(s.no_shows, 0)), 4)
  end as no_show_rate
from public.clients c
left join lateral (
  select
    count(*) filter (where x.status = 'completed') as visits,
    count(*) filter (where x.status = 'no_show') as no_shows,
    count(*) filter (where x.status = 'cancelled') as cancellations,
    count(*) filter (where x.status in ('scheduled', 'confirmed') and x.starts_at > now()) as upcoming,
    max(x.starts_at) filter (where x.status = 'completed') as last_visit_at,
    min(x.starts_at) filter (where x.status in ('scheduled', 'confirmed') and x.starts_at > now()) as next_appointment_at
  from public.appointments x
  where x.client_id = c.id and x.owner_id = c.owner_id
) s on true
left join lateral (
  select sum(v.paid) as total_paid, sum(v.tips) as total_tips, sum(v.due) as total_due
  from public.appointment_balances v
  where v.client_id = c.id and v.owner_id = c.owner_id
) b on true;

-- Permisos: nada para anon; lectura para quien inició sesión.
revoke all on public.appointment_balances, public.client_stats from public, anon, authenticated;
grant select on public.appointment_balances, public.client_stats to authenticated;
grant select on public.appointment_balances, public.client_stats to service_role;
