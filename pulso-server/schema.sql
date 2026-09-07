-- OKlrev database schema (Postgres / Supabase)
-- Run this once in the Supabase SQL editor (or against any Postgres instance).

create table if not exists teams (
  id text primary key,
  name text not null unique
);

create table if not exists roles (
  id text primary key,
  name text not null unique,
  permissions text[] not null default '{}' -- page ids the role can see, e.g. 'inicio','empleados'
);
insert into roles (id, name, permissions) values
  ('r_admin', 'Administrador', array['inicio','tiempo-real','alertas','empleados','equipos','asistencia','actividades','catalogo','proyectos','informes-apps','informes-web','ajustes'])
on conflict (id) do nothing;

create table if not exists tracking_configs (
  id text primary key,
  name text not null unique,
  idle_threshold_minutes integer not null default 5,
  break_minutes integer not null default 15
);
insert into tracking_configs (id, name, idle_threshold_minutes, break_minutes) values ('tc_default', 'Estándar', 5, 15)
on conflict (id) do nothing;

create table if not exists employees (
  id text primary key,
  name text not null,
  team_id text references teams(id),
  role text,
  status text not null default 'ausente', -- activo | pausa | inactivo | ausente
  productivity integer not null default 0,
  hours_today numeric not null default 0,
  check_in text,
  app text,
  username text unique,
  email text,
  password_hash text,
  role_id text references roles(id),
  tracking_config_id text references tracking_configs(id),
  idle_threshold_minutes_override integer, -- null = use tracking_config_id's value, or the company default
  break_minutes_override integer -- null = use tracking_config_id's value, or the company default
);

-- One row per break (código 10-31). Linked to the attendance block it happened during, so the
-- allowance naturally resets on every new check-in (a new block has no breaks logged yet).
create table if not exists breaks (
  id text primary key,
  employee_id text references employees(id),
  attendance_id text references attendance(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  date date not null
);
create index if not exists idx_breaks_employee_open on breaks(employee_id) where ended_at is null;
create index if not exists idx_breaks_attendance on breaks(attendance_id);

create table if not exists sessions (
  token text primary key,
  employee_id text not null references employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);
create index if not exists idx_sessions_employee on sessions(employee_id);

-- Tracks which computer(s) each employee has logged in from (captured from the tracker's
-- os.hostname() on login), so an admin can spot someone using an unexpected machine.
create table if not exists employee_devices (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  hostname text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (employee_id, hostname)
);
create index if not exists idx_employee_devices_employee on employee_devices(employee_id);

create table if not exists alerts (
  id text primary key,
  severity text not null,               -- critica | advertencia | info
  type text not null,
  employee_id text references employees(id),
  employee_name text,
  detail text,
  time text,
  status text not null default 'abierta', -- abierta | revisada
  created_at timestamptz not null default now()
);

-- Each row is one check-in/check-out block. An employee can have several per day.
create table if not exists attendance (
  id text primary key,
  employee_id text references employees(id),
  name text,
  team text,
  date date not null,
  check_in text,
  check_in_at timestamptz,
  check_out text,
  check_out_at timestamptz,
  late integer not null default 0
);
create index if not exists idx_attendance_employee_date on attendance(employee_id, date);
create index if not exists idx_attendance_open on attendance(employee_id) where check_out_at is null;

-- Activity log: one row per detected app/window segment. duration_seconds enables SUM()/aggregation.
create table if not exists activities (
  id text primary key,
  employee_id text references employees(id),
  employee_name text,
  app text not null,
  category text not null,              -- Productiva | No productiva | Pausa | Inactivo
  duration_seconds integer not null,
  occurred_at timestamptz not null default now()
);
create index if not exists idx_activities_employee_time on activities(employee_id, occurred_at);

create table if not exists projects (
  id text primary key,
  name text not null,
  team text,
  progress integer not null default 0,
  hours_logged numeric not null default 0,
  hours_budget numeric not null default 0,
  state text not null default 'En curso'
);

-- Single-row table holding company-wide settings.
create table if not exists settings (
  id integer primary key default 1,
  company_name text not null default 'Mi Empresa S.A.',
  timezone text not null default 'America/New_York (GMT-4, Atlanta EE. UU.)',
  idle_threshold_minutes integer not null default 5,
  default_break_minutes integer not null default 15,
  prohibited_apps text[] not null default '{}',
  desktop_token text,
  constraint settings_single_row check (id = 1)
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- Catalog of distinct apps/sites for the upcoming classification feature
-- (Productiva / Neutral / Improductiva). Populated lazily as new apps are seen.
create table if not exists app_catalog (
  app_label text primary key,
  category text not null default 'sin_clasificar',
  first_seen_at timestamptz not null default now()
);
