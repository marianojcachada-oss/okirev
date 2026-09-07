-- Demo/seed data for OKlrev. Safe to re-run (uses ON CONFLICT DO NOTHING).

insert into teams (id, name) values
  ('t1', 'Soporte N1'),
  ('t2', 'Ventas'),
  ('t3', 'Backoffice'),
  ('t4', 'Calidad')
on conflict (id) do nothing;

insert into employees (id, name, team_id, role, status, productivity, hours_today, check_in, app) values
  ('e1', 'Marina Cabrera', 't1', 'Agente senior', 'activo', 94, 6.4, '08:59', 'Zendesk'),
  ('e2', 'Diego Salinas', 't2', 'Ejecutivo de cuentas', 'activo', 88, 6.1, '09:01', 'Salesforce CRM'),
  ('e3', 'Julieta Ferrero', 't3', 'Analista', 'pausa', 76, 5.2, '08:57', 'En pausa'),
  ('e4', 'Nicolás Roldán', 't4', 'Auditor QA', 'activo', 91, 6.3, '09:00', 'Planilla de auditorías'),
  ('e5', 'Sofía Bianchi', 't1', 'Agente', 'activo', 83, 6.0, '09:03', 'Zendesk'),
  ('e6', 'Tomás Ibarra', 't2', 'Ejecutivo de cuentas', 'inactivo', 58, 4.8, '09:00', 'Sin actividad hace 18 min'),
  ('e7', 'Camila Suárez', 't3', 'Analista senior', 'ausente', 0, 0, '—', '—'),
  ('e8', 'Franco Medina', 't4', 'Auditor QA', 'activo', 89, 6.2, '08:58', 'Planilla de auditorías'),
  ('e9', 'Valentina Rojas', 't1', 'Agente', 'activo', 96, 6.5, '08:56', 'Zendesk'),
  ('e10', 'Agustín Paredes', 't2', 'Ejecutivo junior', 'activo', 79, 5.9, '09:05', 'Salesforce CRM'),
  ('e11', 'Lucía Domínguez', 't3', 'Analista', 'pausa', 71, 5.1, '09:00', 'En pausa'),
  ('e12', 'Bruno Aguirre', 't4', 'Auditor QA', 'activo', 65, 5.6, '09:02', 'YouTube'),
  ('e13', 'Martina Ríos', 't1', 'Agente', 'activo', 90, 6.3, '08:59', 'Zendesk'),
  ('e14', 'Ezequiel Castro', 't2', 'Ejecutivo de cuentas', 'ausente', 0, 0, '—', '—'),
  ('e15', 'Antonella Vega', 't3', 'Analista senior', 'activo', 85, 6.0, '09:01', 'SAP'),
  ('e16', 'Ignacio Herrera', 't4', 'Auditor QA', 'activo', 87, 6.1, '09:00', 'Planilla de auditorías'),
  ('e17', 'Rocío Molina', 't1', 'Agente', 'inactivo', 61, 5.0, '09:04', 'Sin actividad hace 11 min'),
  ('e18', 'Federico Luna', 't2', 'Ejecutivo junior', 'activo', 82, 5.8, '09:12', 'Salesforce CRM')
on conflict (id) do nothing;

insert into alerts (id, severity, type, employee_id, employee_name, detail, time, status) values
  ('a1', 'critica', 'Aplicación no autorizada', 'e12', 'Bruno Aguirre', 'YouTube abierto durante 24 minutos en horario laboral', '09:41', 'abierta'),
  ('a2', 'advertencia', 'Inactividad prolongada', 'e17', 'Rocío Molina', 'Sin actividad de mouse ni teclado por 11 minutos', '10:02', 'abierta'),
  ('a3', 'critica', 'Ausencia sin aviso', 'e7', 'Camila Suárez', 'No registró check-in (código 1015) a las 09:00', '09:15', 'abierta'),
  ('a4', 'advertencia', 'Llegada tarde', 'e18', 'Federico Luna', 'Check-in registrado 12 minutos después del inicio de turno', '09:12', 'revisada'),
  ('a5', 'critica', 'Ausencia sin aviso', 'e14', 'Ezequiel Castro', 'No registró check-in (código 1015) a las 09:00', '09:16', 'abierta'),
  ('a6', 'info', 'Check-out anticipado', 'e10', 'Agustín Paredes', 'Código 1025 registrado 15 minutos antes de fin de turno', '17:45', 'revisada'),
  ('a7', 'advertencia', 'Aplicación no autorizada', 'e6', 'Tomás Ibarra', 'Se detectó Instagram abierto durante 6 minutos', '11:20', 'revisada')
