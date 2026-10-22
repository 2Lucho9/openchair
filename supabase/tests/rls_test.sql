-- OpenChair · Fase 2 (actualizada en Fase 3) · Prueba de seguridad y reglas de la base de datos
--
-- Cómo correrla: copia TODO este archivo, pégalo en Supabase → SQL Editor y ejecútalo.
-- Crea dos usuarios de prueba (A y B) y verifica aislamiento, choques de citas y pagos.
--
-- IMPORTANTE: termina con un "error" a propósito, para que se revierta todo lo de prueba.
--   ✔ Todo bien:  ERROR: TODAS LAS PRUEBAS OK (N verificaciones)
--   ✘ Algo falló: ERROR: FALLARON X de N verificaciones, seguido de la lista
-- No hay nada que limpiar: no queda ningún dato de prueba ni el esquema "tests".

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
  base timestamptz := timestamptz '2026-01-05 15:00:00+00';  -- lunes 09:00 en Costa Rica (pasado: en Fase 3 solo se completa lo que ya empezó)
  ca uuid; cb uuid; sa uuid; sb uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; ab uuid;
  p1 uuid; p2 uuid; pb uuid;
  v_status_changed timestamptz;
  v_reversed timestamptz;
  t text;
  n_total int;
  n_fail int;
begin
  ------------------------------------------------------------------ preparación
  insert into auth.users (id, email) values (a, 'a@test.local'), (b, 'b@test.local');
  perform tests.ok('el trigger crea el perfil de cada usuario nuevo',
    (select count(*) from public.profiles where id in (a, b)) = 2);

  ------------------------------------------------------------------ perfiles
  perform tests.as_user(a);
  perform tests.expect_count('A solo ve su propio perfil', 'select count(*) from public.profiles', 1);
  perform tests.expect_affected('A no puede editar el perfil de B',
    format('update public.profiles set display_name = %L where id = %L', 'hack', b), 0);
  perform tests.expect_affected('A puede editar su propio perfil',
    format('update public.profiles set display_name = %L, buffer_min = 10 where id = %L', 'Barbero A', a), 1);
  perform tests.expect_fail('A no puede crear perfiles a mano',
    format('insert into public.profiles (id) values (%L)', gen_random_uuid()), '42501');
  perform tests.expect_fail('A no puede borrar su perfil',
    format('delete from public.profiles where id = %L', a), '42501');
  perform tests.expect_fail('buffer_min fuera de rango se rechaza',
    format('update public.profiles set buffer_min = 500 where id = %L', a), '23514');
  perform tests.expect_fail('moneda no soportada se rechaza',
    format('update public.profiles set currency = %L where id = %L', 'EUR', a), '23514');

  ------------------------------------------------------------------ datos de A
  insert into public.clients (full_name, phone, notes)
  values ('Cliente de A', '88887777', 'Degradado bajo, sin máquina en la nuca')
  returning id into ca;
  perform tests.ok('el owner_id se llena solo con el usuario autenticado',
    (select owner_id from public.clients where id = ca) = a);

  insert into public.services (name, duration_min, price) values ('Corte', 30, 5000) returning id into sa;

  -- Se fija status_changed_at viejo a propósito para medir si el trigger lo mueve.
  insert into public.appointments (client_id, service_id, service_name, price, starts_at, ends_at, status_changed_at)
  values (ca, sa, 'Corte', 5000, base, base + interval '30 minutes', timestamptz '2020-01-01 00:00:00+00')
  returning id into a1;

  ------------------------------------------------------------------ datos de B
  perform tests.as_user(b);
  insert into public.clients (full_name, phone) values ('Cliente de B', '70001111') returning id into cb;
  insert into public.services (name, duration_min, price) values ('Barba', 20, 3000) returning id into sb;
  -- B agenda a la MISMA hora que A: son agendas independientes.
  insert into public.appointments (client_id, service_id, service_name, price, starts_at, ends_at)
  values (cb, sb, 'Barba', 3000, base, base + interval '20 minutes')
  returning id into ab;
  perform tests.ok('B puede agendar a la misma hora que A (agendas independientes)', ab is not null);
  insert into public.payments (appointment_id, amount, method) values (ab, 3000, 'cash') returning id into pb;

  ------------------------------------------------------------------ aislamiento de lectura/escritura
  perform tests.expect_count('B no ve clientes de A', format('select count(*) from public.clients where id = %L', ca), 0);
  perform tests.expect_count('B solo ve sus propios clientes', 'select count(*) from public.clients', 1);
  perform tests.expect_count('B no ve servicios de A', format('select count(*) from public.services where id = %L', sa), 0);
  perform tests.expect_count('B no ve citas de A', format('select count(*) from public.appointments where id = %L', a1), 0);
  perform tests.expect_affected('B no puede editar clientes de A',
    format('update public.clients set full_name = %L where id = %L', 'hack', ca), 0);
  perform tests.expect_affected('B no puede borrar clientes de A',
    format('delete from public.clients where id = %L', ca), 0);
  perform tests.expect_affected('B no puede editar citas de A',
    format('update public.appointments set notes = %L where id = %L', 'hack', a1), 0);
  perform tests.expect_affected('B no puede editar servicios de A',
    format('update public.services set price = 0 where id = %L', sa), 0);

  perform tests.as_user(a);
  perform tests.expect_count('A no ve clientes de B', format('select count(*) from public.clients where id = %L', cb), 0);
  perform tests.expect_count('A solo ve sus propios clientes', 'select count(*) from public.clients', 1);

  perform tests.as_anon();
  foreach t in array array['profiles', 'clients', 'services', 'working_hours', 'time_off',
                           'appointments', 'payments', 'audit_log'] loop
    perform tests.expect_fail('sin sesión (anon) no se puede leer ' || t,
      'select count(*) from public.' || t, '42501');
  end loop;
  perform tests.expect_fail('sin sesión (anon) no se puede insertar clientes',
    format('insert into public.clients (owner_id, full_name) values (%L, %L)', a, 'x'), '42501');

  ------------------------------------------------------------------ clientes (A)
  perform tests.as_user(a);
  perform tests.expect_fail('A no puede crear clientes a nombre de B',
    format('insert into public.clients (owner_id, full_name) values (%L, %L)', b, 'Intruso'), '42501');
  perform tests.expect_fail('A no puede pasarle un cliente suyo a B',
    format('update public.clients set owner_id = %L where id = %L', b, ca), '42501');
  perform tests.expect_fail('el nombre del cliente no puede ir en blanco',
    $q$insert into public.clients (full_name) values ('   ')$q$, '23514');
  perform tests.expect_fail('el teléfono muy corto se rechaza',
    $q$insert into public.clients (full_name, phone) values ('Ana', '123')$q$, '23514');

  ------------------------------------------------------------------ servicios (A)
  perform tests.expect_fail('duración de servicio menor a 5 min se rechaza',
    $q$insert into public.services (name, duration_min) values ('Rápido', 2)$q$, '23514');
  perform tests.expect_fail('precio negativo se rechaza',
    $q$insert into public.services (name, duration_min, price) values ('Corte', 30, -1)$q$, '23514');
  perform tests.expect_fail('nombre de servicio en blanco se rechaza',
    $q$insert into public.services (name, duration_min) values ('', 30)$q$, '23514');

  ------------------------------------------------------------------ citas: choques
  perform tests.expect_fail('cita que se cruza al final de otra: choque',
    format('insert into public.appointments (client_id, service_name, starts_at, ends_at) values (%L, %L, %L, %L)',
           ca, 'Corte', base + interval '15 minutes', base + interval '45 minutes'), '23P01');
  perform tests.expect_fail('cita exactamente en el mismo horario: choque',
    format('insert into public.appointments (client_id, service_name, starts_at, ends_at) values (%L, %L, %L, %L)',
           ca, 'Corte', base, base + interval '30 minutes'), '23P01');
  perform tests.expect_fail('cita metida dentro de otra: choque',
    format('insert into public.appointments (client_id, service_name, starts_at, ends_at) values (%L, %L, %L, %L)',
           ca, 'Corte', base + interval '5 minutes', base + interval '10 minutes'), '23P01');
  perform tests.expect_fail('cita que envuelve a otra: choque',
    format('insert into public.appointments (client_id, service_name, starts_at, ends_at) values (%L, %L, %L, %L)',
           ca, 'Largo', base - interval '10 minutes', base + interval '60 minutes'), '23P01');

  -- Citas pegadas (una termina cuando empieza la otra) sí se permiten.
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (ca, 'Corte', 5000, base + interval '30 minutes', base + interval '60 minutes')
  returning id into a2;
  perform tests.ok('citas pegadas (09:30 empieza cuando 09:30 termina) se permiten', a2 is not null);
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (ca, 'Corte', 5000, base - interval '30 minutes', base)
  returning id into a3;
  perform tests.ok('cita que termina justo cuando empieza otra se permite', a3 is not null);

  -- Cancelada libera el espacio...
  perform tests.expect_affected('A cancela la cita de las 09:30',
    format('update public.appointments set status = %L, cancel_reason = %L where id = %L', 'cancelled', 'Cliente avisó', a2), 1);
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (ca, 'Corte', 5000, base + interval '30 minutes', base + interval '60 minutes')
  returning id into a4;
  perform tests.ok('una cita cancelada libera el horario', a4 is not null);
  -- ...pero no se puede reactivar encima de otra.
  perform tests.expect_fail('reactivar una cancelada sobre un horario ocupado: choque',
    format('update public.appointments set status = %L where id = %L', 'scheduled', a2), '23P01');

  -- "No asistió" también libera.
  perform tests.expect_affected('A marca no asistió la cita de las 09:30',
    format('update public.appointments set status = %L where id = %L', 'no_show', a4), 1);
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at)
  values (ca, 'Corte', 5000, base + interval '30 minutes', base + interval '60 minutes');
  perform tests.ok('un "no asistió" libera el horario', true);

  -- Completada sigue ocupando el tiempo.
  perform tests.expect_affected('A completa la cita de las 09:00',
    format('update public.appointments set status = %L where id = %L', 'completed', a1), 1);
  perform tests.expect_fail('una cita completada sigue ocupando el horario',
    format('insert into public.appointments (client_id, service_name, starts_at, ends_at) values (%L, %L, %L, %L)',
           ca, 'Corte', base + interval '10 minutes', base + interval '20 minutes'), '23P01');

  ------------------------------------------------------------------ citas: validaciones
  perform tests.expect_fail('estado inválido se rechaza',
    format('update public.appointments set status = %L where id = %L', 'done', a1), '23514');
  perform tests.expect_fail('cita que termina antes de empezar se rechaza',
    format('insert into public.appointments (client_id, service_name, starts_at, ends_at) values (%L, %L, %L, %L)',
           ca, 'Corte', base + interval '5 hours', base + interval '4 hours'), '23514');
  perform tests.expect_fail('cita de más de 24 horas se rechaza',
    format('insert into public.appointments (client_id, service_name, starts_at, ends_at) values (%L, %L, %L, %L)',
           ca, 'Corte', base + interval '2 days', base + interval '4 days'), '23514');
  perform tests.expect_fail('cita sin nombre de servicio se rechaza',
    format('insert into public.appointments (client_id, service_name, starts_at, ends_at) values (%L, %L, %L, %L)',
           ca, '', base + interval '6 hours', base + interval '7 hours'), '23514');

  ------------------------------------------------------------------ citas: aislamiento entre dueños
  perform tests.expect_fail('A no puede agendar con un cliente de B (clave compuesta)',
    format('insert into public.appointments (client_id, service_name, starts_at, ends_at) values (%L, %L, %L, %L)',
           cb, 'Corte', base + interval '6 hours', base + interval '7 hours'), '23503');
  perform tests.expect_fail('A no puede usar un servicio de B (clave compuesta)',
    format('insert into public.appointments (client_id, service_id, service_name, starts_at, ends_at) values (%L, %L, %L, %L, %L)',
           ca, sb, 'Barba', base + interval '6 hours', base + interval '7 hours'), '23503');
  perform tests.expect_fail('A no puede crear citas a nombre de B',
    format('insert into public.appointments (owner_id, client_id, service_name, starts_at, ends_at) values (%L, %L, %L, %L, %L)',
           b, cb, 'Corte', base + interval '6 hours', base + interval '7 hours'), '42501');
  perform tests.expect_fail('las citas no se borran (se cancelan)',
    format('delete from public.appointments where id = %L', a1), '42501');
  perform tests.expect_fail('A no puede mover una cita suya a B',
    format('update public.appointments set owner_id = %L where id = %L', b, a1), '42501');

  -- status_changed_at solo se mueve cuando cambia el estado.
  -- Cita nueva (a1 ya cambió de estado antes) con un status_changed_at viejo a propósito.
  insert into public.appointments (client_id, service_name, price, starts_at, ends_at, status_changed_at)
  values (ca, 'Corte', 5000, base + interval '8 hours', base + interval '8 hours 30 minutes', timestamptz '2020-01-01 00:00:00+00')
  returning id into a3;
  perform tests.expect_affected('A edita solo las notas de una cita',
    format('update public.appointments set notes = %L where id = %L', 'Trae foto de referencia', a3), 1);
  select status_changed_at into v_status_changed from public.appointments where id = a3;
  perform tests.ok('cambiar solo las notas no mueve status_changed_at',
    v_status_changed = timestamptz '2020-01-01 00:00:00+00');
  update public.appointments set status = 'confirmed' where id = a3;
  select status_changed_at into v_status_changed from public.appointments where id = a3;
  perform tests.ok('cambiar el estado sí mueve status_changed_at', v_status_changed > timestamptz '2020-01-01 00:00:00+00');

  ------------------------------------------------------------------ horario semanal
  insert into public.working_hours (weekday, start_min, end_min) values (1, 540, 1080);
  perform tests.ok('A guarda su horario del lunes 09:00-18:00', true);
  perform tests.expect_fail('turno del lunes que se cruza con otro: choque',
    'insert into public.working_hours (weekday, start_min, end_min) values (1, 1020, 1200)', '23P01');
  insert into public.working_hours (weekday, start_min, end_min) values (1, 1080, 1200);
  perform tests.ok('turnos pegados el mismo día se permiten', true);
  insert into public.working_hours (weekday, start_min, end_min) values (2, 540, 1080);
  perform tests.ok('el mismo horario en otro día se permite', true);
  perform tests.expect_fail('turno con fin menor al inicio se rechaza',
    'insert into public.working_hours (weekday, start_min, end_min) values (3, 600, 500)', '23514');
  perform tests.expect_fail('turno que pasa de 48:00 se rechaza',
    'insert into public.working_hours (weekday, start_min, end_min) values (3, 600, 3000)', '23514');
  perform tests.expect_fail('día de la semana inválido se rechaza',
    'insert into public.working_hours (weekday, start_min, end_min) values (7, 600, 700)', '23514');
  perform tests.expect_fail('A no puede poner horario a nombre de B',
    format('insert into public.working_hours (owner_id, weekday, start_min, end_min) values (%L, 3, 600, 700)', b), '42501');

  ------------------------------------------------------------------ bloqueos
  insert into public.time_off (starts_at, ends_at, reason)
  values (base + interval '3 hours', base + interval '4 hours', 'Almuerzo');
  perform tests.ok('A crea un bloqueo (almuerzo)', true);
  perform tests.expect_fail('bloqueo que termina antes de empezar se rechaza',
    format('insert into public.time_off (starts_at, ends_at) values (%L, %L)', base + interval '2 hours', base + interval '1 hour'), '23514');
  perform tests.expect_affected('A puede borrar sus bloqueos', 'delete from public.time_off', 1);

  ------------------------------------------------------------------ pagos
  -- a1 está completada (09:00-09:30).
  insert into public.payments (appointment_id, amount, tip, method, notes)
  values (a1, 5000, 500, 'sinpe', 'Pagó por SINPE')
  returning id into p1;
  perform tests.ok('A registra un pago con propina', p1 is not null);
  insert into public.payments (appointment_id, amount, method) values (a1, 2000, 'cash') returning id into p2;

  perform tests.expect_fail('pago de 0 con propina 0 se rechaza',
    format('insert into public.payments (appointment_id, amount, tip) values (%L, 0, 0)', a1), '23514');
  perform tests.expect_fail('pago negativo se rechaza',
    format('insert into public.payments (appointment_id, amount) values (%L, -5)', a1), '23514');
  perform tests.expect_fail('método de pago inválido se rechaza',
    format('insert into public.payments (appointment_id, amount, method) values (%L, 100, %L)', a1, 'bitcoin'), '23514');
  perform tests.expect_fail('A no puede cobrar una cita de B (clave compuesta)',
    format('insert into public.payments (appointment_id, amount) values (%L, 100)', ab), '23503');
  perform tests.expect_fail('A no puede crear pagos a nombre de B',
    format('insert into public.payments (owner_id, appointment_id, amount) values (%L, %L, 100)', b, ab), '42501');
  perform tests.expect_fail('un pago nuevo no puede nacer reversado',
    format('insert into public.payments (appointment_id, amount, reversed_reason) values (%L, 100, %L)', a1, 'Nació reversado'), 'P0001');
  perform tests.expect_fail('los pagos no se editan (monto)',
    format('update public.payments set amount = 1 where id = %L', p1), 'P0001');
  perform tests.expect_fail('los pagos no se editan (propina)',
    format('update public.payments set tip = 0 where id = %L', p1), 'P0001');
  perform tests.expect_fail('los pagos no se pasan a otra cita',
    format('update public.payments set appointment_id = %L where id = %L', a3, p1), 'P0001');
  perform tests.expect_fail('los pagos no se borran (A)',
    format('delete from public.payments where id = %L', p1), '42501');
  perform tests.expect_fail('el motivo de reversa muy corto se rechaza',
    format('update public.payments set reversed_reason = %L where id = %L', 'x', p2), '23514');

  perform tests.expect_affected('A reversa un pago con motivo',
    format('update public.payments set reversed_reason = %L where id = %L', 'Error de monto', p1), 1);
  select reversed_at into v_reversed from public.payments where id = p1;
  perform tests.ok('la hora de la reversa la pone el servidor', v_reversed is not null and v_reversed = now());
  perform tests.expect_fail('un pago reversado no se puede reversar otra vez',
    format('update public.payments set reversed_reason = %L where id = %L', 'Otra vez', p1), 'P0001');
  perform tests.expect_fail('un pago reversado no se puede editar',
    format('update public.payments set amount = 9 where id = %L', p1), 'P0001');
  perform tests.expect_affected('A intenta fijar reversed_at a mano, sin motivo',
    format('update public.payments set reversed_at = now() where id = %L', p2), 1);
  perform tests.ok('reversed_at a mano sin motivo no deja el pago reversado',
    (select reversed_at is null from public.payments where id = p2));

  perform tests.as_user(b);
  perform tests.expect_count('B no ve pagos de A', format('select count(*) from public.payments where id in (%L, %L)', p1, p2), 0);
  perform tests.expect_affected('B no puede reversar pagos de A',
    format('update public.payments set reversed_reason = %L where id = %L', 'Intento de B', p2), 0);

  perform tests.as_admin();
  perform tests.expect_fail('ni con permisos de administrador se borra un pago',
    format('delete from public.payments where id = %L', p2), 'P0001');

  ------------------------------------------------------------------ auditoría
  perform tests.as_user(a);
  perform tests.ok('A ve auditoría de sus citas',
    (select count(*) from public.audit_log where table_name = 'appointments') > 0);
  perform tests.ok('la auditoría registra las reversas de pagos',
    (select count(*) from public.audit_log where table_name = 'payments' and action = 'UPDATE') >= 1);
  perform tests.ok('la auditoría guarda quién hizo el cambio',
    (select count(*) from public.audit_log where actor = a) > 0);
  perform tests.expect_fail('A no puede escribir en la auditoría',
    format('insert into public.audit_log (owner_id, table_name, action) values (%L, %L, %L)', a, 'x', 'INSERT'), '42501');
  perform tests.expect_fail('A no puede editar la auditoría',
    'update public.audit_log set action = ''DELETE''', '42501');
  perform tests.expect_fail('A no puede borrar la auditoría', 'delete from public.audit_log', '42501');
  perform tests.as_user(b);
  perform tests.expect_count('B no ve la auditoría de A',
    format('select count(*) from public.audit_log where owner_id = %L', a), 0);
  perform tests.as_admin();
  perform tests.expect_fail('ni con permisos de administrador se edita la auditoría',
    'update public.audit_log set action = ''DELETE''', 'P0001');
  perform tests.expect_fail('ni con permisos de administrador se borra la auditoría',
    'delete from public.audit_log', 'P0001');

  ------------------------------------------------------------------ permisos de tabla
  perform tests.ok('todas las tablas tienen RLS activo',
    (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0);
  foreach t in array array['profiles', 'clients', 'services', 'working_hours', 'time_off',
                           'appointments', 'payments', 'audit_log'] loop
    perform tests.ok('anon no tiene ningún permiso sobre ' || t,
      not has_table_privilege('anon', 'public.' || t, 'select, insert, update, delete'));
  end loop;
  perform tests.ok('authenticated no puede borrar citas, pagos ni auditoría',
    not has_table_privilege('authenticated', 'public.appointments', 'delete')
    and not has_table_privilege('authenticated', 'public.payments', 'delete')
    and not has_table_privilege('authenticated', 'public.audit_log', 'delete'));

  ------------------------------------------------------------------ borrar una cuenta completa
  perform tests.ok('B tiene datos antes de borrarse (citas, pago, auditoría)',
    (select count(*) from public.appointments where owner_id = b) > 0
    and (select count(*) from public.payments where owner_id = b) > 0
    and (select count(*) from public.audit_log where owner_id = b) > 0);
  perform tests.expect_affected('borrar al usuario B (cuenta completa) funciona',
    format('delete from auth.users where id = %L', b), 1);
  perform tests.ok('al borrar B desaparece todo lo suyo',
    (select count(*) from public.profiles where id = b) = 0
    and (select count(*) from public.clients where owner_id = b) = 0
    and (select count(*) from public.appointments where owner_id = b) = 0
    and (select count(*) from public.payments where owner_id = b) = 0
    and (select count(*) from public.audit_log where owner_id = b) = 0);
  perform tests.ok('y no se toca nada de A',
    (select count(*) from public.clients where owner_id = a) = 1
    and (select count(*) from public.payments where owner_id = a) = 2);

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
