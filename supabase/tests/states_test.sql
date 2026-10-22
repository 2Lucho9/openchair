-- OpenChair · Fase 3 · Prueba de estados de la cita y estadísticas por cliente
--
-- Cómo correrla: copia TODO este archivo, pégalo en Supabase → SQL Editor y ejecútalo.
-- IMPORTANTE: termina con un "error" a propósito, para que se revierta todo lo de prueba.
--   ✔ Todo bien:  ERROR: TODAS LAS PRUEBAS OK (N verificaciones)
--   ✘ Algo falló: ERROR: FALLARON X de N verificaciones, seguido de la lista
-- No hay nada que limpiar.

create schema tests;
grant usage on schema tests to anon, authenticated;

create table tests.log (
  id bigint generated always as identity primary key,
  label text not null,
  ok boolean not null,
  detail text
);
grant select, insert on tests.log to anon, authenticated;

create function tests.ok(p_label text, p_cond boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into tests.log (label, ok, detail) values (p_label, coalesce(p_cond, false), p_detail);
end
$$;

create function tests.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end
$$;

create function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end
$$;

create function tests.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end
$$;

-- La operación DEBE fallar con ese código de error.
create function tests.expect_fail(p_label text, p_sql text, p_state text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then
      insert into tests.log (label, ok) values (p_label, true);
    else
      insert into tests.log (label, ok, detail)
      values (p_label, false, 'esperaba ' || p_state || ' y fue ' || sqlstate || ': ' || sqlerrm);
    end if;
    return;
  end;
  insert into tests.log (label, ok, detail)
  values (p_label, false, 'esperaba el error ' || p_state || ' pero la operación se permitió');
end
$$;

-- La operación debe afectar exactamente N filas (0 = bloqueada en silencio por RLS).
create function tests.expect_affected(p_label text, p_sql text, p_expected int)
returns void language plpgsql as $$
declare
  n int;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when others then
    insert into tests.log (label, ok, detail)
    values (p_label, false, 'error inesperado ' || sqlstate || ': ' || sqlerrm);
    return;
  end;
  insert into tests.log (label, ok, detail)
  values (p_label, n = p_expected, 'filas afectadas: ' || n || ', esperadas: ' || p_expected);
end
$$;

create function tests.expect_count(p_label text, p_sql text, p_expected bigint)
returns void language plpgsql as $$
declare
  n bigint;
begin
  begin
    execute p_sql into n;
  exception when others then
    insert into tests.log (label, ok, detail)
    values (p_label, false, 'error inesperado ' || sqlstate || ': ' || sqlerrm);
    return;
  end;
  insert into tests.log (label, ok, detail)
  values (p_label, n = p_expected, 'resultado: ' || n || ', esperado: ' || p_expected);
end
$$;


do $$
declare
  a uuid := '00000000-0000-4000-8000-00000000000a';
  b uuid := '00000000-0000-4000-8000-00000000000b';
  base timestamptz := timestamptz '2026-01-05 15:00:00+00';  -- pasado
  statuses text[] := array['scheduled', 'confirmed', 'completed', 'no_show', 'cancelled'];
  allowed_pairs text[] := array[
    'scheduled>confirmed', 'scheduled>completed', 'scheduled>no_show', 'scheduled>cancelled',
    'confirmed>completed', 'confirmed>no_show', 'confirmed>cancelled',
    'no_show>completed', 'cancelled>scheduled'];
  s_from text; s_to text; k int := 0; x uuid; st timestamptz;
  ca uuid; ca2 uuid; cb uuid; cs uuid; ce uuid;
  m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; m6 uuid; m7 uuid; m8 uuid; mf1 uuid; mf2 uuid;
  pay1 uuid; pay_rev uuid;
  r record;
  v_reason text;
  n_total int; n_fail int;
begin
  insert into auth.users (id, email) values (a, 'a@test.local'), (b, 'b@test.local');
  perform tests.as_user(a);
  insert into public.clients (full_name) values ('Cliente A1') returning id into ca;
  insert into public.clients (full_name) values ('Cliente A2') returning id into ca2;
  insert into public.clients (full_name) values ('Cliente con historial') returning id into cs;
  insert into public.clients (full_name) values ('Cliente sin citas') returning id into ce;

  ------------------------------------------------------------------ matriz completa de transiciones
  foreach s_from in array statuses loop
    foreach s_to in array statuses loop
      k := k + 1;
      st := base + k * interval '1 hour';
      if s_from = 'completed' then
        insert into public.appointments (client_id, service_name, price, starts_at, ends_at, status)
        values (ca, 'Corte', 5000, st, st + interval '30 minutes', 'completed') returning id into x;
      else
        insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
        values (ca, 'Corte', 5000, st, st + interval '30 minutes') returning id into x;
        if s_from <> 'scheduled' then
          execute format('update public.appointments set status = %L where id = %L', s_from, x);
        end if;
      end if;
      if s_from = s_to or (s_from || '>' || s_to) = any (allowed_pairs) then
        perform tests.expect_affected(format('transición permitida: %s -> %s', s_from, s_to),
          format('update public.appointments set status = %L where id = %L', s_to, x), 1);
      else
        perform tests.expect_fail(format('transición rechazada: %s -> %s', s_from, s_to),
          format('update public.appointments set status = %L where id = %L', s_to, x), 'P0001');
      end if;
    end loop;
  end loop;

  ------------------------------------------------------------------ cómo nace una cita
  perform tests.expect_fail('una cita nueva no puede nacer cancelada',
    format('insert into public.appointments (client_id, service_name, starts_at, ends_at, status) values (%L, %L, %L, %L, %L)',
           ca, 'Corte', base + interval '200 hours', base + interval '201 hours', 'cancelled'), 'P0001');
  perform tests.expect_fail('una cita nueva no puede nacer como "no asistió"',
    format('insert into public.appointments (client_id, service_name, starts_at, ends_at, status) values (%L, %L, %L, %L, %L)',
           ca, 'Corte', base + interval '200 hours', base + interval '201 hours', 'no_show'), 'P0001');
  perform tests.expect_affected('una cita pasada puede registrarse ya completada (cliente sin cita previa)',
    format('insert into public.appointments (client_id, service_name, starts_at, ends_at, status) values (%L, %L, %L, %L, %L)',
           ca, 'Corte', base + interval '200 hours', base + interval '201 hours', 'completed'), 1);
  perform tests.expect_fail('una cita futura no puede nacer completada',
    format('insert into public.appointments (client_id, service_name, starts_at, ends_at, status) values (%L, %L, %L, %L, %L)',
           ca, 'Corte', now() + interval '3 days', now() + interval '3 days 1 hour', 'completed'), 'P0001');

  ------------------------------------------------------------------ citas futuras
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (ca, 'Corte', 5000, now() + interval '5 days', now() + interval '5 days 30 minutes') returning id into x;
  perform tests.expect_fail('no se completa una cita que todavía no empieza',
    format('update public.appointments set status = %L where id = %L', 'completed', x), 'P0001');
  perform tests.expect_fail('no se marca "no asistió" una cita que todavía no empieza',
    format('update public.appointments set status = %L where id = %L', 'no_show', x), 'P0001');
  perform tests.expect_affected('una cita futura sí se puede confirmar',
    format('update public.appointments set status = %L where id = %L', 'confirmed', x), 1);
  perform tests.expect_affected('una cita futura sí se puede cancelar',
    format('update public.appointments set status = %L, cancel_reason = %L where id = %L', 'cancelled', 'Viaje', x), 1);

  ------------------------------------------------------------------ motivo de cancelación
  select cancel_reason into v_reason from public.appointments where id = x;
  perform tests.ok('el motivo de cancelación se guarda', v_reason = 'Viaje');
  perform tests.expect_affected('se reactiva una cancelada',
    format('update public.appointments set status = %L where id = %L', 'scheduled', x), 1);
  select cancel_reason into v_reason from public.appointments where id = x;
  perform tests.ok('al reactivar se borra el motivo de cancelación', v_reason is null);
  insert into public.appointments (client_id, service_name, starts_at, ends_at, cancel_reason)
  values (ca, 'Corte', now() + interval '6 days', now() + interval '6 days 30 minutes', 'No debería quedar')
  returning id into x;
  select cancel_reason into v_reason from public.appointments where id = x;
  perform tests.ok('una cita no cancelada no guarda motivo de cancelación', v_reason is null);

  ------------------------------------------------------------------ citas cerradas no se alteran
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at, status)
  values (ca, 'Corte', 5000, base + interval '300 hours', base + interval '300 hours 30 minutes', 'completed')
  returning id into x;
  perform tests.expect_fail('cita completada: no cambia el precio',
    format('update public.appointments set price = 1 where id = %L', x), 'P0001');
  perform tests.expect_fail('cita completada: no cambia la hora',
    format('update public.appointments set starts_at = %L, ends_at = %L where id = %L',
           base + interval '310 hours', base + interval '310 hours 30 minutes', x), 'P0001');
  perform tests.expect_fail('cita completada: no cambia el cliente',
    format('update public.appointments set client_id = %L where id = %L', ca2, x), 'P0001');
  perform tests.expect_fail('cita completada: no cambia el nombre del servicio',
    format('update public.appointments set service_name = %L where id = %L', 'Otro', x), 'P0001');
  perform tests.expect_affected('cita completada: las notas sí se pueden editar',
    format('update public.appointments set notes = %L where id = %L', 'Quedó muy contento', x), 1);

  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (ca, 'Corte', 5000, base + interval '320 hours', base + interval '320 hours 30 minutes')
  returning id into x;
  update public.appointments set status = 'cancelled' where id = x;
  perform tests.expect_fail('cita cancelada: no cambia la hora',
    format('update public.appointments set starts_at = %L, ends_at = %L where id = %L',
           base + interval '330 hours', base + interval '330 hours 30 minutes', x), 'P0001');
  perform tests.expect_fail('cita cancelada: no cambia el precio',
    format('update public.appointments set price = 9 where id = %L', x), 'P0001');

  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (ca, 'Corte', 5000, base + interval '340 hours', base + interval '340 hours 30 minutes')
  returning id into x;
  update public.appointments set status = 'no_show' where id = x;
  perform tests.expect_fail('cita "no asistió": no cambia el cliente',
    format('update public.appointments set client_id = %L where id = %L', ca2, x), 'P0001');

  ------------------------------------------------------------------ cobros y cancelaciones
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (ca, 'Corte', 5000, base + interval '400 hours', base + interval '400 hours 30 minutes')
  returning id into x;
  insert into public.payments (appointment_id, amount, method) values (x, 1000, 'sinpe') returning id into pay1;
  perform tests.ok('se acepta un adelanto sobre una cita programada', pay1 is not null);
  perform tests.expect_fail('no se cancela una cita con pagos vigentes',
    format('update public.appointments set status = %L where id = %L', 'cancelled', x), 'P0001');
  perform tests.ok('la cita sigue activa tras el intento',
    (select status from public.appointments where id = x) = 'scheduled');
  update public.payments set reversed_reason = 'Se devolvió el adelanto' where id = pay1;
  perform tests.expect_affected('con el pago reversado ya se puede cancelar',
    format('update public.appointments set status = %L where id = %L', 'cancelled', x), 1);
  perform tests.expect_fail('no se cobra una cita cancelada',
    format('insert into public.payments (appointment_id, amount) values (%L, 500)', x), 'P0001');
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (ca, 'Corte', 5000, base + interval '410 hours', base + interval '410 hours 30 minutes')
  returning id into x;
  update public.appointments set status = 'no_show' where id = x;
  perform tests.expect_affected('se puede cobrar un "no asistió" (por ejemplo, retener el adelanto)',
    format('insert into public.payments (appointment_id, amount, method) values (%L, 1000, %L)', x, 'sinpe'), 1);

  ------------------------------------------------------------------ estadísticas por cliente
  -- 3 completadas (5000, 5000, 8000), 1 no asistió, 2 canceladas, 1 futura programada, 1 futura confirmada.
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at, status)
  values (cs, 'Corte', 5000, base + interval '500 hours', base + interval '500 hours 30 minutes', 'completed') returning id into m1;
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at, status)
  values (cs, 'Corte', 5000, base + interval '510 hours', base + interval '510 hours 30 minutes', 'completed') returning id into m2;
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at, status)
  values (cs, 'Tinte', 8000, base + interval '520 hours', base + interval '521 hours', 'completed') returning id into m3;
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (cs, 'Corte', 5000, base + interval '530 hours', base + interval '530 hours 30 minutes') returning id into m4;
  update public.appointments set status = 'no_show' where id = m4;
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (cs, 'Corte', 5000, base + interval '540 hours', base + interval '540 hours 30 minutes') returning id into m5;
  update public.appointments set status = 'cancelled' where id = m5;
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (cs, 'Corte', 5000, base + interval '550 hours', base + interval '550 hours 30 minutes') returning id into m6;
  update public.appointments set status = 'cancelled' where id = m6;
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (cs, 'Corte', 5000, now() + interval '9 days', now() + interval '9 days 30 minutes') returning id into mf1;
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at, status)
  values (cs, 'Corte', 5000, now() + interval '4 days', now() + interval '4 days 30 minutes', 'confirmed') returning id into mf2;

  -- Una cita vieja que quedó "programada" (nadie la cerró): no cuenta como próxima.
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (cs, 'Corte', 5000, base + interval '560 hours', base + interval '560 hours 30 minutes');

  -- m1: pagado completo con propina. m2: dos pagos parciales (1200 + 800) + uno reversado (1000). m3: sin pagar.
  insert into public.payments (appointment_id, amount, tip, method) values (m1, 5000, 500, 'cash');
  insert into public.payments (appointment_id, amount, method) values (m2, 1200, 'cash');
  insert into public.payments (appointment_id, amount, method) values (m2, 800, 'sinpe');
  insert into public.payments (appointment_id, amount, tip, method) values (m2, 1000, 300, 'card') returning id into pay_rev;
  update public.payments set reversed_reason = 'Cobro duplicado' where id = pay_rev;

  select * into r from public.client_stats where client_id = cs;
  perform tests.ok('stats: 3 visitas completadas', r.visits = 3, 'visits=' || r.visits);
  perform tests.ok('stats: 1 no asistió', r.no_shows = 1, 'no_shows=' || r.no_shows);
  perform tests.ok('stats: 2 cancelaciones', r.cancellations = 2, 'cancellations=' || r.cancellations);
  perform tests.ok('stats: 2 citas próximas (programada y confirmada)', r.upcoming = 2, 'upcoming=' || r.upcoming);
  perform tests.ok('stats: última visita = la completada más reciente', r.last_visit_at = base + interval '520 hours');
  perform tests.ok('stats: próxima cita = la futura más cercana',
    r.next_appointment_at is not null and abs(extract(epoch from (r.next_appointment_at - (now() + interval '4 days')))) < 1);
  perform tests.ok('stats: total pagado 7000 (sin contar el pago reversado ni duplicar filas)', r.total_paid = 7000, 'total_paid=' || r.total_paid);
  perform tests.ok('stats: propinas 500 (la propina del pago reversado no cuenta)', r.total_tips = 500, 'total_tips=' || r.total_tips);
  perform tests.ok('stats: pendiente 11000 (3000 de la parcial + 8000 sin pagar)', r.total_due = 11000, 'total_due=' || r.total_due);
  perform tests.ok('stats: tasa de inasistencia 0.25 (1 de 4 citas a las que debía llegar)', r.no_show_rate = 0.25, 'rate=' || coalesce(r.no_show_rate::text, 'null'));

  select * into r from public.client_stats where client_id = ce;
  perform tests.ok('stats: cliente sin citas queda en ceros',
    r.visits = 0 and r.no_shows = 0 and r.cancellations = 0 and r.upcoming = 0
    and r.total_paid = 0 and r.total_tips = 0 and r.total_due = 0
    and r.last_visit_at is null and r.next_appointment_at is null and r.no_show_rate is null);
  perform tests.expect_count('stats: una fila por cliente (sin duplicar por cruces)',
    'select count(*) from public.client_stats', 4);

  select * into r from public.appointment_balances where appointment_id = m1;
  perform tests.ok('saldo: cita pagada completa no debe nada', r.paid = 5000 and r.tips = 500 and r.due = 0);
  select * into r from public.appointment_balances where appointment_id = m2;
  perform tests.ok('saldo: cita con pago parcial debe 3000', r.paid = 2000 and r.due = 3000, 'paid=' || r.paid || ' due=' || r.due);
  select * into r from public.appointment_balances where appointment_id = m3;
  perform tests.ok('saldo: cita sin pagar debe todo', r.paid = 0 and r.due = 8000);
  select * into r from public.appointment_balances where appointment_id = m5;
  perform tests.ok('saldo: cita cancelada no debe nada', r.due = 0);
  select * into r from public.appointment_balances where appointment_id = mf2;
  perform tests.ok('saldo: cita futura no debe nada', r.due = 0);

  ------------------------------------------------------------------ privacidad de las vistas
  perform tests.as_user(b);
  insert into public.clients (full_name) values ('Cliente de B') returning id into cb;
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at, status)
  values (cb, 'Barba', 3000, base + interval '1 hour', base + interval '2 hours', 'completed') returning id into x;
  insert into public.payments (appointment_id, amount) values (x, 3000);
  perform tests.expect_count('B solo ve sus clientes en client_stats', 'select count(*) from public.client_stats', 1);
  perform tests.expect_count('B no ve estadísticas de clientes de A',
    format('select count(*) from public.client_stats where client_id = %L', cs), 0);
  perform tests.expect_count('B solo ve sus propios saldos', 'select count(*) from public.appointment_balances', 1);
  perform tests.ok('B ve sus propias cifras', (select total_paid from public.client_stats where client_id = cb) = 3000);

  perform tests.as_anon();
  perform tests.expect_fail('sin sesión (anon) no se leen estadísticas',
    'select count(*) from public.client_stats', '42501');
  perform tests.expect_fail('sin sesión (anon) no se leen saldos',
    'select count(*) from public.appointment_balances', '42501');
  perform tests.as_admin();
  perform tests.ok('las vistas usan security_invoker (respetan el RLS de quien consulta)',
    (select count(*) from pg_class c
       where c.relnamespace = 'public'::regnamespace
         and c.relname in ('client_stats', 'appointment_balances')
         and 'security_invoker=true' = any (c.reloptions)) = 2);
  perform tests.ok('authenticated solo puede leer las vistas',
    has_table_privilege('authenticated', 'public.client_stats', 'select')
    and has_table_privilege('authenticated', 'public.appointment_balances', 'select')
    and not has_table_privilege('authenticated', 'public.client_stats', 'insert, update, delete')
    and not has_table_privilege('authenticated', 'public.appointment_balances', 'insert, update, delete'));
  perform tests.ok('anon no tiene permisos sobre las vistas',
    not has_table_privilege('anon', 'public.client_stats', 'select')
    and not has_table_privilege('anon', 'public.appointment_balances', 'select'));

  ------------------------------------------------------------------ borrar una cuenta sigue funcionando
  perform tests.expect_affected('borrar la cuenta de B (con cita completada y pago) sigue funcionando',
    format('delete from auth.users where id = %L', b), 1);
  perform tests.ok('al borrar B no queda nada suyo',
    (select count(*) from public.appointments where owner_id = b) = 0
    and (select count(*) from public.payments where owner_id = b) = 0);
  perform tests.ok('y A conserva sus citas', (select count(*) from public.appointments where owner_id = a) > 30);

  ------------------------------------------------------------------ resultado
  select count(*), count(*) filter (where not ok) into n_total, n_fail from tests.log;
  if n_fail > 0 then
    raise exception E'FALLARON % de % verificaciones:\n%', n_fail, n_total,
      (select string_agg('  ✘ ' || label || coalesce(' → ' || detail, ''), E'\n' order by id)
         from tests.log where not ok);
  end if;
  raise exception 'TODAS LAS PRUEBAS OK (% verificaciones)', n_total;
end
$$;
