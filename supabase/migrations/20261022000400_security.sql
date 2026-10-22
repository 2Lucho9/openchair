-- OpenChair · Fase 2 · 4/4: seguridad (RLS y permisos)
--
-- Regla de oro: cada persona solo ve y toca filas con owner_id = su propio usuario.
-- El rol anon (sin sesión) no recibe ningún permiso.

alter table public.profiles enable row level security;
alter table public.working_hours enable row level security;
alter table public.time_off enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;

-- Permisos de tabla: lo mínimo necesario para el rol authenticated.
revoke all on public.profiles, public.working_hours, public.time_off, public.clients,
  public.services, public.appointments, public.payments, public.audit_log
  from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.working_hours to authenticated;
grant select, insert, update, delete on public.time_off to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.services to authenticated;
-- Citas y pagos no se borran: las citas se cancelan y los pagos se reversan.
grant select, insert, update on public.appointments to authenticated;
grant select, insert, update on public.payments to authenticated;
grant select on public.audit_log to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Perfil: solo el propio. Se crea por trigger; no se inserta ni se borra desde la app.
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Tablas con ciclo de vida completo.
do $$
declare
  t text;
begin
  foreach t in array array['working_hours', 'time_off', 'clients', 'services'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = owner_id)',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = owner_id)',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = owner_id)',
      t || '_delete_own', t);
  end loop;

  -- Sin delete: citas y pagos son historial.
  foreach t in array array['appointments', 'payments'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = owner_id)',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = owner_id)',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)',
      t || '_update_own', t);
  end loop;
end
$$;

-- Auditoría: solo lectura de lo propio.
create policy audit_log_select_own on public.audit_log
  for select to authenticated using ((select auth.uid()) = owner_id);
