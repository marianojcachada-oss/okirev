-- Corré esto en el SQL Editor de Supabase para sumar roles/permisos y el login del sitio a
-- una base que ya tenías creada de antes.

create table if not exists roles (
  id text primary key,
  name text not null unique,
  permissions text[] not null default '{}'
);
insert into roles (id, name, permissions) values
  ('r_admin', 'Administrador', array['inicio','tiempo-real','alertas','empleados','equipos','asistencia','actividades','catalogo','proyectos','informes-apps','informes-web','ajustes'])
on conflict (id) do nothing;

alter table employees add column if not exists role_id text references roles(id);

create table if not exists sessions (
  token text primary key,
  employee_id text not null references employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);
create index if not exists idx_sessions_employee on sessions(employee_id);

-- Importante: asigná el rol "Administrador" a tu propio usuario para poder entrar al panel
-- (reemplazá 'tu_usuario' por el username que uses vos):
-- update employees set role_id = 'r_admin' where username = 'tu_usuario';
