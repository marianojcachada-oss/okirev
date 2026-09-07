-- Corré esto en el SQL Editor de Supabase para sumar la configuración de trackeo
-- individual/por grupo a una base que ya tenías creada.

create table if not exists tracking_configs (
  id text primary key,
  name text not null unique,
  idle_threshold_minutes integer not null default 5
);
insert into tracking_configs (id, name, idle_threshold_minutes) values ('tc_default', 'Estándar', 5)
on conflict (id) do nothing;

alter table employees add column if not exists tracking_config_id text references tracking_configs(id);
alter table employees add column if not exists idle_threshold_minutes_override integer;
