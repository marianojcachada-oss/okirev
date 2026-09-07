-- Corré esto en el SQL Editor de Supabase para sumar el botón 10-31 (break) a una base
-- que ya tenías creada.

alter table tracking_configs add column if not exists break_minutes integer not null default 15;
alter table employees add column if not exists break_minutes_override integer;
alter table settings add column if not exists default_break_minutes integer not null default 15;

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
