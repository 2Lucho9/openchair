-- OpenChair · Fase 6 · Prueba de recordatorios
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
  base timestamptz := timestamptz '2026-01-05 15:00:00+00';
  ca uuid; cb uuid; a1 uuid; a2 uuid; ab uuid;
  v_sc timestamptz; v_sent timestamptz; v_tpl text; n_total int; n_fail int;
begin
  insert into auth.users (id, email) values (a, 'a@test.local'), (b, 'b@test.local');

  ------------------------------------------------------------------ plantilla
  perform tests.ok('el perfil nuevo trae una plantilla por defecto con las variables',
    (select reminder_template from public.profiles where id = a) like '%{nombre}%{servicio}%{dia}%{hora}%{negocio}%');
  perform tests.as_user(a);
  perform tests.expect_affected('A edita su plantilla',
    format('update public.profiles set reminder_template = %L where id = %L', 'Hola {nombre}, mañana {hora}.', a), 1);
  select reminder_template into v_tpl from public.profiles where id = a;
  perform tests.ok('la plantilla queda guardada', v_tpl = 'Hola {nombre}, mañana {hora}.');
  perform tests.expect_fail('plantilla vacía se rechaza',
    format('update public.profiles set reminder_template = %L where id = %L', '   ', a), '23514');
  perform tests.expect_fail('plantilla de más de 500 caracteres se rechaza',
    format('update public.profiles set reminder_template = %L where id = %L', repeat('x', 501), a), '23514');
  perform tests.expect_affected('plantilla de exactamente 500 caracteres se acepta',
    format('update public.profiles set reminder_template = %L where id = %L', repeat('x', 500), a), 1);
  perform tests.as_user(b);
  perform tests.expect_affected('B no puede editar la plantilla de A',
    format('update public.profiles set reminder_template = %L where id = %L', 'hack', a), 0);
  perform tests.ok('la plantilla de B no cambió', (select reminder_template from public.profiles where id = b) like 'Hola {nombre}%');

  ------------------------------------------------------------------ recordatorio enviado
  perform tests.as_user(a);
  insert into public.clients (full_name, phone) values ('Cliente A', '88887777') returning id into ca;
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at, status_changed_at)
  values (ca, 'Corte', 5000, base, base + interval '30 minutes', timestamptz '2020-01-01 00:00:00+00') returning id into a1;
  perform tests.ok('una cita nueva no tiene recordatorio enviado',
    (select reminder_sent_at is null from public.appointments where id = a1));
  perform tests.expect_affected('A marca el recordatorio como enviado',
    format('update public.appointments set reminder_sent_at = now() where id = %L', a1), 1);
  select reminder_sent_at, status_changed_at into v_sent, v_sc from public.appointments where id = a1;
  perform tests.ok('queda la hora del envío', v_sent = now());
  perform tests.ok('marcar el recordatorio no mueve status_changed_at', v_sc = timestamptz '2020-01-01 00:00:00+00');
  perform tests.expect_affected('A puede quitar la marca (reenviar)',
    format('update public.appointments set reminder_sent_at = null where id = %L', a1), 1);

  -- También en citas cerradas (no toca precio, cliente ni horario).
  update public.appointments set status = 'completed' where id = a1;
  perform tests.expect_affected('se puede marcar el recordatorio en una cita completada',
    format('update public.appointments set reminder_sent_at = now() where id = %L', a1), 1);
  perform tests.expect_fail('pero una cita completada sigue sin cambiar de precio',
    format('update public.appointments set price = 1 where id = %L', a1), 'P0001');
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (ca, 'Corte', 5000, base + interval '2 hours', base + interval '2 hours 30 minutes') returning id into a2;
  update public.appointments set status = 'cancelled' where id = a2;
  perform tests.expect_affected('también en una cita cancelada',
    format('update public.appointments set reminder_sent_at = now() where id = %L', a2), 1);

  ------------------------------------------------------------------ aislamiento
  perform tests.as_user(b);
  insert into public.clients (full_name) values ('Cliente B') returning id into cb;
  insert into public.appointments (client_id, service_name, starts_at, ends_at)
  values (cb, 'Barba', base, base + interval '20 minutes') returning id into ab;
  perform tests.expect_affected('B no puede marcar recordatorios de citas de A',
    format('update public.appointments set reminder_sent_at = now() where id = %L', a1), 0);
  perform tests.expect_count('B no ve la marca de A',
    format('select count(*) from public.appointments where id = %L', a1), 0);
  perform tests.expect_affected('B marca el suyo',
    format('update public.appointments set reminder_sent_at = now() where id = %L', ab), 1);

  ------------------------------------------------------------------ auditoría y permisos
  perform tests.as_user(a);
  perform tests.ok('la auditoría registra el envío del recordatorio',
    (select count(*) from public.audit_log
      where table_name = 'appointments' and row_id = a1 and action = 'UPDATE'
        and new_row ->> 'reminder_sent_at' is not null) >= 1);
  perform tests.as_anon();
  perform tests.expect_fail('sin sesión (anon) no se leen citas', 'select reminder_sent_at from public.appointments', '42501');
  perform tests.as_admin();
  perform tests.ok('la columna nueva no abre permisos a anon',
    not has_table_privilege('anon', 'public.appointments', 'select, update'));

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