on conflict (id) do nothing;

-- Closed blocks use fixed times (a fixed duration regardless of when this seed is loaded).
insert into attendance (id, employee_id, name, team, date, check_in, check_in_at, check_out, check_out_at, late) values
  ('at1', 'e1', 'Marina Cabrera', 'Soporte N1', current_date, '08:59', current_date + time '08:59', '13:02', current_date + time '13:02', 0),
  ('at3', 'e2', 'Diego Salinas', 'Ventas', current_date, '09:01', current_date + time '09:01', '18:00', current_date + time '18:00', 1),
  ('at6', 'e9', 'Valentina Rojas', 'Soporte N1', current_date, '08:56', current_date + time '08:56', '18:01', current_date + time '18:01', 0)
on conflict (id) do nothing;

-- Open blocks use offsets from now() so "worked so far" is always a sensible positive
-- number, no matter what time of day this seed gets loaded.
insert into attendance (id, employee_id, name, team, date, check_in, check_in_at, check_out, check_out_at, late)
select 'at2', 'e1', 'Marina Cabrera', 'Soporte N1', current_date,
       to_char((now() - interval '45 minutes') at time zone 'America/New_York', 'HH24:MI'),
       now() - interval '45 minutes', null, null, 0
where not exists (select 1 from attendance where id = 'at2');

insert into attendance (id, employee_id, name, team, date, check_in, check_in_at, check_out, check_out_at, late)
select 'at4', 'e3', 'Julieta Ferrero', 'Backoffice', current_date,
       to_char((now() - interval '2 hours') at time zone 'America/New_York', 'HH24:MI'),
       now() - interval '2 hours', null, null, 0
where not exists (select 1 from attendance where id = 'at4');

insert into attendance (id, employee_id, name, team, date, check_in, check_in_at, check_out, check_out_at, late)
select 'at5', 'e18', 'Federico Luna', 'Ventas', current_date,
       to_char((now() - interval '3 hours') at time zone 'America/New_York', 'HH24:MI'),
       now() - interval '3 hours', null, null, 12
where not exists (select 1 from attendance where id = 'at5');

insert into activities (id, employee_id, employee_name, app, category, duration_seconds, occurred_at) values
  ('ac1', 'e1', 'Marina Cabrera', 'Zendesk', 'Productiva', 860, now() - interval '20 minutes'),
  ('ac2', 'e12', 'Bruno Aguirre', 'YouTube', 'No productiva', 1450, now() - interval '22 minutes'),
  ('ac3', 'e2', 'Diego Salinas', 'Salesforce CRM', 'Productiva', 1325, now() - interval '25 minutes'),
  ('ac4', 'e3', 'Julieta Ferrero', 'Sistema en pausa', 'Pausa', 510, now() - interval '27 minutes'),
  ('ac5', 'e15', 'Antonella Vega', 'SAP', 'Productiva', 1904, now() - interval '32 minutes'),
  ('ac6', 'e6', 'Tomás Ibarra', 'Instagram', 'No productiva', 362, now() - interval '40 minutes'),
  ('ac7', 'e4', 'Nicolás Roldán', 'Planilla de auditorías', 'Productiva', 2411, now() - interval '45 minutes'),
  ('ac8', 'e17', 'Rocío Molina', 'Sin actividad', 'Inactivo', 660, now() - interval '52 minutes')
on conflict (id) do nothing;

insert into projects (id, name, team, progress, hours_logged, hours_budget, state) values
  ('p1', 'Migración CRM Ventas', 'Ventas', 68, 214, 320, 'En curso'),
  ('p2', 'Auditoría de calidad Q3', 'Calidad', 91, 142, 150, 'En curso'),
  ('p3', 'Reestructuración Backoffice', 'Backoffice', 34, 88, 260, 'En riesgo'),
  ('p4', 'Onboarding Soporte N1', 'Soporte N1', 100, 96, 96, 'Completado')
on conflict (id) do nothing;

update settings set
  company_name = 'Mi Empresa S.A.',
  timezone = 'America/New_York (GMT-4, Atlanta EE. UU.)',
  idle_threshold_minutes = 5,
  prohibited_apps = array['YouTube', 'Netflix', 'Instagram', 'Juegos en línea']
where id = 1;
