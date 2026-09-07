-- Corré esto en el SQL Editor de Supabase para sumar el registro de "desde qué computadora
-- se logueó cada operador".

create table if not exists employee_devices (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  hostname text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (employee_id, hostname)
);
create index if not exists idx_employee_devices_employee on employee_devices(employee_id);
