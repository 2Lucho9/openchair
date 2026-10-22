-- OpenChair · Fase 6: recordatorios por WhatsApp
--
--   * appointments.reminder_sent_at: cuándo se le envió el recordatorio al cliente (null = no enviado).
--     Puede marcarse en cualquier cita, incluso cerrada: no toca precio, cliente ni horario.
--   * profiles.reminder_template: el texto del recordatorio. Variables que reconoce la app:
--     {nombre} {servicio} {dia} {hora} {negocio}

alter table public.appointments
  add column reminder_sent_at timestamptz;

alter table public.profiles
  add column reminder_template text not null
    default 'Hola {nombre}, te recuerdo tu cita de {servicio} {dia} a las {hora} en {negocio}. ¡Te espero!'
    constraint profiles_reminder_template_len
      check (char_length(btrim(reminder_template)) between 1 and 500);
